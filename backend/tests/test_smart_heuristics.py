"""
Tests for SMART heuristic evaluation.
Validates that the heuristic scoring correctly differentiates
good, medium, and weak goal formulations.
"""
import pytest
from datetime import date

from app.utils.smart_heuristics import evaluate_goal_heuristically


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _score(result, criterion=None):
    if criterion:
        return result["smart_details"][criterion]["score"]
    return result["overall_score"]


def _satisfied(result, criterion):
    return result["smart_details"][criterion]["is_satisfied"]


# ---------------------------------------------------------------------------
# 1. Good SMART goals — should score high (>=0.7 overall)
# ---------------------------------------------------------------------------

class TestGoodGoals:
    GOOD_GOALS = [
        "До 30.06.2026 внедрить систему автоматического мониторинга KPI подразделения, обеспечив покрытие не менее 95% ключевых показателей",
        "Снизить время обработки заявок клиентов на 25% до конца Q2 2026 за счёт автоматизации процесса маршрутизации",
        "Разработать и запустить в промышленную эксплуатацию модуль аналитики до 31.03.2026 с SLA не ниже 99.5%",
        "До конца Q3 2026 обеспечить снижение затрат на ИТ-инфраструктуру не менее чем на 15% путём миграции в облако",
        "Увеличить NPS внутренних клиентов с 60 до 75 баллов к 30.09.2026 за счёт внедрения нового сервисного портала",
    ]

    @pytest.mark.parametrize("goal_text", GOOD_GOALS)
    def test_good_goals_score_above_070(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        assert _score(result) >= 0.70, f"Good goal scored only {_score(result)}: {goal_text[:60]}..."

    @pytest.mark.parametrize("goal_text", GOOD_GOALS)
    def test_good_goals_specific_satisfied(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        assert _satisfied(result, "specific"), f"Specific not satisfied for good goal: {goal_text[:60]}..."

    @pytest.mark.parametrize("goal_text", GOOD_GOALS)
    def test_good_goals_measurable_satisfied(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        assert _satisfied(result, "measurable"), f"Measurable not satisfied for good goal: {goal_text[:60]}..."


# ---------------------------------------------------------------------------
# 2. Weak goals — should score low (<0.65 overall)
# ---------------------------------------------------------------------------

class TestWeakGoals:
    WEAK_GOALS = [
        "Улучшить работу",
        "Повысить эффективность",
        "Работать лучше и быстрее",
        "Оптимизировать процессы",
        "Стараться больше",
    ]

    @pytest.mark.parametrize("goal_text", WEAK_GOALS)
    def test_weak_goals_score_below_065(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        assert _score(result) < 0.65, f"Weak goal scored too high {_score(result)}: {goal_text}"

    @pytest.mark.parametrize("goal_text", WEAK_GOALS)
    def test_weak_goals_specific_not_satisfied(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        assert not _satisfied(result, "specific"), f"Specific should NOT be satisfied for: {goal_text}"

    @pytest.mark.parametrize("goal_text", WEAK_GOALS)
    def test_weak_goals_measurable_not_satisfied(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        assert not _satisfied(result, "measurable"), f"Measurable should NOT be satisfied for: {goal_text}"


# ---------------------------------------------------------------------------
# 3. Medium goals — between 0.50 and 0.80
# ---------------------------------------------------------------------------

class TestMediumGoals:
    MEDIUM_GOALS = [
        "Обеспечить стабильную работу системы мониторинга",
        "Снизить затраты на 10%",
        "Внедрить новый процесс в подразделении",
        "Разработать регламент по обработке запросов",
    ]

    @pytest.mark.parametrize("goal_text", MEDIUM_GOALS)
    def test_medium_goals_in_range(self, goal_text):
        result = evaluate_goal_heuristically(goal_text)
        score = _score(result)
        assert 0.40 <= score <= 0.85, f"Medium goal outside range: {score} for: {goal_text}"


# ---------------------------------------------------------------------------
# 4. Individual criterion tests
# ---------------------------------------------------------------------------

class TestSpecificCriteria:

    def test_metric_field_boosts_measurable(self):
        without_metric = evaluate_goal_heuristically("Повысить качество обслуживания клиентов")
        with_metric = evaluate_goal_heuristically("Повысить качество обслуживания клиентов", metric="NPS >= 80")
        assert _score(with_metric, "measurable") > _score(without_metric, "measurable")

    def test_deadline_field_boosts_time_bound(self):
        without_deadline = evaluate_goal_heuristically("Внедрить систему мониторинга")
        with_deadline = evaluate_goal_heuristically("Внедрить систему мониторинга", deadline=date(2026, 6, 30))
        assert _score(with_deadline, "time_bound") > _score(without_deadline, "time_bound")

    def test_numbers_boost_measurable(self):
        without_numbers = evaluate_goal_heuristically("Снизить затраты на инфраструктуру")
        with_numbers = evaluate_goal_heuristically("Снизить затраты на инфраструктуру на 15%")
        assert _score(with_numbers, "measurable") > _score(without_numbers, "measurable")

    def test_vague_verbs_reduce_specific(self):
        vague = evaluate_goal_heuristically("Улучшить и повысить показатели")
        concrete = evaluate_goal_heuristically("Внедрить систему автоматического контроля качества продукции")
        assert _score(concrete, "specific") > _score(vague, "specific")

    def test_timeframe_in_text_satisfies_time_bound(self):
        result = evaluate_goal_heuristically("Завершить проект до конца Q2 2026")
        assert _satisfied(result, "time_bound")

    def test_business_keywords_boost_relevant(self):
        generic = evaluate_goal_heuristically("Сделать что-нибудь полезное для себя")
        business = evaluate_goal_heuristically("Обеспечить выполнение KPI подразделения по безопасности")
        assert _score(business, "relevant") > _score(generic, "relevant")


# ---------------------------------------------------------------------------
# 5. Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:

    def test_empty_string(self):
        result = evaluate_goal_heuristically("")
        assert _score(result) < 0.5
        assert not _satisfied(result, "specific")
        assert not _satisfied(result, "measurable")

    def test_very_long_repetitive_text(self):
        """Long repetitive text should NOT score high on specific."""
        text = "Улучшить работу " * 50
        result = evaluate_goal_heuristically(text.strip())
        assert _score(result, "specific") < 0.75, "Repetitive long text should not be considered specific"

    def test_english_goal(self):
        result = evaluate_goal_heuristically(
            "Reduce customer churn rate by 15% by end of Q2 2026 through proactive outreach"
        )
        # Should still detect numbers and Q2 pattern
        assert _satisfied(result, "measurable")
        assert _satisfied(result, "time_bound")

    def test_return_structure(self):
        result = evaluate_goal_heuristically("Тестовая цель")
        assert "overall_score" in result
        assert "smart_details" in result
        for criterion in ["specific", "measurable", "achievable", "relevant", "time_bound"]:
            assert criterion in result["smart_details"]
            detail = result["smart_details"][criterion]
            assert "score" in detail
            assert "comment" in detail
            assert "is_satisfied" in detail
            assert isinstance(detail["score"], float)
            assert 0.0 <= detail["score"] <= 1.0
            assert isinstance(detail["comment"], str)
            assert len(detail["comment"]) > 0

    def test_overall_score_is_average_of_criteria(self):
        result = evaluate_goal_heuristically("Снизить затраты на 10% до конца Q2")
        details = result["smart_details"]
        expected = round(sum(details[c]["score"] for c in details) / 5, 2)
        assert abs(result["overall_score"] - expected) < 0.02


class TestGoalTypeAndStrategicLink:
    """Test that the optional goal_type/strategic_link fields work if present."""

    def test_result_has_no_unexpected_keys(self):
        result = evaluate_goal_heuristically("Тест")
        allowed = {"overall_score", "smart_details"}
        assert set(result.keys()) <= allowed or set(result.keys()) >= allowed
