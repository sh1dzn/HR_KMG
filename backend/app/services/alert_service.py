"""
Alert service for low-quality goals, weak strategic links, and portfolio issues.
"""
from __future__ import annotations

from collections import Counter
from uuid import uuid5, NAMESPACE_URL

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Employee, Goal
from app.schemas.alert import AlertItem, AlertsSummaryResponse
from app.utils.goal_context import load_generation_metadata, strategic_link_for_goal
from app.utils.smart_heuristics import evaluate_goal_heuristically


class AlertService:
    """Builds an alert feed from current goals and goal portfolios."""

    def _alert_id(self, *parts: str) -> str:
        return str(uuid5(NAMESPACE_URL, "::".join(parts)))

    def _employee_context(self, employee: Employee) -> dict:
        manager = employee.manager
        department = employee.department
        return {
            "employee_id": employee.id,
            "employee_name": employee.full_name,
            "manager_id": manager.id if manager else None,
            "manager_name": manager.full_name if manager else None,
            "department_id": department.id if department else None,
            "department_name": department.name if department else None,
            "recipient_roles": ["employee", "manager"] if manager else ["employee"],
        }

    def build_goal_alerts(
        self,
        goal: Goal,
        employee: Employee,
        metadata: dict | None = None,
    ) -> list[AlertItem]:
        heuristic = evaluate_goal_heuristically(goal.goal_text, goal.metric, goal.deadline, goal.priority)
        details = heuristic["smart_details"]
        overall_score = heuristic["overall_score"]
        strategic_link = strategic_link_for_goal(goal, metadata)
        quarter = goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter
        context = self._employee_context(employee)

        alerts: list[AlertItem] = []

        if overall_score < settings.SMART_THRESHOLD_MEDIUM:
            severity = "high" if overall_score < settings.SMART_THRESHOLD_LOW else "medium"
            alerts.append(
                AlertItem(
                    id=self._alert_id("goal", str(goal.goal_id), "low_smart"),
                    severity=severity,
                    alert_type="low_smart",
                    title="Низкий SMART-индекс цели",
                    message=f"Цель имеет SMART-индекс {overall_score:.2f} и требует доработки.",
                    recommended_action="Уточнить результат, метрику и срок, затем повторно отправить на согласование.",
                    goal_id=str(goal.goal_id),
                    goal_title=goal.goal_text,
                    quarter=quarter,
                    year=goal.year,
                    **context,
                )
            )

        if strategic_link == "operational":
            alerts.append(
                AlertItem(
                    id=self._alert_id("goal", str(goal.goal_id), "weak_strategic_link"),
                    severity="medium",
                    alert_type="weak_strategic_link",
                    title="Слабая стратегическая связка цели",
                    message="Цель определена как операционная и слабо привязана к стратегии или KPI подразделения.",
                    recommended_action="Добавить связь с KPI, целями руководителя или стратегическим документом.",
                    goal_id=str(goal.goal_id),
                    goal_title=goal.goal_text,
                    quarter=quarter,
                    year=goal.year,
                    **context,
                )
            )

        if not details["measurable"]["is_satisfied"]:
            alerts.append(
                AlertItem(
                    id=self._alert_id("goal", str(goal.goal_id), "missing_metric"),
                    severity="medium",
                    alert_type="missing_metric",
                    title="У цели нет измеримого критерия",
                    message="Цель не содержит внятной метрики или KPI для проверки результата.",
                    recommended_action="Добавить процент, SLA, количество, срок или другой проверяемый показатель.",
                    goal_id=str(goal.goal_id),
                    goal_title=goal.goal_text,
                    quarter=quarter,
                    year=goal.year,
                    **context,
                )
            )

        if not details["time_bound"]["is_satisfied"]:
            alerts.append(
                AlertItem(
                    id=self._alert_id("goal", str(goal.goal_id), "missing_deadline"),
                    severity="medium",
                    alert_type="missing_deadline",
                    title="У цели не указан срок",
                    message="В формулировке цели нет даты, квартала или дедлайна.",
                    recommended_action="Зафиксировать срок выполнения или отчетный период.",
                    goal_id=str(goal.goal_id),
                    goal_title=goal.goal_text,
                    quarter=quarter,
                    year=goal.year,
                    **context,
                )
            )

        return alerts

    def build_employee_portfolio_alerts(self, employee: Employee, goals: list[Goal]) -> list[AlertItem]:
        if not goals:
            return []

        context = self._employee_context(employee)
        quarter = goals[0].quarter.value if hasattr(goals[0].quarter, "value") else goals[0].quarter
        year = goals[0].year
        total_weight = round(sum(float(goal.weight or 0) for goal in goals), 2)

        alerts: list[AlertItem] = []

        if abs(total_weight - 100) >= 0.1:
            alerts.append(
                AlertItem(
                    id=self._alert_id("employee", str(employee.id), quarter or "", str(year), "weight_balance"),
                    severity="high",
                    alert_type="weight_balance",
                    title="Сумма весов целей не равна 100%",
                    message=f"Сумма весов целей сотрудника составляет {total_weight:.2f}%.",
                    recommended_action="Скорректировать веса портфеля целей до 100%.",
                    quarter=quarter,
                    year=year,
                    **context,
                )
            )

        if not (settings.MIN_GOALS_PER_EMPLOYEE <= len(goals) <= settings.MAX_GOALS_PER_EMPLOYEE):
            alerts.append(
                AlertItem(
                    id=self._alert_id("employee", str(employee.id), quarter or "", str(year), "goal_count"),
                    severity="medium",
                    alert_type="goal_count",
                    title="Количество целей выходит за рекомендуемый диапазон",
                    message=(
                        f"У сотрудника {len(goals)} целей. Рекомендуемый диапазон: "
                        f"{settings.MIN_GOALS_PER_EMPLOYEE}-{settings.MAX_GOALS_PER_EMPLOYEE}."
                    ),
                    recommended_action="Добавить или сократить цели до рабочего диапазона.",
                    quarter=quarter,
                    year=year,
                    **context,
                )
            )

        submitted_or_approved = sum(
            1 for goal in goals
            if (goal.status.value if hasattr(goal.status, "value") else goal.status) in {"submitted", "approved", "in_progress", "done"}
        )
        if submitted_or_approved == 0:
            alerts.append(
                AlertItem(
                    id=self._alert_id("employee", str(employee.id), quarter or "", str(year), "approval_stalled"),
                    severity="low",
                    alert_type="approval_stalled",
                    title="Портфель целей не отправлен на согласование",
                    message="По сотруднику нет целей в статусах submitted/approved/in_progress/done.",
                    recommended_action="Отправить цели на согласование руководителю.",
                    quarter=quarter,
                    year=year,
                    **context,
                )
            )

        return alerts

    def get_alerts(
        self,
        db: Session,
        *,
        quarter: str | None = None,
        year: int | None = None,
        department_id: int | None = None,
        employee_id: int | None = None,
    ) -> list[AlertItem]:
        employee_query = db.query(Employee).filter(Employee.is_active == True)
        if department_id:
            employee_query = employee_query.filter(Employee.department_id == department_id)
        if employee_id:
            employee_query = employee_query.filter(Employee.id == employee_id)
        employees = employee_query.all()
        if not employees:
            return []

        employee_ids = [employee.id for employee in employees]
        goals_query = db.query(Goal).filter(Goal.employee_id.in_(employee_ids))
        if quarter:
            goals_query = goals_query.filter(Goal.quarter == quarter)
        if year:
            goals_query = goals_query.filter(Goal.year == year)
        goals = goals_query.all()
        metadata_by_goal = load_generation_metadata(db, [goal.goal_id for goal in goals])

        goals_by_employee: dict[int, list[Goal]] = {}
        for goal in goals:
            goals_by_employee.setdefault(goal.employee_id, []).append(goal)

        alerts: list[AlertItem] = []
        for employee in employees:
            employee_goals = goals_by_employee.get(employee.id, [])
            alerts.extend(self.build_employee_portfolio_alerts(employee, employee_goals))
            for goal in employee_goals:
                alerts.extend(self.build_goal_alerts(goal, employee, metadata_by_goal.get(str(goal.goal_id))))

        severity_order = {"high": 0, "medium": 1, "low": 2}
        alerts.sort(key=lambda alert: (severity_order.get(alert.severity, 99), alert.employee_name, alert.goal_title or ""))
        return alerts

    def get_summary(
        self,
        db: Session,
        *,
        quarter: str | None = None,
        year: int | None = None,
        department_id: int | None = None,
        employee_id: int | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> AlertsSummaryResponse:
        alerts = self.get_alerts(
            db,
            quarter=quarter,
            year=year,
            department_id=department_id,
            employee_id=employee_id,
        )
        severity_counter = Counter(alert.severity for alert in alerts)
        type_counter = Counter(alert.alert_type for alert in alerts)
        total_pages = max(1, -(-len(alerts) // per_page))
        start = (page - 1) * per_page
        paginated = alerts[start:start + per_page]
        return AlertsSummaryResponse(
            total_alerts=len(alerts),
            high_severity=severity_counter.get("high", 0),
            medium_severity=severity_counter.get("medium", 0),
            low_severity=severity_counter.get("low", 0),
            alerts_by_type=dict(type_counter),
            alerts=paginated,
            quarter=quarter,
            year=year,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
        )


alert_service = AlertService()
