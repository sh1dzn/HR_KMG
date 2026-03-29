"""
Chat Service — AI Assistant with role-based context and RAG
"""
import logging
from typing import Optional, List, Dict
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.goal import Goal, GoalStatus
from app.models.employee import Employee
from app.models.department import Department
from app.models.chat import ChatConversation, ChatMessage, ChatMessageRole
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service

logger = logging.getLogger("hr_ai.chat")

MAX_CONTEXT_MESSAGES = 20

# ── Role-based system prompts ─────────────────────────────────────────────────

SYSTEM_PROMPT_EMPLOYEE = """Ты — AI-ассистент системы управления целями компании КМГ-Кумколь (Performance Goals).
Ты помогаешь сотруднику {employee_name} ({position}, {department}).

Твои возможности:
- Помочь сформулировать цель по методологии SMART
- Объяснить критерии оценки целей (Specific, Measurable, Achievable, Relevant, Time-bound)
- Найти и объяснить информацию из внутренних нормативных документов (ВНД)
- Помочь понять процесс согласования целей
- Подсказать, как улучшить формулировку цели

Контекст сотрудника:
{employee_context}

{rag_context}

Правила:
- Отвечай на русском языке
- Будь конкретным и полезным
- Ссылайся на ВНД когда это уместно
- Не выдумывай информацию — если не знаешь, скажи об этом
- Ты НЕ имеешь доступа к данным других сотрудников
"""

SYSTEM_PROMPT_MANAGER = """Ты — AI-ассистент системы управления целями компании КМГ-Кумколь (Performance Goals).
Ты помогаешь руководителю {employee_name} ({position}, {department}).

Твои возможности:
- Всё что доступно сотрудникам (SMART-формулировки, ВНД, процессы)
- Помочь с каскадированием целей на подчинённых
- Проанализировать статус целей команды
- Подсказать по процессу согласования и рецензирования
- Помочь подготовить повестку 1-on-1 встречи с сотрудником
- Дать рекомендации по распределению весов целей

Контекст руководителя:
{employee_context}

Статус команды:
{team_context}

{rag_context}

Правила:
- Отвечай на русском языке
- Будь конкретным и полезным
- Ссылайся на ВНД когда это уместно
- Не выдумывай информацию — если не знаешь, скажи об этом
- У тебя есть доступ к данным подчинённых сотрудников
"""

SYSTEM_PROMPT_ADMIN = """Ты — AI-ассистент системы управления целями компании КМГ-Кумколь (Performance Goals).
Ты помогаешь администратору {employee_name} ({position}, {department}).

Твои возможности:
- Всё что доступно руководителям и сотрудникам
- Общая аналитика по всем подразделениям
- Информация обо всех сотрудниках и их целях
- Помощь с настройкой системы и интеграциями
- Анализ качества целеполагания по компании
- Мониторинг рисков и алертов

Контекст администратора:
{employee_context}

Статистика системы:
{system_context}

{rag_context}

Правила:
- Отвечай на русском языке
- Будь конкретным и полезным
- Ссылайся на ВНД когда это уместно
- Не выдумывай информацию — если не знаешь, скажи об этом
- У тебя есть полный доступ ко всем данным системы
"""


def _get_employee_context(user: User, db: Session) -> str:
    """Build employee context string."""
    emp = user.employee
    if not emp:
        return "Информация о сотруднике недоступна."

    goals = db.query(Goal).filter(Goal.employee_id == emp.id).order_by(Goal.created_at.desc()).limit(10).all()
    goal_lines = []
    for g in goals:
        status_label = g.status.value if hasattr(g.status, 'value') else str(g.status)
        goal_lines.append(f"  - [{status_label}] {g.goal_text[:100]}")

    parts = [f"Имя: {emp.full_name}"]
    if emp.position:
        parts.append(f"Должность: {emp.position.name}")
    if emp.department:
        parts.append(f"Подразделение: {emp.department.name}")
    if goal_lines:
        parts.append(f"Текущие цели ({len(goals)}):")
        parts.extend(goal_lines)
    else:
        parts.append("Целей пока нет.")

    return "\n".join(parts)


def _get_team_context(user: User, db: Session) -> str:
    """Build team context for manager."""
    emp = user.employee
    if not emp:
        return "Информация о команде недоступна."

    subordinates = db.query(Employee).filter(Employee.manager_id == emp.id).all()
    if not subordinates:
        return "Прямых подчинённых нет."

    sub_ids = [s.id for s in subordinates]
    goals = db.query(Goal).filter(Goal.employee_id.in_(sub_ids)).all()

    status_counts = {}
    for g in goals:
        s = g.status.value if hasattr(g.status, 'value') else str(g.status)
        status_counts[s] = status_counts.get(s, 0) + 1

    lines = [f"Подчинённых: {len(subordinates)}", f"Целей команды: {len(goals)}"]
    if status_counts:
        lines.append("По статусам: " + ", ".join(f"{k}: {v}" for k, v in status_counts.items()))

    for sub in subordinates[:10]:
        sub_goals = [g for g in goals if g.employee_id == sub.id]
        pos = sub.position.name if sub.position else ""
        lines.append(f"  - {sub.full_name} ({pos}): {len(sub_goals)} целей")

    return "\n".join(lines)


def _get_system_context(db: Session) -> str:
    """Build system-wide context for admin."""
    total_employees = db.query(Employee).filter(Employee.is_active == True).count()
    total_goals = db.query(Goal).count()
    departments = db.query(Department).all()

    status_counts = {}
    for row in db.query(Goal.status).all():
        s = row[0].value if hasattr(row[0], 'value') else str(row[0])
        status_counts[s] = status_counts.get(s, 0) + 1

    lines = [
        f"Всего сотрудников: {total_employees}",
        f"Всего целей: {total_goals}",
        f"Подразделений: {len(departments)}",
    ]
    if status_counts:
        lines.append("Цели по статусам: " + ", ".join(f"{k}: {v}" for k, v in status_counts.items()))

    return "\n".join(lines)


def _get_rag_context(query: str) -> str:
    """Search ВНД documents relevant to the query."""
    try:
        results = rag_service.collection.query(
            query_texts=[query],
            n_results=3,
        )
        if not results or not results.get("documents") or not results["documents"][0]:
            return ""

        docs = results["documents"][0]
        metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(docs)

        lines = ["Релевантные фрагменты из ВНД:"]
        for i, (doc, meta) in enumerate(zip(docs, metadatas), 1):
            title = meta.get("title", "Документ") if isinstance(meta, dict) else "Документ"
            lines.append(f"\n--- Фрагмент {i} (из: {title}) ---\n{doc[:500]}")

        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"RAG search failed: {e}")
        return ""


def _build_system_prompt(user: User, db: Session, user_message: str) -> str:
    """Build role-based system prompt with context."""
    emp = user.employee
    employee_name = emp.full_name if emp else "Пользователь"
    position = emp.position.name if emp and emp.position else "—"
    department = emp.department.name if emp and emp.department else "—"

    employee_context = _get_employee_context(user, db)
    rag_context = _get_rag_context(user_message)

    role = user.role.value if hasattr(user.role, 'value') else str(user.role)

    if role == "admin":
        system_context = _get_system_context(db)
        return SYSTEM_PROMPT_ADMIN.format(
            employee_name=employee_name, position=position, department=department,
            employee_context=employee_context, system_context=system_context, rag_context=rag_context,
        )
    elif role == "manager":
        team_context = _get_team_context(user, db)
        return SYSTEM_PROMPT_MANAGER.format(
            employee_name=employee_name, position=position, department=department,
            employee_context=employee_context, team_context=team_context, rag_context=rag_context,
        )
    else:
        return SYSTEM_PROMPT_EMPLOYEE.format(
            employee_name=employee_name, position=position, department=department,
            employee_context=employee_context, rag_context=rag_context,
        )


async def generate_title(message: str, model: Optional[str] = None) -> str:
    """Generate a short conversation title from the first message."""
    try:
        title = await llm_service.complete(
            prompt=f"Придумай очень короткий заголовок (3-5 слов, без кавычек) для диалога, начинающегося с этого сообщения:\n\n{message[:200]}",
            system_prompt="Ты генерируешь короткие заголовки для чатов. Отвечай ТОЛЬКО заголовком, без кавычек и пояснений.",
            temperature=0.5,
            max_tokens=30,
            model=model,
        )
        return title.strip().strip('"\'')[:100]
    except Exception:
        return message[:50] + ("..." if len(message) > 50 else "")


async def chat_reply(
    user: User,
    db: Session,
    conversation: ChatConversation,
    user_message: str,
    model: Optional[str] = None,
) -> str:
    """Generate AI reply for a conversation."""
    system_prompt = _build_system_prompt(user, db, user_message)

    # Build message history
    history_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_CONTEXT_MESSAGES)
        .all()
    )
    history_messages.reverse()

    # Format as conversation for LLM
    messages_for_llm = [{"role": "system", "content": system_prompt}]
    for msg in history_messages:
        r = msg.role.value if hasattr(msg.role, 'value') else str(msg.role)
        messages_for_llm.append({"role": r, "content": msg.content})
    messages_for_llm.append({"role": "user", "content": user_message})

    # Call LLM directly with messages array
    import asyncio
    from app.services.llm_service import ALLOWED_MODELS

    use_model = llm_service.model
    if model and model in ALLOWED_MODELS:
        use_model = model

    kwargs = {
        "model": use_model,
        "messages": messages_for_llm,
        "temperature": 0.4,
        "max_tokens": 2000,
    }

    response = await asyncio.to_thread(llm_service.client.chat.completions.create, **kwargs)
    return response.choices[0].message.content
