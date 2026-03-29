from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import goals as goals_api
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import GoalStatus
from app.schemas.goal import GoalResponse


class FakeDB:
    def __init__(self):
        self.commit_calls = 0
        self.refresh_calls = 0

    def commit(self):
        self.commit_calls += 1

    def refresh(self, _obj):
        self.refresh_calls += 1


class FakeGoal:
    def __init__(self, status: GoalStatus):
        now = datetime.now(timezone.utc)
        self.goal_id = "goal-1"
        self.employee_id = 101
        self.goal_text = "Повысить покрытие KPI до 95% в Q2 2026"
        self.metric = "KPI coverage"
        self.weight = 25.0
        self.status = status
        self.quarter = "Q2"
        self.year = 2026
        self.created_at = now
        self.updated_at = now


def _serialize_goal_for_test(goal: FakeGoal) -> GoalResponse:
    return GoalResponse(
        id=str(goal.goal_id),
        employee_id=goal.employee_id,
        title=goal.goal_text,
        description=None,
        metric=goal.metric,
        deadline=None,
        weight=float(goal.weight),
        status=goals_api._status_value(goal.status),
        quarter=goal.quarter,
        year=goal.year,
        smart_score=0.82,
        smart_details={},
        goal_type="output",
        strategic_link="strategic",
        source_document_id=None,
        external_ref=None,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        employee_name="Test Employee",
        department_name="Test Department",
        position_name="Engineer",
        manager_id=None,
        manager_name=None,
        alerts=[],
    )


def _make_client(fake_db: FakeDB, user: SimpleNamespace) -> TestClient:
    app = FastAPI()
    app.include_router(goals_api.router, prefix="/api/goals")
    app.dependency_overrides[get_db] = lambda: fake_db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def _patch_goal_dependencies(monkeypatch, goal: FakeGoal):
    monkeypatch.setattr(goals_api, "_load_goal_or_404", lambda _db, _goal_id: goal)
    monkeypatch.setattr(
        goals_api,
        "_resolve_action_actor",
        lambda _db, _goal, _actor_id, prefer_manager=False: SimpleNamespace(id=101),
    )
    monkeypatch.setattr(goals_api, "_record_goal_event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(goals_api, "load_generation_metadata", lambda _db, _ids: {})
    monkeypatch.setattr(goals_api, "_serialize_goal", lambda _db, g, metadata=None: _serialize_goal_for_test(g))


def test_move_goal_status_success(monkeypatch):
    fake_db = FakeDB()
    user = SimpleNamespace(role="employee", employee_id=101)
    client = _make_client(fake_db, user)
    goal = FakeGoal(status=GoalStatus.DRAFT)
    _patch_goal_dependencies(monkeypatch, goal)

    response = client.post("/api/goals/goal-1/move", json={"target_status": "in_progress"})

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Статус цели обновлён"
    assert data["goal"]["status"] == "in_progress"
    assert goal.status == GoalStatus.IN_PROGRESS
    assert fake_db.commit_calls == 1


def test_move_goal_status_rejects_employee_move_to_approved(monkeypatch):
    fake_db = FakeDB()
    user = SimpleNamespace(role="employee", employee_id=101)
    client = _make_client(fake_db, user)
    goal = FakeGoal(status=GoalStatus.DRAFT)
    _patch_goal_dependencies(monkeypatch, goal)

    response = client.post("/api/goals/goal-1/move", json={"target_status": "approved"})

    assert response.status_code == 400
    assert "Недопустимый целевой статус" in response.json()["detail"]
    assert fake_db.commit_calls == 0
    assert goal.status == GoalStatus.DRAFT


def test_complete_goal_success(monkeypatch):
    fake_db = FakeDB()
    user = SimpleNamespace(role="employee", employee_id=101)
    client = _make_client(fake_db, user)
    goal = FakeGoal(status=GoalStatus.IN_PROGRESS)
    _patch_goal_dependencies(monkeypatch, goal)

    response = client.post("/api/goals/goal-1/complete", json={})

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Цель выполнена"
    assert data["goal"]["status"] == "done"
    assert goal.status == GoalStatus.DONE
    assert fake_db.commit_calls == 1
