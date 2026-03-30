"""
Database tools for AI Chat Assistant — function calling interface.
AI calls these tools on demand instead of getting all data upfront.
"""
import json
from typing import Optional
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.goal import Goal
from app.models.department import Department
from app.models.document import Document
from app.models.user import User
from app.services.rag_service import rag_service


# ── Tool definitions (OpenAI function calling format) ────────────────────────

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": "Поиск по внутренним нормативным документам (ВНД) компании. Используй для любых вопросов о правилах, регламентах, стратегии, KPI.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Поисковый запрос по документам"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_stats",
            "description": "Получить статистику по подразделению: количество сотрудников, целей, статусы. Без аргумента — все подразделения.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department_name": {"type": "string", "description": "Название подразделения (или часть). Пусто = все."}
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_employee",
            "description": "Найти сотрудника по имени. Возвращает его данные, должность, отдел, руководителя и цели.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Имя или фамилия сотрудника"}
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_goals_by_status",
            "description": "Получить список целей по статусу (draft, submitted, approved, in_progress, done). Можно фильтровать по подразделению.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Статус: draft, submitted, approved, in_progress, done"},
                    "department_name": {"type": "string", "description": "Фильтр по подразделению (опционально)"},
                    "limit": {"type": "integer", "description": "Максимум записей (по умолчанию 20)"},
                },
                "required": ["status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_documents",
            "description": "Показать список всех документов ВНД в базе с типами и ключевыми словами.",
            "parameters": {
                "type": "object",
                "properties": {
                    "doc_type": {"type": "string", "description": "Фильтр по типу: vnd, strategy, kpi_framework, policy, regulation, instruction, standard"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_document_content",
            "description": "Получить полное содержимое конкретного документа ВНД по его названию.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Название документа (или часть)"}
                },
                "required": ["title"],
            },
        },
    },
]


# ── Tool execution ───────────────────────────────────────────────────────────

def _status_val(s):
    return s.value if hasattr(s, 'value') else str(s)


async def execute_tool(tool_name: str, args: dict, user: User, db: Session) -> str:
    """Execute a tool call and return result as string."""
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)

    if tool_name == "search_documents":
        return await _tool_search_documents(args.get("query", ""), db)

    elif tool_name == "get_department_stats":
        return _tool_department_stats(args.get("department_name"), user, db, role)

    elif tool_name == "find_employee":
        return _tool_find_employee(args.get("name", ""), user, db, role)

    elif tool_name == "get_goals_by_status":
        return _tool_goals_by_status(args.get("status", ""), args.get("department_name"), args.get("limit", 20), user, db, role)

    elif tool_name == "list_documents":
        return _tool_list_documents(args.get("doc_type"), db)

    elif tool_name == "get_document_content":
        return _tool_get_document_content(args.get("title", ""), db)

    return "Неизвестный инструмент."


async def _tool_search_documents(query: str, db: Session) -> str:
    try:
        results = await rag_service.search(query=query, n_results=5)
        if not results:
            return "По запросу ничего не найдено в ВНД."
        lines = []
        for i, item in enumerate(results[:5], 1):
            meta = item.get("metadata", {}) if isinstance(item, dict) else {}
            title = meta.get("title", "Документ")
            doc = item.get("content", "")
            lines.append(f"--- {title} ---\n{doc[:600]}")
        return "\n\n".join(lines)
    except Exception:
        return "Ошибка поиска документов."


def _tool_department_stats(dept_name: Optional[str], user: User, db: Session, role: str) -> str:
    departments = db.query(Department).filter(Department.is_active == True).all()
    if dept_name:
        departments = [d for d in departments if dept_name.lower() in d.name.lower()]
    if not departments:
        return "Подразделение не найдено."

    employees = db.query(Employee).filter(Employee.is_active == True).all()
    goals = db.query(Goal).all()

    lines = []
    for dept in departments:
        dept_emps = [e for e in employees if e.department_id == dept.id]
        emp_ids = {e.id for e in dept_emps}
        dept_goals = [g for g in goals if g.employee_id in emp_ids]
        status_counts = {}
        for g in dept_goals:
            s = _status_val(g.status)
            status_counts[s] = status_counts.get(s, 0) + 1
        lines.append(f"{dept.name}: {len(dept_emps)} сотр., {len(dept_goals)} целей | {', '.join(f'{k}: {v}' for k, v in status_counts.items())}")
    return "\n".join(lines)


def _tool_find_employee(name: str, user: User, db: Session, role: str) -> str:
    emps = db.query(Employee).filter(
        Employee.is_active == True,
        Employee.full_name.ilike(f"%{name}%"),
    ).limit(5).all()
    if not emps:
        return f"Сотрудник '{name}' не найден."

    # Access control
    if role == "employee":
        emps = [e for e in emps if e.id == user.employee_id]
        if not emps:
            return "У вас нет доступа к данным этого сотрудника."

    lines = []
    for emp in emps:
        pos = emp.position.name if emp.position else "—"
        dept = emp.department.name if emp.department else "—"
        mgr = emp.manager.full_name if emp.manager else "—"
        goals = db.query(Goal).filter(Goal.employee_id == emp.id).all()
        goal_lines = []
        for g in goals[:10]:
            s = _status_val(g.status)
            metric = g.metric or "—"
            w = g.weight or 0
            goal_lines.append(f"  [{s}] {g.goal_text[:120]} | Показатель: {metric} | Вес: {w}%")
        lines.append(f"{emp.full_name}\n  Должность: {pos}\n  Подразделение: {dept}\n  Руководитель: {mgr}\n  Целей: {len(goals)}")
        lines.extend(goal_lines)
    return "\n".join(lines)


def _tool_goals_by_status(status: str, dept_name: Optional[str], limit: int, user: User, db: Session, role: str) -> str:
    query = db.query(Goal).filter(Goal.status == status)

    if role == "employee":
        query = query.filter(Goal.employee_id == user.employee_id)
    elif role == "manager" and user.employee:
        sub_ids = [s.id for s in user.employee.subordinates]
        allowed = [user.employee_id] + sub_ids
        query = query.filter(Goal.employee_id.in_(allowed))

    goals = query.limit(min(limit or 20, 50)).all()

    if dept_name:
        dept_emp_ids = {e.id for e in db.query(Employee).filter(Employee.is_active == True).all()
                        if e.department and dept_name.lower() in e.department.name.lower()}
        goals = [g for g in goals if g.employee_id in dept_emp_ids]

    if not goals:
        return f"Целей со статусом '{status}' не найдено."

    lines = [f"Цели со статусом '{status}' ({len(goals)}):"]
    for g in goals:
        emp = g.employee
        name = emp.full_name if emp else "—"
        lines.append(f"  {name}: {g.goal_text[:100]}")
    return "\n".join(lines)


def _tool_list_documents(doc_type: Optional[str], db: Session) -> str:
    query = db.query(Document).filter(Document.is_active == True)
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    docs = query.order_by(Document.title).all()
    if not docs:
        return "Документов не найдено."
    lines = [f"Документы ВНД ({len(docs)}):"]
    for doc in docs:
        dt = doc.doc_type.value if hasattr(doc.doc_type, 'value') else str(doc.doc_type)
        kw = doc.get_keywords_list()
        kw_str = f" [{', '.join(kw[:3])}]" if kw else ""
        lines.append(f"  {doc.title} ({dt}){kw_str}")
    return "\n".join(lines)


def _tool_get_document_content(title: str, db: Session) -> str:
    doc = db.query(Document).filter(
        Document.is_active == True,
        Document.title.ilike(f"%{title}%"),
    ).first()
    if not doc:
        return f"Документ '{title}' не найден."
    content = (doc.content or "")[:3000]
    dt = doc.doc_type.value if hasattr(doc.doc_type, 'value') else str(doc.doc_type)
    return f"=== {doc.title} ({dt}) ===\n{content}"
