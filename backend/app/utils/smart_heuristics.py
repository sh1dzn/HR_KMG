"""
Semantic SMART heuristics for dashboards and DB-backed goal summaries.
Uses keyword-based semantic analysis instead of text length.
"""
import re
from typing import Any, Dict, List, Set


# ─── Keyword dictionaries ────────────────────────────────────────────────────

# Concrete action verbs that indicate specificity
_CONCRETE_VERBS = {
    "внедрить", "разработать", "запустить", "создать", "автоматизировать",
    "сократить", "снизить", "увеличить", "достичь", "обеспечить",
    "завершить", "подготовить", "провести", "реализовать", "интегрировать",
    "оптимизировать", "перевести", "мигрировать", "развернуть", "настроить",
    "построить", "спроектировать", "протестировать", "валидировать",
    "сформировать", "согласовать", "утвердить", "документировать",
    "implement", "develop", "launch", "deploy", "reduce", "increase",
    "achieve", "deliver", "complete", "build", "design", "automate",
}

# Vague verbs that don't indicate specificity on their own
_VAGUE_VERBS = {
    "улучшить", "повысить", "усилить", "поработать", "стараться",
    "содействовать", "способствовать", "помогать", "участвовать",
    "improve", "enhance", "help", "try", "work",
}

# Named objects that indicate a concrete subject
_OBJECT_INDICATORS = re.compile(
    r"(?:систем[аыуеой]|процесс|модул[ьяюей]|платформ[аыуеой]|"
    r"серви[сз]|портал|интерфейс|отчёт|отчет|регламент|"
    r"документ|pipeline|дашборд|dashboard|api|базы? данных|"
    r"приложени[еяй]|инфраструктур|мониторинг|аналитик[аиу]|"
    r"project|system|module|service|report)",
    re.IGNORECASE,
)

# Metric indicators
_METRIC_PATTERNS = re.compile(
    r"\d+\s*%|не\s+менее|не\s+ниже|не\s+более|не\s+выше|"
    r"до\s+\d|от\s+\d|на\s+\d|≥|≤|>=|<=|"
    r"\bkpi\b|\bsla\b|\bnps\b|\broi\b|\bcsat\b|\bmttr\b|\bmtbf\b|"
    r"\d+\s*(?:штук|единиц|заявок|обращений|проектов|задач|клиентов|баллов|дней|часов|минут)|"
    r"\bby\s+\d+\s*%|\breduce\b.*\d|\bincrease\b.*\d|\brate\b.*\d",
    re.IGNORECASE,
)

# Comparative metric phrases
_COMPARATIVE_METRIC = re.compile(
    r"(?:снижение|сокращение|увеличение|рост|повышение|reduce|increase|decrease|improve)\s+.*?\d",
    re.IGNORECASE,
)

# Timeframe patterns
_TIMEFRAME_PATTERNS = re.compile(
    r"\bq[1-4]\b|20\d{2}|квартал|месяц|недел[яиь]|"
    r"дедлайн|до\s+\d{1,2}[./]\d{1,2}|до\s+конца|"
    r"в\s+течение|к\s+\d{1,2}[./]|"
    r"январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|"
    r"january|february|march|april|may|june|july|august|september|october|november|december|"
    r"до\s+\d{1,2}\.\d{2}\.\d{4}|"
    r"(?:1|2|3|4)\s*(?:квартал|кв\.?)|"
    r"end\s+of\s+q[1-4]|by\s+(?:end\s+of\s+)?(?:q[1-4]|\w+\s+\d{4}|\d{4})",
    re.IGNORECASE,
)

# Business/department-relevant keywords
_BUSINESS_KEYWORDS = {
    "стратегия", "стратегический", "стратегическ", "kpi", "эффективность", "эффективн", "бизнес",
    "качество", "качеств", "клиент", "клиентов", "клиентам", "безопасность", "безопасн",
    "прибыль", "выручка", "выручк", "затраты", "затрат", "расходы", "расход",
    "бюджет", "план", "целевой", "целев", "процесс", "процессов",
    "подразделение", "подразделени", "компания", "компани",
    "проект", "проектов", "сервис", "продукт", "продукци",
    "производство", "производств", "показатель", "показател",
    "метрика", "метрик", "результат", "результатов",
    "цифровизация", "цифровизац", "автоматизация", "автоматизац",
    "инновация", "инновац", "трансформация", "трансформац",
    "обработка", "обработк", "маршрутизац", "мониторинг",
    "compliance", "sla", "nps", "roi", "csat", "revenue", "cost",
    "customer", "safety", "production", "performance", "target",
}

# Unrealistic scope indicators
_UNREALISTIC_PATTERNS = re.compile(
    r"\b(?:все\s+процессы|всех\s+подразделений|100\s*x|1000\s*%|10000)",
    re.IGNORECASE,
)

_SPECIFIC_PASS_THRESHOLD = 0.75
_MEASURABLE_PASS_THRESHOLD = 0.60
_ACHIEVABLE_PASS_THRESHOLD = 0.70
_RELEVANT_PASS_THRESHOLD = 0.70
_TIME_BOUND_PASS_THRESHOLD = 0.65


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _extract_words(text: str) -> Set[str]:
    return set(re.findall(r"[а-яёa-z]+", text.lower()))


def _count_unique_words(text: str) -> int:
    return len(_extract_words(text))


def _has_structured_form(text: str) -> bool:
    """Check if text has action + object + qualifier structure."""
    words = _extract_words(text)
    has_action = bool(words & _CONCRETE_VERBS)
    has_object = bool(_OBJECT_INDICATORS.search(text))
    has_metric = bool(_METRIC_PATTERNS.search(text))
    return has_action and (has_object or has_metric)


# ─── Criterion evaluators ────────────────────────────────────────────────────

def _evaluate_specific(text: str) -> Dict[str, Any]:
    """Evaluate Specific criterion using semantic signals."""
    if not text:
        return {"score": 0.1, "comment": "Текст цели пуст.", "is_satisfied": False}

    score = 0.3  # base
    reasons: List[str] = []
    words = _extract_words(text)

    # Concrete action verb
    concrete_found = words & _CONCRETE_VERBS
    if concrete_found:
        score += 0.20
        reasons.append(f"конкретный глагол ({', '.join(list(concrete_found)[:2])})")
    else:
        vague_found = words & _VAGUE_VERBS
        if vague_found:
            score -= 0.05
            reasons.append(f"размытая формулировка ({', '.join(list(vague_found)[:2])})")

    # Named object/system
    if _OBJECT_INDICATORS.search(text):
        score += 0.20
        reasons.append("назван объект действия")
    else:
        reasons.append("не указан конкретный объект")

    # Structured form: action + object + qualifier
    if _has_structured_form(text):
        score += 0.15
        reasons.append("структурированная формулировка")

    # Penalize very short text
    unique_count = _count_unique_words(text)
    if unique_count < 4:
        score -= 0.15
        reasons.append("слишком короткая формулировка")
    elif unique_count >= 8:
        score += 0.10
        reasons.append("достаточная детализация")

    # Penalize repetitive text (many words but few unique)
    all_words = re.findall(r"[а-яёa-z]+", text.lower())
    if len(all_words) > 10 and unique_count < len(all_words) * 0.4:
        score -= 0.15
        reasons.append("повторяющиеся слова")

    # Very short broad statements should not pass as "specific".
    if (
        unique_count <= 4
        and not _METRIC_PATTERNS.search(text)
        and not _TIMEFRAME_PATTERNS.search(text)
    ):
        score -= 0.10
        reasons.append("недостаточно уточняющих деталей")

    score = round(max(0.05, min(score, 0.98)), 2)
    comment = "; ".join(reasons) if reasons else "Оценка конкретности"
    comment = comment[0].upper() + comment[1:] + "."
    return {"score": score, "comment": comment, "is_satisfied": score >= _SPECIFIC_PASS_THRESHOLD}


def _evaluate_measurable(text: str, metric: str | None = None) -> Dict[str, Any]:
    """Evaluate Measurable criterion."""
    if not text and not metric:
        return {"score": 0.1, "comment": "Нет текста для оценки.", "is_satisfied": False}

    score = 0.2  # base
    reasons: List[str] = []

    # Dedicated metric field
    metric_text = (metric or "").strip()
    if metric_text:
        score += 0.35
        reasons.append("заполнено поле метрики")
        if re.search(r"\d", metric_text):
            score += 0.15
            reasons.append("метрика содержит числовой показатель")

    # Numeric values in text
    if re.search(r"\d+\s*%", text):
        score += 0.25
        reasons.append("указан процент")
    elif re.search(r"\d", text):
        score += 0.15
        reasons.append("есть числовые значения")

    # Quantified metric phrasing (e.g. "не менее", "не выше", ">= 95")
    if _METRIC_PATTERNS.search(text):
        score += 0.15
        reasons.append("обнаружены формализованные метрики")

    # Named KPI/SLA/NPS
    if re.search(r"\b(?:kpi|sla|nps|roi|csat|mttr)\b", text, re.IGNORECASE):
        score += 0.15
        reasons.append("упоминается стандартный показатель")

    # Comparative metric phrases
    if _COMPARATIVE_METRIC.search(text):
        score += 0.15
        reasons.append("указано направление изменения с числом")

    # Action + number pattern ("снизить ... на 25%", "increase ... by 10%")
    if re.search(r"\b(?:снизить|увеличить|повысить|reduce|increase|decrease|improve)\b.*\d", text, re.IGNORECASE):
        score += 0.10
        reasons.append("действие задано числовым целевым значением")

    # Range target ("с 60 до 75", "from 60 to 75")
    if re.search(r"\bс\s*\d+\s*до\s*\d+\b|\bfrom\s+\d+\s+to\s+\d+\b", text, re.IGNORECASE):
        score += 0.10
        reasons.append("указан целевой диапазон значения")

    if not reasons:
        reasons.append("не найдено измеримых критериев")

    score = round(max(0.05, min(score, 0.98)), 2)
    comment = "; ".join(reasons)
    comment = comment[0].upper() + comment[1:] + "."
    return {"score": score, "comment": comment, "is_satisfied": score >= _MEASURABLE_PASS_THRESHOLD}


def _evaluate_achievable(text: str, priority: Any = None) -> Dict[str, Any]:
    """Evaluate Achievable criterion."""
    if not text:
        return {"score": 0.5, "comment": "Нет текста для оценки достижимости.", "is_satisfied": False}

    score = 0.75  # assume achievable by default
    reasons: List[str] = []

    # Priority check
    if priority is not None:
        try:
            p = int(priority)
            if p <= 3:
                score += 0.05
                reasons.append("высокий приоритет")
            elif p > 5:
                score -= 0.10
                reasons.append("низкий приоритет, возможна нехватка ресурсов")
        except (ValueError, TypeError):
            pass

    # Unrealistic scope
    if _UNREALISTIC_PATTERNS.search(text):
        score -= 0.25
        reasons.append("масштаб цели может быть нереалистичным")

    # Absurdly large numbers
    large_numbers = re.findall(r"(\d+)\s*%", text)
    for num_str in large_numbers:
        num = int(num_str)
        if num > 200:
            score -= 0.20
            reasons.append(f"нереалистичный показатель ({num}%)")
            break

    # Scope: single vs all
    if re.search(r"\bвсех?\b.*\b(?:процесс|систем|подразделен)", text, re.IGNORECASE):
        score -= 0.10
        reasons.append("широкий охват (все процессы/системы)")

    if not reasons:
        reasons.append("цель выглядит достижимой")

    score = round(max(0.15, min(score, 0.95)), 2)
    comment = "; ".join(reasons)
    comment = comment[0].upper() + comment[1:] + "."
    return {"score": score, "comment": comment, "is_satisfied": score >= _ACHIEVABLE_PASS_THRESHOLD}


def _evaluate_relevant(text: str) -> Dict[str, Any]:
    """Evaluate Relevant criterion using business keywords."""
    if not text:
        return {"score": 0.15, "comment": "Нет текста для оценки.", "is_satisfied": False}

    score = 0.35  # base
    reasons: List[str] = []
    words = _extract_words(text)

    # Business keywords
    business_matches = words & _BUSINESS_KEYWORDS
    if len(business_matches) >= 3:
        score += 0.35
        reasons.append(f"высокая бизнес-релевантность ({', '.join(list(business_matches)[:3])})")
    elif len(business_matches) >= 1:
        score += 0.20
        reasons.append(f"есть бизнес-контекст ({', '.join(list(business_matches)[:2])})")
    else:
        reasons.append("нет бизнес-контекста")

    # Structured form adds relevance
    if _has_structured_form(text):
        score += 0.15
        reasons.append("структурированная формулировка с объектом")

    # Action verbs suggest role-related work
    if words & _CONCRETE_VERBS:
        score += 0.10
        reasons.append("связана с рабочей деятельностью")

    # Personal/non-business penalty
    personal_keywords = {"личный", "хобби", "отпуск", "настроение", "самочувствие"}
    if words & personal_keywords:
        score -= 0.25
        reasons.append("содержит нерабочие темы")

    score = round(max(0.10, min(score, 0.98)), 2)
    comment = "; ".join(reasons)
    comment = comment[0].upper() + comment[1:] + "."
    return {"score": score, "comment": comment, "is_satisfied": score >= _RELEVANT_PASS_THRESHOLD}


def _evaluate_time_bound(text: str, deadline: Any = None) -> Dict[str, Any]:
    """Evaluate Time-bound criterion."""
    score = 0.2  # base
    reasons: List[str] = []

    # Dedicated deadline field
    if deadline:
        score += 0.50
        reasons.append("указан дедлайн в поле срока")

    # Explicit timeframe in text
    if _TIMEFRAME_PATTERNS.search(text):
        score += 0.45
        reasons.append("в тексте указан период или дата")

    # Specific date pattern (DD.MM.YYYY)
    if re.search(r"\d{1,2}[./]\d{1,2}[./]\d{2,4}", text):
        score += 0.10
        reasons.append("конкретная дата")

    # Quarter + year gives enough precision even without day/month.
    if re.search(r"\bq[1-4]\b", text, re.IGNORECASE) and re.search(r"20\d{2}", text):
        score += 0.10
        reasons.append("указаны квартал и год")

    if not deadline and not _TIMEFRAME_PATTERNS.search(text):
        reasons.append("не указан срок выполнения")

    score = round(max(0.05, min(score, 0.98)), 2)
    comment = "; ".join(reasons)
    comment = comment[0].upper() + comment[1:] + "."
    return {"score": score, "comment": comment, "is_satisfied": score >= _TIME_BOUND_PASS_THRESHOLD}


# ─── Main function ───────────────────────────────────────────────────────────

def evaluate_goal_heuristically(
    goal_text: str,
    metric: str | None = None,
    deadline: Any = None,
    priority: Any = None,
) -> Dict[str, Any]:
    """
    Evaluate a goal using semantic SMART heuristics.

    Returns:
        Dict with 'overall_score' (float 0-1) and 'smart_details' dict
        containing per-criterion score, comment, and is_satisfied flag.
    """
    text = (goal_text or "").strip()

    specific = _evaluate_specific(text)
    measurable = _evaluate_measurable(text, metric)
    achievable = _evaluate_achievable(text, priority)
    relevant = _evaluate_relevant(text)
    time_bound = _evaluate_time_bound(text, deadline)

    overall = round(
        (specific["score"] + measurable["score"] + achievable["score"]
         + relevant["score"] + time_bound["score"]) / 5,
        2,
    )

    return {
        "overall_score": overall,
        "smart_details": {
            "specific": specific,
            "measurable": measurable,
            "achievable": achievable,
            "relevant": relevant,
            "time_bound": time_bound,
        },
    }
