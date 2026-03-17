"""Pytest configuration and shared fixtures."""
import pytest


@pytest.fixture
def good_goal_text():
    return "До 30.06.2026 внедрить систему автоматического мониторинга KPI подразделения, обеспечив покрытие не менее 95% ключевых показателей"


@pytest.fixture
def weak_goal_text():
    return "Улучшить работу"


@pytest.fixture
def medium_goal_text():
    return "Обеспечить стабильную работу системы мониторинга"
