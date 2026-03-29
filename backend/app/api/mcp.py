"""
Public remote MCP endpoint (HTTP JSON-RPC) for external AI clients.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Header, HTTPException, Response, status
from fastapi.responses import JSONResponse

from app.config import settings
from app.mcp.server import PROTOCOL_VERSION, SERVER_INFO, TOOLS, handle_jsonrpc_message


router = APIRouter()


def _require_public_mcp_access(authorization: str | None, x_mcp_key: str | None) -> None:
    if not settings.MCP_PUBLIC_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP endpoint is disabled")

    token = (settings.MCP_PUBLIC_BEARER_TOKEN or "").strip()
    if not token:
        return

    bearer_token = ""
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer":
            bearer_token = value.strip()

    if bearer_token != token and (x_mcp_key or "").strip() != token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MCP credentials")


def _process_single_jsonrpc_message(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32600, "message": "Invalid Request"},
        }

    response = handle_jsonrpc_message(payload)
    if response is not None and "id" in payload:
        return response
    return None


@router.get("/public")
def public_mcp_get_stream(
    authorization: str | None = Header(default=None),
    x_mcp_key: str | None = Header(default=None),
):
    _require_public_mcp_access(authorization, x_mcp_key)
    # Streamable HTTP allows servers without SSE support to return 405 for GET.
    return Response(status_code=status.HTTP_405_METHOD_NOT_ALLOWED)


@router.get("/public/info")
def public_mcp_info(
    authorization: str | None = Header(default=None),
    x_mcp_key: str | None = Header(default=None),
):
    _require_public_mcp_access(authorization, x_mcp_key)
    return {
        "name": SERVER_INFO["name"],
        "version": SERVER_INFO["version"],
        "protocol_version": PROTOCOL_VERSION,
        "transport": "streamable-http-jsonrpc",
        "rpc_endpoint": "/api/mcp/public",
        "tools_count": len(TOOLS),
        "tools": [tool["name"] for tool in TOOLS],
        "auth": "bearer_or_x-mcp-key" if settings.MCP_PUBLIC_BEARER_TOKEN else "none",
    }


def _handle_public_mcp_rpc(payload: Any):
    if isinstance(payload, list):
        responses = []
        for message in payload:
            response = _process_single_jsonrpc_message(message)
            if response is not None:
                responses.append(response)

        if not responses:
            return Response(status_code=status.HTTP_202_ACCEPTED)
        return JSONResponse(content=responses)

    response = _process_single_jsonrpc_message(payload)
    if response is None:
        return Response(status_code=status.HTTP_202_ACCEPTED)
    return JSONResponse(content=response)


@router.post("/public")
def public_mcp_rpc(
    payload: Any = Body(...),
    authorization: str | None = Header(default=None),
    x_mcp_key: str | None = Header(default=None),
):
    _require_public_mcp_access(authorization, x_mcp_key)
    return _handle_public_mcp_rpc(payload)


@router.post("/public/rpc")
def public_mcp_rpc_legacy(
    payload: Any = Body(...),
    authorization: str | None = Header(default=None),
    x_mcp_key: str | None = Header(default=None),
):
    _require_public_mcp_access(authorization, x_mcp_key)
    return _handle_public_mcp_rpc(payload)
