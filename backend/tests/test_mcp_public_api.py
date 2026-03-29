from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def _initialize_payload(request_id: int = 1) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "pytest", "version": "1.0"},
        },
    }


def test_public_mcp_disabled_returns_404(monkeypatch):
    monkeypatch.setattr(settings, "MCP_PUBLIC_ENABLED", False)
    monkeypatch.setattr(settings, "MCP_PUBLIC_BEARER_TOKEN", "")

    client = TestClient(app)
    response = client.get("/api/mcp/public/info")
    assert response.status_code == 404


def test_public_mcp_info_and_initialize(monkeypatch):
    monkeypatch.setattr(settings, "MCP_PUBLIC_ENABLED", True)
    monkeypatch.setattr(settings, "MCP_PUBLIC_BEARER_TOKEN", "")

    client = TestClient(app)

    info = client.get("/api/mcp/public/info")
    assert info.status_code == 200
    body = info.json()
    assert body["transport"] == "streamable-http-jsonrpc"
    assert body["tools_count"] >= 1

    init_response = client.post("/api/mcp/public", json=_initialize_payload())
    assert init_response.status_code == 200
    init_body = init_response.json()
    assert init_body["result"]["protocolVersion"] == "2024-11-05"
    assert init_body["result"]["serverInfo"]["name"] == "hr-kmg-platform-mcp"


def test_public_mcp_notification_returns_202(monkeypatch):
    monkeypatch.setattr(settings, "MCP_PUBLIC_ENABLED", True)
    monkeypatch.setattr(settings, "MCP_PUBLIC_BEARER_TOKEN", "")

    client = TestClient(app)
    response = client.post(
        "/api/mcp/public",
        json={
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {},
        },
    )
    assert response.status_code == 202


def test_public_mcp_auth_token(monkeypatch):
    monkeypatch.setattr(settings, "MCP_PUBLIC_ENABLED", True)
    monkeypatch.setattr(settings, "MCP_PUBLIC_BEARER_TOKEN", "demo-token")

    client = TestClient(app)

    unauthorized = client.post("/api/mcp/public", json=_initialize_payload())
    assert unauthorized.status_code == 401

    authorized = client.post(
        "/api/mcp/public",
        json=_initialize_payload(2),
        headers={"Authorization": "Bearer demo-token"},
    )
    assert authorized.status_code == 200
    assert authorized.json()["id"] == 2
