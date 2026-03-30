"""
Chat Service — AI Assistant with role-based context and RAG
"""
import logging
import re
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.goal import Goal
from app.models.employee import Employee
from app.models.department import Department
from app.models.document import Document
from app.models.chat import ChatConversation, ChatMessage
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service
from app.services.platform_mcp_service import (
    build_mcp_context,
    get_top_departments_data,
    get_top_employees_data,
)

logger = logging.getLogger("hr_ai.chat")

MAX_CONTEXT_MESSAGES = 20
TOKEN_FOOTER_PATTERN = re.compile(
    r"(?:\n\n(?:---\n)?`(?:Токены: вход \d+, выход \d+, всего \d+|токены \d+/\d+/\d+)`\s*)+$"
)

# ── Role-based system prompts ─────────────────────────────────────────────────

SYSTEM_PROMPT_EMPLOYEE = """Ты — AI-ассистент системы управления целями компании КМГ-Кумколь (Performance Goals).
Ты помогаешь сотруднику {employee_name} ({position}, {department}).

Твои возможности:
- Помочь сформулировать цель по методологии SMART
- Объяснить критерии оценки целей (Specific, Measurable, Achievable, Relevant, Time-bound)
- Найти и объяснить информацию из внутренних нормативных документов (ВНД) — ТЫ ИМЕЕШЬ ПОЛНЫЙ ДОСТУП к ВНД
- Помочь понять процесс согласования целей
- Подсказать, как улучшить формулировку цели

ВАЖНО: У тебя ЕСТЬ доступ к базе ВНД документов компании. Ниже приведён каталог документов и релевантные фрагменты. Используй их для ответа. Никогда не говори "у меня нет доступа к документам" — ты их видишь.

Контекст сотрудника:
{employee_context}

{documents_catalog}

{rag_context}

Правила:
- Отвечай на русском языке
- Форматируй ответ в Markdown (заголовки, списки, таблицы, когда уместно)
- Будь конкретным и полезным
- Всегда ссылайся на конкретный документ ВНД при цитировании
- Используй данные из каталога документов и фрагментов ВНД для ответов
- Используй MCP-контекст платформы для фактов и цифр
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

ВАЖНО: У тебя ЕСТЬ полный доступ к базе ВНД документов компании. Ниже приведён каталог и релевантные фрагменты. Никогда не говори "у меня нет доступа к документам".

Контекст руководителя:
{employee_context}

Статус команды:
{team_context}

{documents_catalog}

{rag_context}

Правила:
- Отвечай на русском языке
- Форматируй ответ в Markdown (заголовки, списки, таблицы, когда уместно)
- Будь конкретным и полезным
- Всегда ссылайся на конкретный документ ВНД при цитировании
- Используй данные из каталога документов и фрагментов ВНД для ответов
- Используй MCP-контекст платформы для фактов и цифр
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

ВАЖНО: У тебя ЕСТЬ полный доступ ко ВСЕМ данным системы, включая ВНД документы, всех сотрудников, все цели и аналитику. Ниже приведён каталог документов и релевантные фрагменты. Никогда не говори "у меня нет доступа" — ты видишь все данные.

Контекст администратора:
{employee_context}

Статистика системы:
{system_context}

{documents_catalog}

{rag_context}

Правила:
- Отвечай на русском языке
- Форматируй ответ в Markdown (заголовки, списки, таблицы, когда уместно)
- Будь конкретным и полезным
- Всегда ссылайся на конкретный документ ВНД при цитировании
- Используй данные из каталога документов и фрагментов ВНД для ответов
- Используй MCP-контекст платформы для фактов и цифр
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


def _get_documents_catalog(db: Session) -> str:
    """Load all active ВНД documents catalog for the AI to know what's available."""
    docs = db.query(Document).filter(Document.is_active == True).order_by(Document.title).all()
    if not docs:
        return ""

    lines = [f"Каталог документов ВНД компании ({len(docs)} документов):"]
    for doc in docs:
        doc_type = doc.doc_type.value if hasattr(doc.doc_type, 'value') else str(doc.doc_type)
        keywords = doc.get_keywords_list()
        kw_str = f" [{', '.join(keywords[:5])}]" if keywords else ""
        content_preview = (doc.content or "")[:200].replace("\n", " ")
        lines.append(f"  - {doc.title} ({doc_type}){kw_str}: {content_preview}")

    return "\n".join(lines)


async def _get_rag_context(query: str) -> str:
    """Search ВНД documents relevant to the query."""
    try:
        results = await rag_service.search(query=query, n_results=5)
        if not results:
            return ""

        lines = ["Найденные фрагменты из ВНД по запросу:"]
        for i, item in enumerate(results[:5], 1):
            meta = item.get("metadata", {}) if isinstance(item, dict) else {}
            title = meta.get("title", "Документ") if isinstance(meta, dict) else "Документ"
            doc = item.get("content", "") if isinstance(item, dict) else ""
            lines.append(f"\n--- Фрагмент {i} (из: {title}) ---\n{doc[:800]}")

        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"RAG search failed: {e}")
        return ""


async def _build_system_prompt(user: User, db: Session, user_message: str) -> str:
    """Build role-based system prompt with context."""
    emp = user.employee
    employee_name = emp.full_name if emp else "Пользователь"
    position = emp.position.name if emp and emp.position else "—"
    department = emp.department.name if emp and emp.department else "—"

    employee_context = _get_employee_context(user, db)
    rag_context = await _get_rag_context(user_message)
    mcp_context = build_mcp_context(user, db, user_message)
    documents_catalog = _get_documents_catalog(db)

    data_context_parts = []
    if rag_context:
        data_context_parts.append(rag_context)
    if mcp_context:
        data_context_parts.append(f"Актуальные данные платформы (MCP):\n{mcp_context}")
    data_context = "\n\n".join(data_context_parts)

    role = user.role.value if hasattr(user.role, 'value') else str(user.role)

    if role == "admin":
        system_context = _get_system_context(db)
        return SYSTEM_PROMPT_ADMIN.format(
            employee_name=employee_name, position=position, department=department,
            employee_context=employee_context, system_context=system_context,
            documents_catalog=documents_catalog, rag_context=data_context,
        )
    elif role == "manager":
        team_context = _get_team_context(user, db)
        return SYSTEM_PROMPT_MANAGER.format(
            employee_name=employee_name, position=position, department=department,
            employee_context=employee_context, team_context=team_context,
            documents_catalog=documents_catalog, rag_context=data_context,
        )
    else:
        return SYSTEM_PROMPT_EMPLOYEE.format(
            employee_name=employee_name, position=position, department=department,
            employee_context=employee_context, documents_catalog=documents_catalog,
            rag_context=data_context,
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


def _format_usage_footer(usage: Dict[str, int]) -> str:
    input_tokens = int(usage.get("input_tokens", 0))
    output_tokens = int(usage.get("output_tokens", 0))
    total_tokens = int(usage.get("total_tokens", input_tokens + output_tokens))
    return f"\n\n`токены {input_tokens}/{output_tokens}/{total_tokens}`"


def _strip_usage_footers(content: str) -> str:
    return TOKEN_FOOTER_PATTERN.sub("", content or "").rstrip()


def _period_label(period: Dict[str, Any]) -> str:
    quarter = period.get("quarter") if isinstance(period, dict) else None
    year = period.get("year") if isinstance(period, dict) else None
    return f"{quarter or 'ALL'} {year or 'ALL'}"


def _looks_like_top_department_query(text: str) -> bool:
    q = (text or "").lower()
    best_words = ("лучший", "топ", "лидер", "сильн", "эффективн", "кто лучше", "кто лучший")
    department_words = ("департамент", "подраздел", "отдел", "команд")
    return any(word in q for word in best_words) and any(word in q for word in department_words)


def _looks_like_top_employee_query(text: str) -> bool:
    q = (text or "").lower()
    best_words = ("лучший", "топ", "лидер", "сильн", "эффективн", "кто лучше", "кто лучший")
    employee_words = ("сотруд", "работник", "персонал", "человек")
    return any(word in q for word in best_words) and any(word in q for word in employee_words)


def _render_top_departments_reply(data: Dict[str, Any]) -> str:
    if data.get("access_denied"):
        return "### Доступ к данным\nНедостаточно прав для сравнения подразделений."

    items = data.get("items") or []
    if not items:
        return "### Лучший департамент\nНедостаточно данных для ранжирования по выбранному периоду."

    leader = items[0]
    period = _period_label(data.get("period") or {})
    lines = [
        "### Лучший департамент",
        (
            f"По объективному индексу выполнения за период **{period}** лидер: "
            f"**{leader['department_name']}** (score **{leader['score']:.2f}**)."
        ),
        "",
        "Метрика: `score = completion_rate - 0.6 * overdue_rate - 0.2 * draft_rate`.",
        "",
        "| Подразделение | Score | Completion | Overdue | Draft | Целей |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for item in items[:5]:
        lines.append(
            f"| {item['department_name']} | {item['score']:.2f} | "
            f"{item['completion_rate'] * 100:.1f}% | {item['overdue_rate'] * 100:.1f}% | "
            f"{item['draft_rate'] * 100:.1f}% | {item['goals']} |"
        )
    return "\n".join(lines)


def _render_top_employees_reply(data: Dict[str, Any]) -> str:
    if data.get("access_denied"):
        return "### Доступ к данным\nНедостаточно прав для сравнения сотрудников."

    items = data.get("items") or []
    if not items:
        return "### Лучший сотрудник\nНедостаточно данных для ранжирования по выбранному периоду."

    leader = items[0]
    period = _period_label(data.get("period") or {})
    lines = [
        "### Лучший сотрудник",
        (
            f"По объективному индексу выполнения за период **{period}** лидер: "
            f"**{leader['full_name']}** (score **{leader['score']:.2f}**)."
        ),
        "",
        "Метрика: `score = completion_rate - 0.5 * overdue_rate`.",
        "",
        "| Сотрудник | Score | Completion | Overdue | Целей |",
        "|---|---:|---:|---:|---:|",
    ]
    for item in items[:5]:
        lines.append(
            f"| {item['full_name']} | {item['score']:.2f} | "
            f"{item['completion_rate'] * 100:.1f}% | {item['overdue_rate'] * 100:.1f}% | {item['goals']} |"
        )
    return "\n".join(lines)


def _try_direct_data_reply(user: User, db: Session, user_message: str) -> Optional[str]:
    if _looks_like_top_department_query(user_message):
        data = get_top_departments_data(user, db, query=user_message, limit=5)
        return _render_top_departments_reply(data)
    if _looks_like_top_employee_query(user_message):
        data = get_top_employees_data(user, db, query=user_message, limit=5)
        return _render_top_employees_reply(data)
    return None


async def chat_reply(
    user: User,
    db: Session,
    conversation: ChatConversation,
    user_message: str,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate AI reply for a conversation."""
    direct_reply = _try_direct_data_reply(user, db, user_message)
    if direct_reply:
        usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        return {
            "content": f"{direct_reply}{_format_usage_footer(usage)}",
            "usage": usage,
            "model": "internal-analytics",
        }

    system_prompt = await _build_system_prompt(user, db, user_message)

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
        content = msg.content
        if r == "assistant":
            content = _strip_usage_footers(content)
        messages_for_llm.append({"role": r, "content": content})
    messages_for_llm.append({"role": "user", "content": user_message})

    llm_result = await llm_service.complete_messages_with_usage(
        messages=messages_for_llm,
        temperature=0.4,
        max_tokens=2000,
        model=model,
    )
    content = (llm_result.get("content") or "").strip()
    if not content:
        content = "Не удалось сформировать ответ."

    usage = llm_result.get("usage") or {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    content = f"{content}{_format_usage_footer(usage)}"
    return {
        "content": content,
        "usage": usage,
        "model": llm_result.get("model"),
    }
