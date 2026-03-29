"""
Sandbox integration service for exporting goals to external HR systems.
"""
from __future__ import annotations

import json
import os
import random
import threading
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Employee, Goal, GoalStatus
from app.schemas.integration import (
    GoalExportReference,
    IntegrationBatchInfo,
    IntegrationBatchesResponse,
    IntegrationBatchCallbackRequest,
    IntegrationBatchRetryRequest,
    IntegrationHealthResponse,
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
            status="demo_sandbox",
        ),
        "sap": IntegrationSystemInfo(
            code="sap",
            name="SAP SuccessFactors",
            description="Экспорт целей в формат SAP SuccessFactors.",
            status="demo_sandbox",
        ),
        "oracle": IntegrationSystemInfo(
            code="oracle",
            name="Oracle HCM",
            description="Экспорт целей в формат Oracle HCM.",
            status="demo_sandbox",
        ),
    }

    ERROR_MAP = {
        "timeout": ("TIMEOUT", "Таймаут отправки в HRIS"),
        "auth_error": ("AUTH_ERROR", "Ошибка авторизации HRIS"),
        "validation_error": ("VALIDATION_ERROR", "Ошибка валидации payload на стороне HRIS"),
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._store_loaded = False
        self._batches: list[dict] = []

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _store_path(self) -> str:
        return settings.INTEGRATION_DEMO_STORE_PATH

    def _ensure_store_loaded(self) -> None:
        with self._lock:
            if self._store_loaded:
                return
            path = self._store_path()
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as fh:
                        data = json.load(fh)
                    rows = data.get("batches", [])
                    if isinstance(rows, list):
                        self._batches = rows
                except Exception:
                    self._batches = []
            self._store_loaded = True

    def _persist_store(self) -> None:
        path = self._store_path()
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        tmp_path = f"{path}.tmp"
        payload = {"batches": self._batches[-300:]}
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)

    def _batch_to_model(self, item: dict) -> IntegrationBatchInfo:
        return IntegrationBatchInfo(
            batch_id=item["batch_id"],
            target_system=item["target_system"],
            employee_id=item["employee_id"],
            employee_name=item["employee_name"],
            exported_count=item["exported_count"],
            status=item["status"],
            mode=item.get("mode", "demo_sandbox"),
            attempt_count=item.get("attempt_count", 1),
            error_code=item.get("error_code"),
            error_message=item.get("error_message"),
            requested_at=item["requested_at"],
            updated_at=item["updated_at"],
        )

    def _normalize_simulation(self, simulate_result: str) -> str:
        value = (simulate_result or "success").strip().lower()
        if value == "random":
            rnd = random.random()
            if rnd < 0.7:
                return "success"
            if rnd < 0.83:
                return "timeout"
            if rnd < 0.93:
                return "auth_error"
            return "validation_error"
        if value in {"success", "timeout", "auth_error", "validation_error"}:
            return value
        return "success"

    def _resolve_delivery(self, dispatch_mode: str, simulate_result: str) -> tuple[str, str | None, str | None]:
        mode = (dispatch_mode or "sync").strip().lower()
        simulation = self._normalize_simulation(simulate_result)

        # Queued mode leaves success/timeout in "queued", errors fail immediately.
        if mode == "queued":
            if simulation in {"auth_error", "validation_error"}:
                code, text = self.ERROR_MAP[simulation]
                return "failed", code, text
            if simulation == "timeout":
                return "queued", "TIMEOUT_PENDING", "Нет подтверждения от HRIS, ожидается callback"
            return "queued", None, None

        if simulation == "success":
            return "sent", None, None
        code, text = self.ERROR_MAP[simulation]
        return "failed", code, text

    def list_systems(self) -> IntegrationSystemsResponse:
        return IntegrationSystemsResponse(systems=list(self.SYSTEMS.values()))

    def list_batches(self, limit: int = 20) -> IntegrationBatchesResponse:
        self._ensure_store_loaded()
        with self._lock:
            rows = sorted(self._batches, key=lambda x: x.get("requested_at", ""), reverse=True)
            if limit > 0:
                rows = rows[:limit]
            return IntegrationBatchesResponse(items=[self._batch_to_model(x) for x in rows], total=len(self._batches))

    def get_health(self) -> IntegrationHealthResponse:
        self._ensure_store_loaded()
        with self._lock:
            queued = sum(1 for x in self._batches if x.get("status") == "queued")
            sent = sum(1 for x in self._batches if x.get("status") == "sent")
            confirmed = sum(1 for x in self._batches if x.get("status") == "confirmed")
            failed = sum(1 for x in self._batches if x.get("status") == "failed")
            processed = sent + confirmed + failed
            success_rate = round(((sent + confirmed) / processed) * 100, 1) if processed else 0.0
            last_batch_at = max((x.get("updated_at") or x.get("requested_at") for x in self._batches), default=None)
            return IntegrationHealthResponse(
                mode="demo_sandbox",
                total_batches=len(self._batches),
                queued=queued,
                sent=sent,
                confirmed=confirmed,
                failed=failed,
                success_rate=success_rate,
                last_batch_at=last_batch_at,
            )

    def apply_callback(self, batch_id: str, request: IntegrationBatchCallbackRequest) -> IntegrationBatchInfo:
        self._ensure_store_loaded()
        with self._lock:
            row = next((x for x in self._batches if x.get("batch_id") == batch_id), None)
            if not row:
                raise ValueError("Пакет интеграции не найден")
            row["status"] = request.result
            row["updated_at"] = self._now_iso()
            if request.result == "failed":
                row["error_code"] = row.get("error_code") or "CALLBACK_FAILED"
                row["error_message"] = request.error_message or "HRIS callback вернул ошибку"
            else:
                row["error_code"] = None
                row["error_message"] = None
            self._persist_store()
            return self._batch_to_model(row)

    def retry_batch(self, batch_id: str, request: IntegrationBatchRetryRequest) -> IntegrationBatchInfo:
        self._ensure_store_loaded()
        with self._lock:
            row = next((x for x in self._batches if x.get("batch_id") == batch_id), None)
            if not row:
                raise ValueError("Пакет интеграции не найден")

            status, err_code, err_message = self._resolve_delivery("sync", request.simulate_result)
            row["status"] = status
            row["error_code"] = err_code
            row["error_message"] = err_message
            row["attempt_count"] = int(row.get("attempt_count", 1)) + 1
            row["updated_at"] = self._now_iso()

            self._persist_store()
            return self._batch_to_model(row)

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
        timestamp = self._now_iso()

        payload = self._build_payload(system.code, employee, goals, batch_id, timestamp)
        goal_refs: list[GoalExportReference] = []
        for goal in goals:
            external_ref = f"{system.code}:{batch_id}:{str(goal.goal_id)[:8]}"
            goal.external_ref = external_ref
            goal.updated_at = datetime.now(timezone.utc)
            goal_refs.append(GoalExportReference(goal_id=str(goal.goal_id), external_ref=external_ref))

        db.commit()

        delivery_status, error_code, error_message = self._resolve_delivery(
            request.dispatch_mode,
            request.simulate_result,
        )
        batch_record = {
            "batch_id": batch_id,
            "target_system": system.code,
            "employee_id": employee.id,
            "employee_name": employee.full_name,
            "exported_count": len(goals),
            "status": delivery_status,
            "mode": "demo_sandbox",
            "attempt_count": 1,
            "error_code": error_code,
            "error_message": error_message,
            "requested_at": timestamp,
            "updated_at": timestamp,
        }
        self._ensure_store_loaded()
        with self._lock:
            self._batches.append(batch_record)
            self._persist_store()

        return GoalsExportResponse(
            batch_id=batch_id,
            target_system=system.code,
            employee_id=employee.id,
            employee_name=employee.full_name,
            exported_count=len(goals),
            message=f"Экспортировано {len(goals)} целей в {system.name} (sandbox)",
            payload=payload,
            goal_refs=goal_refs,
            delivery_status=delivery_status,
            delivery_error_code=error_code,
            delivery_error_message=error_message,
            mode="demo_sandbox",
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
