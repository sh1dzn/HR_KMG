"""
External MCP server (stdio JSON-RPC) for HR KMG platform data.

Run:
    python -m app.mcp.server
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from typing import Any, Callable

from app.database import SessionLocal, engine
from app.services.platform_mcp_service import (
    build_mcp_context,
    find_user_for_mcp,
    get_employee_goals_data,
    get_org_summary_data,
    get_problem_departments_data,
    get_top_employees_data,
)
try:
    from app.services.rag_service import rag_service
except Exception:  # pragma: no cover - optional dependency in minimal envs
    rag_service = None


logger = logging.getLogger("hr_ai.mcp")
engine.echo = False
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("chromadb").setLevel(logging.WARNING)

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "hr-kmg-platform-mcp", "version": "1.0.0"}


class MCPToolError(Exception):
    def __init__(self, message: str, *, code: int = -32000, data: Any = None):
        super().__init__(message)
        self.code = code
        self.data = data


def _write_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _error_response(request_id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


def _ok_response(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _tool_result(data: Any) -> dict[str, Any]:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    return {
        "content": [{"type": "text", "text": text}],
        "structuredContent": data,
        "isError": False,
    }


def _role_value(user: Any) -> str:
    role = getattr(user, "role", "employee")
    return role.value if hasattr(role, "value") else str(role)


def _resolve_user(arguments: dict[str, Any], db) -> Any:
    user = find_user_for_mcp(
        db,
        user_email=arguments.get("user_email"),
        user_id=arguments.get("user_id"),
        employee_id=arguments.get("user_employee_id"),
    )
    if user is None:
        raise MCPToolError(
            "User not found. Pass one of: user_email, user_id, user_employee_id.",
            code=-32001,
        )
    return user


def _tool_platform_context(arguments: dict[str, Any], db) -> dict[str, Any]:
    user = _resolve_user(arguments, db)
    query = str(arguments.get("query", "") or "")
    return {
        "requester": {
            "user_id": str(user.id),
            "email": user.email,
            "role": _role_value(user),
            "employee_id": user.employee_id,
        },
        "context_markdown": build_mcp_context(user, db, query),
    }


def _tool_org_summary(arguments: dict[str, Any], db) -> dict[str, Any]:
    user = _resolve_user(arguments, db)
    query = str(arguments.get("query", "") or "")
    quarter = arguments.get("quarter")
    year = arguments.get("year")
    if year is not None:
        year = int(year)
    return get_org_summary_data(user, db, query=query, quarter=quarter, year=year)


def _tool_problem_departments(arguments: dict[str, Any], db) -> dict[str, Any]:
    user = _resolve_user(arguments, db)
    query = str(arguments.get("query", "") or "")
    quarter = arguments.get("quarter")
    year = arguments.get("year")
    limit = int(arguments.get("limit", 5))
    if year is not None:
        year = int(year)
    return get_problem_departments_data(
        user,
        db,
        query=query,
        quarter=quarter,
        year=year,
        limit=limit,
    )


def _tool_top_employees(arguments: dict[str, Any], db) -> dict[str, Any]:
    user = _resolve_user(arguments, db)
    query = str(arguments.get("query", "") or "")
    quarter = arguments.get("quarter")
    year = arguments.get("year")
    limit = int(arguments.get("limit", 5))
    if year is not None:
        year = int(year)
    return get_top_employees_data(
        user,
        db,
        query=query,
        quarter=quarter,
        year=year,
        limit=limit,
    )


def _tool_employee_goals(arguments: dict[str, Any], db) -> dict[str, Any]:
    user = _resolve_user(arguments, db)
    employee_id = arguments.get("employee_id")
    if employee_id is not None:
        employee_id = int(employee_id)
    query = str(arguments.get("query", "") or "")
    quarter = arguments.get("quarter")
    year = arguments.get("year")
    limit = int(arguments.get("limit", 20))
    if year is not None:
        year = int(year)
    return get_employee_goals_data(
        user,
        db,
        employee_id=employee_id,
        query=query,
        quarter=quarter,
        year=year,
        limit=limit,
    )


def _tool_search_documents(arguments: dict[str, Any], db) -> dict[str, Any]:
    user = _resolve_user(arguments, db)
    query = str(arguments.get("query", "") or "").strip()
    if not query:
        raise MCPToolError("query is required", code=-32602)

    n_results = int(arguments.get("n_results", 5))
    doc_type = arguments.get("doc_type")

    role = _role_value(user)
    department = None
    if role != "admin" and user.employee and user.employee.department:
        department = user.employee.department.name

    if rag_service is None:
        raise MCPToolError("Document search is unavailable: RAG service is not configured.", code=-32010)

    results = asyncio.run(
        rag_service.search(
            query=query,
            n_results=max(1, min(n_results, 10)),
            department=department,
            doc_type=doc_type,
        )
    )

    compact = []
    for item in results:
        metadata = item.get("metadata", {}) if isinstance(item, dict) else {}
        compact.append(
            {
                "content": (item.get("content") or "")[:1200],
                "metadata": metadata,
                "relevance_score": item.get("relevance_score"),
                "search_method": item.get("search_method"),
            }
        )

    return {
        "department_scope": department or "ALL",
        "items": compact,
        "count": len(compact),
    }


TOOL_HANDLERS: dict[str, Callable[[dict[str, Any], Any], dict[str, Any]]] = {
    "platform.context": _tool_platform_context,
    "platform.org_summary": _tool_org_summary,
    "platform.problem_departments": _tool_problem_departments,
    "platform.top_employees": _tool_top_employees,
    "platform.employee_goals": _tool_employee_goals,
    "platform.search_documents": _tool_search_documents,
}


TOOLS = [
    {
        "name": "platform.context",
        "description": "Role-aware MCP context for natural-language query (summary + relevant blocks).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string"},
                "user_id": {"type": "string"},
                "user_employee_id": {"type": "integer"},
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "platform.org_summary",
        "description": "Organization/team summary with goals by status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string"},
                "user_id": {"type": "string"},
                "user_employee_id": {"type": "integer"},
                "query": {"type": "string"},
                "quarter": {"type": "string", "enum": ["Q1", "Q2", "Q3", "Q4"]},
                "year": {"type": "integer"},
            },
        },
    },
    {
        "name": "platform.problem_departments",
        "description": "Top departments by goal quality risk score.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string"},
                "user_id": {"type": "string"},
                "user_employee_id": {"type": "integer"},
                "query": {"type": "string"},
                "quarter": {"type": "string", "enum": ["Q1", "Q2", "Q3", "Q4"]},
                "year": {"type": "integer"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "platform.top_employees",
        "description": "Top performers by completion-focused score.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string"},
                "user_id": {"type": "string"},
                "user_employee_id": {"type": "integer"},
                "query": {"type": "string"},
                "quarter": {"type": "string", "enum": ["Q1", "Q2", "Q3", "Q4"]},
                "year": {"type": "integer"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "platform.employee_goals",
        "description": "List goals for a specific employee within requester access scope.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string"},
                "user_id": {"type": "string"},
                "user_employee_id": {"type": "integer"},
                "employee_id": {"type": "integer"},
                "query": {"type": "string"},
                "quarter": {"type": "string", "enum": ["Q1", "Q2", "Q3", "Q4"]},
                "year": {"type": "integer"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
        },
    },
    {
        "name": "platform.search_documents",
        "description": "Search internal documents (RAG) with role-based department scope.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string"},
                "user_id": {"type": "string"},
                "user_employee_id": {"type": "integer"},
                "query": {"type": "string"},
                "n_results": {"type": "integer", "minimum": 1, "maximum": 10},
                "doc_type": {"type": "string"},
            },
            "required": ["query"],
        },
    },
]


def handle_jsonrpc_message(message: dict[str, Any]) -> dict[str, Any] | None:
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}

    if method == "initialize":
        return _ok_response(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            },
        )
    if method == "notifications/initialized":
        return None
    if method == "ping":
        return _ok_response(request_id, {})
    if method == "tools/list":
        return _ok_response(request_id, {"tools": TOOLS})
    if method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments") or {}
        handler = TOOL_HANDLERS.get(tool_name)
        if handler is None:
            return _ok_response(
                request_id,
                {
                    "content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}],
                    "isError": True,
                },
            )

        db = SessionLocal()
        try:
            data = handler(arguments, db)
            return _ok_response(request_id, _tool_result(data))
        except MCPToolError as exc:
            return _ok_response(
                request_id,
                {
                    "content": [{"type": "text", "text": str(exc)}],
                    "isError": True,
                    "error": {"code": exc.code, "message": str(exc), "data": exc.data},
                },
            )
        finally:
            db.close()

    return _error_response(request_id, -32601, f"Method not found: {method}")


def main() -> int:
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            _write_json(_error_response(None, -32700, "Parse error", {"details": str(exc)}))
            continue

        if not isinstance(message, dict):
            _write_json(_error_response(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid Request"))
            continue

        try:
            response = handle_jsonrpc_message(message)
            if response is not None and "id" in message:
                _write_json(response)
        except Exception as exc:
            logger.exception("Unhandled MCP server error: %s", exc)
            _write_json(_error_response(message.get("id"), -32603, "Internal error", {"details": str(exc)}))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
