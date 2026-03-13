"""
Goal Generator Service
Генерация целей на основе ВНД и стратегии с использованием RAG
"""
from datetime import date
from typing import Optional, List, Dict
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service
from app.services.smart_evaluator import smart_evaluator
from app.utils.smart_heuristics import evaluate_goal_heuristically
from app.schemas.generation import (
    GeneratedGoal,
    GenerationResponse,
    SourceDocument
)
from app.config import settings


class GoalGenerator:
    """Service for generating employee goals using RAG and LLM"""

    SYSTEM_PROMPT = """Вы - эксперт по постановке целей сотрудников.
Ваша задача - генерировать цели в формате SMART на основе:
1. Внутренних нормативных документов (ВНД) компании
2. Стратегических приоритетов
3. KPI подразделения
4. Должности сотрудника

Требования к целям:
- Каждая цель должна быть конкретной и измеримой
- Указывайте числовые показатели и сроки
- Связывайте цели со стратегией компании
- Формулируйте цели на русском языке

Типы целей:
- output (результатная): фокус на конкретном результате
- impact (влияние): фокус на бизнес-влиянии
- activity (деятельностная): избегайте, если возможно

Уровни стратегической связки:
- strategic: напрямую связана со стратегией
- functional: связана с функциями подразделения
- operational: операционная задача"""

    GENERATION_PROMPT_TEMPLATE = """На основе предоставленных документов сгенерируйте {count} целей для сотрудника.

ПРОФИЛЬ СОТРУДНИКА:
- Должность: {position}
- Подразделение: {department}
- Период: {quarter} {year}

{focus_info}

{manager_goals_info}

РЕЛЕВАНТНЫЕ ДОКУМЕНТЫ:
{documents}

Верните ответ в формате JSON:
{{
    "goals": [
        {{
            "goal_text": "<формулировка цели SMART>",
            "metric": "<показатель достижения>",
            "smart_score": <float 0.0-1.0>,
            "goal_type": "<output/impact/activity>",
            "goal_type_russian": "<результатная/влияние/деятельностная>",
            "strategic_link": "<strategic/functional/operational>",
            "strategic_link_russian": "<стратегическая/функциональная/операционная>",
            "source_doc_id": "<string>",
            "source_doc_title": "<название документа>",
            "source_doc_type": "<тип документа>",
            "source_fragment": "<релевантный фрагмент из документа>",
            "rationale": "<обоснование цели>",
            "suggested_weight": <float 0-100>
        }}
    ],
    "generation_context": "<краткое пояснение контекста генерации>"
}}

Убедитесь, что сумма suggested_weight всех целей равна 100."""

    def __init__(self):
        self.llm = llm_service
        self.rag = rag_service
        self.evaluator = smart_evaluator

    async def generate_goals(
        self,
        employee_id: int,
        employee_name: str,
        position: str,
        department: str,
        quarter: str,
        year: int,
        focus_areas: Optional[List[str]] = None,
        manager_goals: Optional[List[str]] = None,
        count: int = 3
    ) -> GenerationResponse:
        """
        Generate goals for an employee

        Args:
            employee_id: Employee ID
            employee_name: Employee name
            position: Employee position
            department: Department name
            quarter: Quarter (Q1-Q4)
            year: Year
            focus_areas: Priority focus areas
            manager_goals: Manager's goals for cascading
            count: Number of goals to generate (1-5)

        Returns:
            GenerationResponse with generated goals
        """
        # Ensure count is within limits
        count = max(settings.MIN_GOALS_PER_EMPLOYEE,
                   min(count, settings.MAX_GOALS_PER_EMPLOYEE))

        # Search for relevant documents
        try:
            relevant_docs = await self.rag.search_for_goal_generation(
                position=position,
                department=department,
                focus_areas=focus_areas,
                n_results=10
            )
        except Exception:
            relevant_docs = []

        # Format documents for prompt
        docs_text = self._format_documents_for_prompt(relevant_docs)

        # Build focus info
        focus_info = ""
        if focus_areas:
            focus_info = f"ФОКУС-НАПРАВЛЕНИЯ КВАРТАЛА:\n- " + "\n- ".join(focus_areas)

        # Build manager goals info
        manager_goals_info = ""
        if manager_goals:
            manager_goals_info = f"ЦЕЛИ РУКОВОДИТЕЛЯ (для каскадирования):\n- " + "\n- ".join(manager_goals)

        # Generate goals
        prompt = self.GENERATION_PROMPT_TEMPLATE.format(
            count=count,
            position=position,
            department=department,
            quarter=quarter,
            year=year,
            focus_info=focus_info,
            manager_goals_info=manager_goals_info,
            documents=docs_text
        )

        try:
            if not settings.OPENAI_API_KEY:
                raise RuntimeError("OPENAI_API_KEY is not configured")
            result = await self.llm.complete_json(
                prompt=prompt,
                system_prompt=self.SYSTEM_PROMPT,
                temperature=0.4
            )
        except Exception:
            result = self._build_fallback_generation(
                position=position,
                department=department,
                quarter=quarter,
                year=year,
                relevant_docs=relevant_docs,
                focus_areas=focus_areas,
                manager_goals=manager_goals,
                count=count,
            )

        # Parse generated goals
        generated_goals = []
        total_weight = 0

        for goal_data in result.get("goals", []):
            source_doc_id = goal_data.get("source_doc_id")
            source_doc = SourceDocument(
                doc_id=str(source_doc_id) if source_doc_id is not None else "",
                title=goal_data.get("source_doc_title", "Неизвестный документ"),
                doc_type=goal_data.get("source_doc_type", "vnd"),
                relevant_fragment=goal_data.get("source_fragment", "")
            )

            generated_goal = GeneratedGoal(
                goal_text=goal_data["goal_text"],
                metric=goal_data.get("metric", ""),
                smart_score=goal_data.get("smart_score", 0.8),
                goal_type=goal_data.get("goal_type", "output"),
                goal_type_russian=goal_data.get("goal_type_russian", "результатная"),
                strategic_link=goal_data.get("strategic_link", "functional"),
                strategic_link_russian=goal_data.get("strategic_link_russian", "функциональная"),
                source_document=source_doc,
                rationale=goal_data.get("rationale", ""),
                suggested_weight=goal_data.get("suggested_weight", 100 / count)
            )

            generated_goals.append(generated_goal)
            total_weight += generated_goal.suggested_weight

        return GenerationResponse(
            employee_id=employee_id,
            employee_name=employee_name,
            position=position,
            department=department,
            quarter=quarter,
            year=year,
            generated_goals=generated_goals,
            total_suggested_weight=total_weight,
            generation_context=result.get("generation_context", "")
        )

    def _build_fallback_generation(
        self,
        *,
        position: str,
        department: str,
        quarter: str,
        year: int,
        relevant_docs: List[Dict],
        focus_areas: Optional[List[str]],
        manager_goals: Optional[List[str]],
        count: int,
    ) -> Dict:
        goals = []
        deadline_label = self._quarter_deadline_label(quarter, year)
        source_doc = self._select_primary_source_document(relevant_docs, department)
        topics = self._build_topics(relevant_docs, focus_areas, manager_goals, department, count)
        weights = self._distribute_weights(count)

        for index in range(count):
            topic = topics[index]
            metric = self._fallback_metric(topic, index)
            goal_text = (
                f"До {deadline_label} обеспечить результат по направлению "
                f"\"{topic}\" с достижением показателя {metric.lower()}."
            )
            heuristic = evaluate_goal_heuristically(goal_text, metric)
            goals.append(
                {
                    "goal_text": goal_text,
                    "metric": metric,
                    "smart_score": heuristic["overall_score"],
                    "goal_type": self._fallback_goal_type(topic),
                    "goal_type_russian": self._goal_type_russian(self._fallback_goal_type(topic)),
                    "strategic_link": self._fallback_strategic_link(source_doc),
                    "strategic_link_russian": self._strategic_link_russian(self._fallback_strategic_link(source_doc)),
                    "source_doc_id": source_doc["doc_id"],
                    "source_doc_title": source_doc["title"],
                    "source_doc_type": source_doc["doc_type"],
                    "source_fragment": source_doc["relevant_fragment"],
                    "rationale": (
                        f"Цель привязана к роли {position}, подразделению {department} "
                        f"и текущему контексту документов/приоритетов."
                    ),
                    "suggested_weight": weights[index],
                }
            )

        return {
            "goals": goals,
            "generation_context": (
                "Цели сформированы по профилю сотрудника, найденным документам "
                "и квартальным приоритетам с использованием резервного сценария."
            ),
        }

    def _build_topics(
        self,
        relevant_docs: List[Dict],
        focus_areas: Optional[List[str]],
        manager_goals: Optional[List[str]],
        department: str,
        count: int,
    ) -> List[str]:
        topics: List[str] = []

        if manager_goals:
            topics.extend(goal.strip() for goal in manager_goals if goal and goal.strip())
        if focus_areas:
            topics.extend(area.strip() for area in focus_areas if area and area.strip())

        for doc in relevant_docs:
            metadata = doc.get("metadata", {})
            title = metadata.get("title")
            if title:
                topics.append(str(title).strip())

        if not topics:
            topics = [
                f"операционная эффективность подразделения {department}",
                f"качество исполнения задач в {department}",
                f"контроль ключевых показателей подразделения {department}",
            ]

        unique_topics: List[str] = []
        seen = set()
        for topic in topics:
            normalized = topic.lower()
            if normalized in seen:
                continue
            seen.add(normalized)
            unique_topics.append(topic)
            if len(unique_topics) >= count:
                break

        while len(unique_topics) < count:
            unique_topics.append(f"приоритет {len(unique_topics) + 1} для {department}")

        return unique_topics

    def _select_primary_source_document(self, relevant_docs: List[Dict], department: str) -> Dict[str, str]:
        if relevant_docs:
            metadata = relevant_docs[0].get("metadata", {})
            return {
                "doc_id": str(metadata.get("doc_id", "fallback")),
                "title": str(metadata.get("title", f"Контекст подразделения {department}")),
                "doc_type": str(metadata.get("doc_type", "fallback")),
                "relevant_fragment": relevant_docs[0].get("content", "")[:500],
            }

        return {
            "doc_id": "fallback",
            "title": f"Контекст подразделения {department}",
            "doc_type": "fallback",
            "relevant_fragment": f"Цель сформирована по профилю сотрудника и приоритетам подразделения {department}.",
        }

    def _distribute_weights(self, count: int) -> List[float]:
        base_weight = round(100 / count, 2)
        weights = [base_weight for _ in range(count)]
        weights[-1] = round(100 - sum(weights[:-1]), 2)
        return weights

    def _fallback_metric(self, topic: str, index: int) -> str:
        metrics = [
            "достижение KPI не ниже 95%",
            "сокращение срока выполнения не менее чем на 15%",
            "снижение количества отклонений не менее чем на 20%",
            "выполнение плана не ниже 100%",
            "рост внутреннего SLA до 95%",
        ]
        if any(keyword in topic.lower() for keyword in ["затрат", "cost", "эффектив"]):
            return "снижение затрат не менее чем на 10%"
        if any(keyword in topic.lower() for keyword in ["качест", "quality", "отклон"]):
            return "снижение количества ошибок не менее чем на 20%"
        return metrics[index % len(metrics)]

    def _fallback_goal_type(self, topic: str) -> str:
        lowered = topic.lower()
        if any(keyword in lowered for keyword in ["рост", "снижение", "результат", "kpi", "sla", "nps"]):
            return "impact"
        if any(keyword in lowered for keyword in ["внедрение", "запуск", "автоматизац", "контроль"]):
            return "output"
        return "activity"

    def _fallback_strategic_link(self, source_doc: Dict[str, str]) -> str:
        doc_type = str(source_doc.get("doc_type", "")).lower()
        if "strategy" in doc_type:
            return "strategic"
        if "kpi" in doc_type or "policy" in doc_type:
            return "functional"
        return "operational"

    def _goal_type_russian(self, goal_type: str) -> str:
        mapping = {
            "impact": "влияние",
            "output": "результатная",
            "activity": "деятельностная",
        }
        return mapping.get(goal_type, "деятельностная")

    def _strategic_link_russian(self, strategic_link: str) -> str:
        mapping = {
            "strategic": "стратегическая",
            "functional": "функциональная",
            "operational": "операционная",
        }
        return mapping.get(strategic_link, "операционная")

    def _quarter_deadline_label(self, quarter: str, year: int) -> str:
        quarter_deadlines = {
            "Q1": date(year, 3, 31),
            "Q2": date(year, 6, 30),
            "Q3": date(year, 9, 30),
            "Q4": date(year, 12, 31),
        }
        return quarter_deadlines.get(quarter, date(year, 12, 31)).strftime("%d.%m.%Y")

    def _format_documents_for_prompt(self, docs: List[Dict]) -> str:
        """Format retrieved documents for LLM prompt"""
        if not docs:
            return "Релевантные документы не найдены."

        formatted = []
        for i, doc in enumerate(docs, 1):
            metadata = doc.get("metadata", {})
            formatted.append(f"""
Документ {i}:
- ID: {metadata.get('doc_id', 'N/A')}
- Название: {metadata.get('title', 'Без названия')}
- Тип: {metadata.get('doc_type', 'N/A')}
- Релевантность: {doc.get('relevance_score', 0):.2f}
Содержание:
{doc.get('content', '')}
---""")

        return "\n".join(formatted)

    async def validate_generated_goal(self, goal_text: str, position: str, department: str) -> dict:
        """
        Validate a generated goal using SMART evaluator

        Returns evaluation with score and recommendations
        """
        evaluation = await self.evaluator.evaluate_goal(
            goal_text=goal_text,
            position=position,
            department=department
        )

        return {
            "is_valid": evaluation.overall_score >= settings.SMART_THRESHOLD_MEDIUM,
            "smart_score": evaluation.overall_score,
            "quality_level": evaluation.quality_level,
            "issues": [r for r in evaluation.recommendations if evaluation.overall_score < settings.SMART_THRESHOLD_HIGH]
        }


# Global instance
goal_generator = GoalGenerator()
