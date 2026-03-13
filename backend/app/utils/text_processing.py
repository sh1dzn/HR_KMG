"""
Text processing utilities
"""
import re
from typing import List


def clean_text(text: str) -> str:
    """
    Clean and normalize text

    Args:
        text: Input text

    Returns:
        Cleaned text
    """
    if not text:
        return ""

    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)

    # Remove leading/trailing whitespace
    text = text.strip()

    return text


def normalize_goal_text(text: str) -> str:
    """Normalize goal text for duplicate comparison."""
    cleaned = clean_text(text).lower()
    cleaned = re.sub(r"[^\w\s%а-яА-Яa-zA-Z0-9]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def extract_keywords(text: str, min_length: int = 3) -> List[str]:
    """
    Extract potential keywords from text

    Args:
        text: Input text
        min_length: Minimum keyword length

    Returns:
        List of keywords
    """
    if not text:
        return []

    # Simple word extraction (in production, use NLP library)
    words = re.findall(r'\b[а-яА-Яa-zA-Z]+\b', text.lower())

    # Filter by length and remove common words
    stop_words = {
        'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'о', 'об',
        'при', 'за', 'над', 'под', 'между', 'через', 'после', 'перед',
        'это', 'как', 'что', 'все', 'или', 'но', 'а', 'же', 'бы', 'ли',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'
    }

    keywords = [
        word for word in words
        if len(word) >= min_length and word not in stop_words
    ]

    # Remove duplicates while preserving order
    seen = set()
    unique_keywords = []
    for kw in keywords:
        if kw not in seen:
            seen.add(kw)
            unique_keywords.append(kw)

    return unique_keywords


def truncate_text(text: str, max_length: int = 200, suffix: str = "...") -> str:
    """
    Truncate text to max length

    Args:
        text: Input text
        max_length: Maximum length
        suffix: Suffix to add when truncated

    Returns:
        Truncated text
    """
    if not text or len(text) <= max_length:
        return text or ""

    return text[:max_length - len(suffix)] + suffix


def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    Calculate simple text similarity using Jaccard index

    Args:
        text1: First text
        text2: Second text

    Returns:
        Similarity score (0.0 - 1.0)
    """
    if not text1 or not text2:
        return 0.0

    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())

    intersection = words1.intersection(words2)
    union = words1.union(words2)

    if not union:
        return 0.0

    return len(intersection) / len(union)
