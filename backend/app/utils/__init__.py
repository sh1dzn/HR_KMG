"""
Utility functions for HR AI Module
"""
from app.utils.document_scope import department_matches_scope, resolve_department_scope_labels
from app.utils.text_processing import clean_text, extract_keywords, normalize_goal_text

__all__ = [
    "clean_text",
    "department_matches_scope",
    "extract_keywords",
    "normalize_goal_text",
    "resolve_department_scope_labels",
]
