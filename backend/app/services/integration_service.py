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

    # 1С status mapping
    _1C_STATUS = {
        "draft": "Черновик", "active": "Активна", "submitted": "НаСогласовании",
        "approved": "Утверждена", "in_progress": "ВРаботе", "done": "Выполнена",
        "cancelled": "Отменена", "overdue": "Просрочена", "archived": "Архив",
    }

    # SAP status mapping (Goal Management module codes)
    _SAP_STATUS = {
        "draft": "NOT_STARTED", "active": "NOT_STARTED", "submitted": "ON_TRACK",
        "approved": "ON_TRACK", "in_progress": "ON_TRACK", "done": "COMPLETED",
        "cancelled": "CANCELLED", "overdue": "BEHIND", "archived": "COMPLETED",
    }

    # Oracle HCM status mapping
    _ORACLE_STATUS = {
        "draft": "DRAFT", "active": "ACTIVE", "submitted": "PENDING_APPROVAL",
        "approved": "APPROVED", "in_progress": "IN_PROGRESS", "done": "COMPLETED",
        "cancelled": "CANCELED", "overdue": "AT_RISK", "archived": "ARCHIVED",
    }

    def _goal_status_str(self, goal: Goal) -> str:
        return goal.status.value if hasattr(goal.status, "value") else str(goal.status)

    def _goal_quarter_str(self, goal: Goal) -> str:
        return goal.quarter.value if hasattr(goal.quarter, "value") else str(goal.quarter or "")

    def _build_payload(
        self,
        system_code: str,
        employee: Employee,
        goals: list[Goal],
        batch_id: str,
        timestamp: str,
    ) -> dict:
        if system_code == "1c":
            return self._build_1c_payload(employee, goals, batch_id, timestamp)
        if system_code == "sap":
            return self._build_sap_payload(employee, goals, batch_id, timestamp)
        return self._build_oracle_payload(employee, goals, batch_id, timestamp)

    def _build_1c_payload(self, employee, goals, batch_id, timestamp) -> dict:
        """1С:ЗУП 8.3 — Регистр сведений «ЦелиСотрудников»"""
        dept_name = employee.department.name if employee.department else ""
        position_name = employee.position.name if employee.position else ""
        return {
            "ТипОбмена": "ЦелиСотрудников",
            "ВерсияФормата": "1.2",
            "ДатаВыгрузки": timestamp,
            "ИдентификаторПакета": batch_id,
            "Организация": "ТОО «КМГ-Кумколь»",
            "Сотрудник": {
                "Код": employee.employee_code or str(employee.id),
                "ФИО": employee.full_name,
                "Подразделение": dept_name,
                "Должность": position_name,
                "ТабельныйНомер": employee.employee_code or f"TAB-{employee.id:05d}",
            },
            "ПериодОценки": {
                "Квартал": self._goal_quarter_str(goals[0]) if goals else "",
                "Год": goals[0].year if goals else None,
            },
            "Цели": [
                {
                    "УникальныйИдентификатор": str(goal.goal_id),
                    "Наименование": goal.goal_text,
                    "Показатель": goal.metric or "",
                    "СрокИсполнения": goal.deadline.strftime("%d.%m.%Y") if goal.deadline else "",
                    "ВесЦели": float(goal.weight or 0),
                    "Статус": self._1C_STATUS.get(self._goal_status_str(goal), "Черновик"),
                    "ТипЦели": getattr(goal, 'goal_type', None) or "impact",
                    "СтратегическаяСвязка": getattr(goal, 'strategic_link', None) or "",
                    "ОценкаSMART": round(float(getattr(goal, 'smart_score', None) or 0), 2),
                    "ВнешняяСсылка": goal.external_ref or "",
                }
                for goal in goals
            ],
            "ИтогоВесЦелей": round(sum(float(g.weight or 0) for g in goals), 2),
            "КоличествоЦелей": len(goals),
        }

    def _build_sap_payload(self, employee, goals, batch_id, timestamp) -> dict:
        """SAP SuccessFactors — Goal Plan API v2 (OData)"""
        dept_name = employee.department.name if employee.department else ""
        position_name = employee.position.name if employee.position else ""
        return {
            "__metadata": {
                "uri": f"GoalPlan('{batch_id}')",
                "type": "SFOData.GoalPlan",
            },
            "goalPlanId": batch_id,
            "goalPlanName": f"KPI Goals {self._goal_quarter_str(goals[0]) if goals else ''} {goals[0].year if goals else ''}",
            "goalPlanType": "Performance",
            "createdDateTime": timestamp,
            "userId": employee.employee_code or str(employee.id),
            "worker": {
                "personIdExternal": employee.employee_code or str(employee.id),
                "displayName": employee.full_name,
                "department": dept_name,
                "jobTitle": position_name,
                "managerId": str(employee.manager_id) if employee.manager_id else None,
            },
            "goals": {
                "results": [
                    {
                        "__metadata": {
                            "uri": f"Goal('{goal.goal_id}')",
                            "type": "SFOData.Goal",
                        },
                        "goalId": str(goal.goal_id),
                        "name": goal.goal_text,
                        "description": goal.goal_text,
                        "metric": goal.metric or "",
                        "start": goals[0].deadline.strftime("%Y-%m-%dT00:00:00") if goals[0].deadline else None,
                        "due": goal.deadline.strftime("%Y-%m-%dT00:00:00") if goal.deadline else None,
                        "weight": float(goal.weight or 0),
                        "state": self._SAP_STATUS.get(self._goal_status_str(goal), "NOT_STARTED"),
                        "category": getattr(goal, 'goal_type', None) or "impact",
                        "strategicAlignment": getattr(goal, 'strategic_link', None) or "",
                        "smartScore": round(float(getattr(goal, 'smart_score', None) or 0), 4),
                        "lastModifiedDateTime": goal.updated_at.isoformat() if goal.updated_at else timestamp,
                    }
                    for goal in goals
                ]
            },
            "totalWeight": round(sum(float(g.weight or 0) for g in goals), 2),
        }

    def _build_oracle_payload(self, employee, goals, batch_id, timestamp) -> dict:
        """Oracle HCM Cloud — Performance Goals REST API v2"""
        dept_name = employee.department.name if employee.department else ""
        position_name = employee.position.name if employee.position else ""
        return {
            "BatchExportId": batch_id,
            "ExportTimestamp": timestamp,
            "ExportSource": "HR-AI-Module",
            "ExportVersion": "2.0",
            "Worker": {
                "PersonNumber": employee.employee_code or str(employee.id),
                "DisplayName": employee.full_name,
                "DepartmentName": dept_name,
                "JobName": position_name,
                "ManagerPersonNumber": str(employee.manager_id) if employee.manager_id else None,
                "AssignmentStatusType": "ACTIVE",
            },
            "ReviewPeriod": {
                "PeriodName": f"{self._goal_quarter_str(goals[0]) if goals else ''} {goals[0].year if goals else ''}",
                "PeriodStartDate": f"{goals[0].year}-01-01" if goals else None,
                "PeriodEndDate": f"{goals[0].year}-12-31" if goals else None,
                "ReviewType": "GOAL_SETTING",
            },
            "PerformanceGoals": [
                {
                    "GoalId": str(goal.goal_id),
                    "GoalName": goal.goal_text,
                    "GoalDescription": "",
                    "MeasurementName": goal.metric or "",
                    "TargetCompletionDate": goal.deadline.isoformat() if goal.deadline else None,
                    "Weightage": float(goal.weight or 0),
                    "GoalStatusCode": self._ORACLE_STATUS.get(self._goal_status_str(goal), "DRAFT"),
                    "GoalCategoryCode": (getattr(goal, 'goal_type', None) or "IMPACT").upper(),
                    "StrategicAlignmentCode": (getattr(goal, 'strategic_link', None) or "").upper(),
                    "SmartScore": round(float(getattr(goal, 'smart_score', None) or 0), 4),
                    "LastUpdateDate": goal.updated_at.isoformat() if goal.updated_at else timestamp,
                    "CreationDate": goal.created_at.isoformat() if goal.created_at else timestamp,
                    "ExternalReferenceId": goal.external_ref or "",
                }
                for goal in goals
            ],
            "Summary": {
                "TotalGoals": len(goals),
                "TotalWeight": round(sum(float(g.weight or 0) for g in goals), 2),
                "AverageSmartScore": round(sum(float(getattr(g, 'smart_score', None) or 0) for g in goals) / max(len(goals), 1), 4),
            },
        }


integration_service = IntegrationService()
