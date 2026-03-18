"""
SMART Goal Evaluator Service
Оценка целей по методологии SMART с использованием GPT-4
"""
from typing import Optional, Dict, List
from app.services.llm_service import llm_service
from app.schemas.evaluation import (
    SMARTCriterion,
    SMARTEvaluation,
    EvaluationResponse,
    GoalTypeInfo,
    StrategicLinkInfo
)
from app.config import settings
from app.utils.smart_heuristics import evaluate_goal_heuristically


class SMARTEvaluator:
    """Service for evaluating goals using SMART methodology"""

    SYSTEM_PROMPT = """Вы - эксперт по оценке целей сотрудников по методологии SMART.
Ваша задача - проанализировать цель и оценить её по каждому из 5 критериев SMART:

S - Specific (Конкретность): Цель содержит чёткий предмет действия, нет размытых формулировок
M - Measurable (Измеримость): Есть числовой показатель, процент или иной способ верификации
A - Achievable (Достижимость): Цель реалистична для данной должности и подразделения
R - Relevant (Релевантность): Цель связана с функцией должности и стратегическими приоритетами
T - Time-bound (Ограниченность во времени): Указан конкретный срок или период выполнения

Также определите тип цели:
- activity (деятельностная): фокус на процессе, действиях
- output (результатная): фокус на конкретном результате
- impact (влияние): фокус на влиянии на бизнес-показатели

И уровень стратегической связки:
- strategic: связана со стратегией компании
- functional: связана с функциями подразделения
- operational: операционная/рутинная цель

Отвечайте ТОЛЬКО на русском языке."""

    EVALUATION_PROMPT_TEMPLATE = """Оцените следующую цель сотрудника:

ЦЕЛЬ: {goal_text}

{context_info}

Верните ответ в формате JSON со следующей структурой:
{{
    "smart_evaluation": {{
        "specific": {{
            "score": <float 0.0-1.0>,
            "comment": "<комментарий на русском>",
            "is_satisfied": <true/false>
        }},
        "measurable": {{
            "score": <float 0.0-1.0>,
            "comment": "<комментарий на русском>",
            "is_satisfied": <true/false>
        }},
        "achievable": {{
            "score": <float 0.0-1.0>,
            "comment": "<комментарий на русском>",
            "is_satisfied": <true/false>
        }},
        "relevant": {{
            "score": <float 0.0-1.0>,
            "comment": "<комментарий на русском>",
            "is_satisfied": <true/false>
        }},
        "time_bound": {{
            "score": <float 0.0-1.0>,
            "comment": "<комментарий на русском>",
            "is_satisfied": <true/false>
        }}
    }},
    "goal_type": {{
        "type": "<activity/output/impact>",
        "type_russian": "<деятельностная/результатная/влияние>",
        "explanation": "<пояснение>"
    }},
    "strategic_link": {{
        "level": "<strategic/functional/operational>",
        "level_russian": "<стратегическая/функциональная/операционная>",
        "explanation": "<пояснение>",
        "source": "<источник связки или null>"
    }},
    "recommendations": ["<рекомендация 1>", "<рекомендация 2>", ...],
    "reformulated_goal": "<улучшенная формулировка цели>"
}}"""

    def __init__(self):
        self.llm = llm_service

    async def evaluate_goal(
        self,
        goal_text: str,
        position: Optional[str] = None,
        department: Optional[str] = None,
        context: Optional[str] = None,
        model: Optional[str] = None
    ) -> EvaluationResponse:
        """
        Evaluate a single goal using SMART methodology

        Args:
            goal_text: The goal text to evaluate
            position: Employee's position
            department: Employee's department
            context: Additional context

        Returns:
            EvaluationResponse with scores and recommendations
        """
        # Build context info
        context_parts = []
        if position:
            context_parts.append(f"Должность: {position}")
        if department:
            context_parts.append(f"Подразделение: {department}")
        if context:
            context_parts.append(f"Дополнительный контекст: {context}")

        context_info = "\n".join(context_parts) if context_parts else "Контекст не указан"

        # Generate evaluation
        prompt = self.EVALUATION_PROMPT_TEMPLATE.format(
            goal_text=goal_text,
            context_info=context_info
        )

        try:
            result = await self.llm.complete_json(
                prompt=prompt,
                system_prompt=self.SYSTEM_PROMPT,
                temperature=0.2,
                model=model
            )

            # Parse SMART evaluation
            smart_data = result["smart_evaluation"]
            smart_evaluation = SMARTEvaluation(
                specific=SMARTCriterion(**smart_data["specific"]),
                measurable=SMARTCriterion(**smart_data["measurable"]),
                achievable=SMARTCriterion(**smart_data["achievable"]),
                relevant=SMARTCriterion(**smart_data["relevant"]),
                time_bound=SMARTCriterion(**smart_data["time_bound"])
            )

            # Calculate overall score
            scores = [
                smart_data["specific"]["score"],
                smart_data["measurable"]["score"],
                smart_data["achievable"]["score"],
                smart_data["relevant"]["score"],
                smart_data["time_bound"]["score"]
            ]
            overall_score = sum(scores) / len(scores)

            # Determine quality level
            if overall_score >= settings.SMART_THRESHOLD_HIGH:
                quality_level = "high"
            elif overall_score >= settings.SMART_THRESHOLD_MEDIUM:
                quality_level = "medium"
            else:
                quality_level = "low"

            goal_type = GoalTypeInfo(**result["goal_type"])
            strategic_link = StrategicLinkInfo(**result["strategic_link"]) if result.get("strategic_link") else None

            return EvaluationResponse(
                goal_text=goal_text,
                smart_evaluation=smart_evaluation,
                overall_score=round(overall_score, 2),
                goal_type=goal_type,
                strategic_link=strategic_link,
                recommendations=result.get("recommendations", []),
                reformulated_goal=result.get("reformulated_goal"),
                quality_level=quality_level
            )
        except Exception:
            return self._evaluate_goal_with_heuristics(
                goal_text=goal_text,
                position=position,
                department=department,
            )

    async def batch_evaluate(
        self,
        goals: List[Dict],
        position: Optional[str] = None,
        department: Optional[str] = None
    ) -> List[EvaluationResponse]:
        """
        Evaluate multiple goals

        Args:
            goals: List of goal dictionaries with 'id' and 'text' keys
            position: Employee's position
            department: Employee's department

        Returns:
            List of EvaluationResponse objects
        """
        results = []
        for goal in goals:
            evaluation = await self.evaluate_goal(
                goal_text=goal["text"],
                position=position,
                department=department
            )
            results.append(evaluation)
        return results

    def get_quality_label(self, score: float) -> str:
        """Get Russian quality label for score"""
        if score >= settings.SMART_THRESHOLD_HIGH:
            return "Высокое качество"
        elif score >= settings.SMART_THRESHOLD_MEDIUM:
            return "Среднее качество"
        else:
            return "Требует доработки"

    def _evaluate_goal_with_heuristics(
        self,
        *,
        goal_text: str,
        position: Optional[str] = None,
        department: Optional[str] = None,
    ) -> EvaluationResponse:
        heuristic = evaluate_goal_heuristically(goal_text)
        smart_details = heuristic["smart_details"]
        smart_evaluation = SMARTEvaluation(
            specific=self._criterion_from_score(
                smart_details["specific"]["score"],
                "Формулировка достаточно конкретна.",
                "Нужно точнее описать ожидаемый результат.",
            ),
            measurable=self._criterion_from_score(
                smart_details["measurable"]["score"],
                "Есть измеримый ориентир или KPI.",
                "Добавьте числовой показатель или способ проверки результата.",
            ),
            achievable=self._criterion_from_score(
                smart_details["achievable"]["score"],
                "Цель выглядит достижимой для текущей роли.",
                "Нужно уточнить реалистичность объема и ресурсов.",
            ),
            relevant=self._criterion_from_score(
                smart_details["relevant"]["score"],
                "Цель выглядит релевантной роли и функции.",
                "Добавьте явную связь с задачами роли или подразделения.",
            ),
            time_bound=self._criterion_from_score(
                smart_details["time_bound"]["score"],
                "Срок или период выполнения просматривается.",
                "Добавьте конкретный срок или отчетный период.",
            ),
        )

        goal_type_value = self._infer_goal_type(goal_text)
        strategic_link_value = self._infer_strategic_link(goal_text, department)
        overall_score = heuristic["overall_score"]

        if overall_score >= settings.SMART_THRESHOLD_HIGH:
            quality_level = "high"
        elif overall_score >= settings.SMART_THRESHOLD_MEDIUM:
            quality_level = "medium"
        else:
            quality_level = "low"

        return EvaluationResponse(
            goal_text=goal_text,
            smart_evaluation=smart_evaluation,
            overall_score=overall_score,
            goal_type=GoalTypeInfo(
                type=goal_type_value,
                type_russian=self._goal_type_label(goal_type_value),
                explanation="Тип цели определен по структуре формулировки и ожидаемому результату.",
            ),
            strategic_link=StrategicLinkInfo(
                level=strategic_link_value,
                level_russian=self._strategic_link_label(strategic_link_value),
                explanation="Связка определена по смыслу цели и контексту роли/подразделения.",
                source=department or position,
            ),
            recommendations=self._build_recommendations(smart_evaluation),
            reformulated_goal=self._build_reformulated_goal(goal_text),
            quality_level=quality_level,
        )

    def _criterion_from_score(self, score: float, success_comment: str, fail_comment: str) -> SMARTCriterion:
        rounded_score = round(score, 2)
        is_satisfied = rounded_score >= settings.SMART_THRESHOLD_MEDIUM
        return SMARTCriterion(
            score=rounded_score,
            comment=success_comment if is_satisfied else fail_comment,
            is_satisfied=is_satisfied,
        )

    def _infer_goal_type(self, goal_text: str) -> str:
        lowered = goal_text.lower()
        if any(token in lowered for token in ["рост", "снижение", "прибыль", "выручк", "затрат", "nps", "sla", "kpi", "%"]):
            return "impact"
        if any(token in lowered for token in ["внедр", "запуст", "обеспеч", "разработ", "автоматиз", "подготов"]):
            return "output"
        return "activity"

    def _infer_strategic_link(self, goal_text: str, department: Optional[str]) -> str:
        lowered = goal_text.lower()
        if any(token in lowered for token in ["цифров", "стратег", "трансформац", "эффектив", "затрат", "качест"]):
            return "strategic"
        if department:
            return "functional"
        return "operational"

    def _goal_type_label(self, goal_type: str) -> str:
        return {
            "impact": "влияние",
            "output": "результатная",
            "activity": "деятельностная",
        }.get(goal_type, "деятельностная")

    def _strategic_link_label(self, link: str) -> str:
        return {
            "strategic": "стратегическая",
            "functional": "функциональная",
            "operational": "операционная",
        }.get(link, "операционная")

    def _build_recommendations(self, smart_evaluation: SMARTEvaluation) -> List[str]:
        recommendations = []
        if not smart_evaluation.specific.is_satisfied:
            recommendations.append("Уточните ожидаемый результат и объект изменения.")
        if not smart_evaluation.measurable.is_satisfied:
            recommendations.append("Добавьте числовой KPI, процент или другой измеримый критерий.")
        if not smart_evaluation.achievable.is_satisfied:
            recommendations.append("Проверьте достижимость цели с учетом роли и доступных ресурсов.")
        if not smart_evaluation.relevant.is_satisfied:
            recommendations.append("Усилите связь цели с задачами подразделения или бизнес-приоритетом.")
        if not smart_evaluation.time_bound.is_satisfied:
            recommendations.append("Зафиксируйте конкретный срок выполнения или отчетный период.")
        return recommendations

    def _build_reformulated_goal(self, goal_text: str) -> str:
        cleaned = goal_text.strip().rstrip(".")
        lowered = cleaned.lower()

        if "до " not in lowered and "q" not in lowered and "квартал" not in lowered:
            cleaned = f"До конца квартала {cleaned[:1].lower()}{cleaned[1:]}"

        if "%" not in cleaned and "kpi" not in lowered and "sla" not in lowered:
            cleaned = f"{cleaned}, обеспечив измеримый результат не ниже целевого уровня"

        return f"{cleaned}."


# Global instance
smart_evaluator = SMARTEvaluator()
