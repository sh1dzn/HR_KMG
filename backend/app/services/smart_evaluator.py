"""
SMART Goal Evaluator Service
Оценка целей по методологии SMART с использованием GPT-4
"""
import json
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
        context: Optional[str] = None
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

        result = await self.llm.complete_json(
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT,
            temperature=0.2
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

        # Parse goal type
        goal_type = GoalTypeInfo(**result["goal_type"])

        # Parse strategic link
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


# Global instance
smart_evaluator = SMARTEvaluator()
