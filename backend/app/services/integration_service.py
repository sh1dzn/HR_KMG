"""
Mock integration service for exporting goals to external HR systems.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import Employee, Goal, GoalStatus
from app.schemas.integration import (
    GoalExportReference,
    GoalsExportRequest,
    GoalsExportResponse,
    IntegrationSystemInfo,
    IntegrationSystemsResponse,
)


class IntegrationService:
    SYSTEMS = {
        "1c": IntegrationSystemInfo(
            code="1c",
            name="1C:ЗУП / HR",
            description="Экспорт целей в формат кадрового контура 1С.",
            status="mock_ready",
        ),
        "sap": IntegrationSystemInfo(
            code="sap",
            name="SAP SuccessFactors",
            description="Экспорт целей в формат SAP SuccessFactors.",
            status="mock_ready",
        ),
        "oracle": IntegrationSystemInfo(
            code="oracle",
            name="Oracle HCM",
            description="Экспорт целей в формат Oracle HCM.",
            status="mock_ready",
        ),
    }

    def list_systems(self) -> IntegrationSystemsResponse:
        return IntegrationSystemsResponse(systems=list(self.SYSTEMS.values()))

    def export_goals(self, db: Session, request: GoalsExportRequest) -> GoalsExportResponse:
        system = self.SYSTEMS.get(request.target_system.lower())
        if not system:
            raise ValueError("Неподдерживаемая система интеграции")

        employee = db.query(Employee).filter(Employee.id == request.employee_id).first()
        if not employee:
            raise ValueError("Сотрудник не найден")

        query = db.query(Goal).filter(Goal.employee_id == request.employee_id)
        if request.quarter:
            query = query.filter(Goal.quarter == request.quarter)
        if request.year:
            query = query.filter(Goal.year == request.year)
        if not request.include_drafts:
            query = query.filter(Goal.status != GoalStatus.DRAFT)

        goals = query.order_by(Goal.created_at.asc()).all()
        if not goals:
            raise ValueError("Для экспорта не найдено целей")

        batch_id = str(uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        payload = self._build_payload(system.code, employee, goals, batch_id, timestamp)
        goal_refs: list[GoalExportReference] = []
        for goal in goals:
            external_ref = f"{system.code}:{batch_id}:{str(goal.goal_id)[:8]}"
            goal.external_ref = external_ref
            goal.updated_at = datetime.now(timezone.utc)
            goal_refs.append(GoalExportReference(goal_id=str(goal.goal_id), external_ref=external_ref))

        db.commit()

        return GoalsExportResponse(
            batch_id=batch_id,
            target_system=system.code,
            employee_id=employee.id,
            employee_name=employee.full_name,
            exported_count=len(goals),
            message=f"Экспортировано {len(goals)} целей в {system.name}",
            payload=payload,
            goal_refs=goal_refs,
        )

    def _serialize_goal(self, goal: Goal) -> dict:
        return {
            "goal_id": str(goal.goal_id),
            "title": goal.goal_text,
            "metric": goal.metric,
            "deadline": goal.deadline.isoformat() if goal.deadline else None,
            "weight": float(goal.weight or 0),
            "status": goal.status.value if hasattr(goal.status, "value") else goal.status,
            "quarter": goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter,
            "year": goal.year,
        }

    def _build_payload(
        self,
        system_code: str,
        employee: Employee,
        goals: list[Goal],
        batch_id: str,
        timestamp: str,
    ) -> dict:
        base_goals = [self._serialize_goal(goal) for goal in goals]

        if system_code == "1c":
            return {
                "batch_id": batch_id,
                "exported_at": timestamp,
                "employee": {
                    "id": employee.id,
                    "employee_code": employee.employee_code,
                    "full_name": employee.full_name,
                },
                "goals": [
                    {
                        "Цель": goal["title"],
                        "Метрика": goal["metric"],
                        "Срок": goal["deadline"],
                        "Вес": goal["weight"],
                        "Статус": goal["status"],
                    }
                    for goal in base_goals
                ],
            }

        if system_code == "sap":
            return {
                "batchId": batch_id,
                "exportedAt": timestamp,
                "worker": {
                    "personIdExternal": employee.employee_code or str(employee.id),
                    "fullName": employee.full_name,
                },
                "performanceGoals": [
                    {
                        "goalId": goal["goal_id"],
                        "description": goal["title"],
                        "metric": goal["metric"],
                        "dueDate": goal["deadline"],
                        "weight": goal["weight"],
                        "status": goal["status"],
                    }
                    for goal in base_goals
                ],
            }

        return {
            "exportBatchId": batch_id,
            "timestamp": timestamp,
            "workerNumber": employee.employee_code or str(employee.id),
            "workerName": employee.full_name,
            "goals": [
                {
                    "goalIdentifier": goal["goal_id"],
                    "goalName": goal["title"],
                    "measure": goal["metric"],
                    "targetDate": goal["deadline"],
                    "allocationPercent": goal["weight"],
                    "lifecycleStatus": goal["status"],
                }
                for goal in base_goals
            ],
        }


integration_service = IntegrationService()
