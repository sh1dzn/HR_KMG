"""
Utilities for normalizing document department scope structures from the dump.
"""
from __future__ import annotations

from typing import Any, Iterable


GLOBAL_SCOPE_TOKENS = {
    "all",
    "all_departments",
    "*",
    "company",
    "common",
    "general",
    "все",
    "общий",
}

_ID_KEYS = {"department_ids", "ids"}
_TEXT_KEYS = {"department_names", "names", "department_codes", "codes", "departments", "scope"}


def _unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        result.append(normalized)
    return result


def _split_scalar(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        normalized = value.replace(";", ",")
        return [part.strip() for part in normalized.split(",") if part.strip()]
    if isinstance(value, (int, float)):
        return [str(int(value) if isinstance(value, float) and value.is_integer() else value)]
    return [str(value).strip()]


def extract_department_scope_ids(raw_scope: Any) -> list[int]:
    ids: list[int] = []

    if raw_scope is None:
        return ids
    if isinstance(raw_scope, dict):
        for key, value in raw_scope.items():
            if key in _ID_KEYS:
                for item in extract_department_scope_ids(value):
                    ids.append(item)
            elif isinstance(value, (dict, list, tuple, set)):
                for item in extract_department_scope_ids(value):
                    ids.append(item)
        return ids
    if isinstance(raw_scope, (list, tuple, set)):
        for item in raw_scope:
            ids.extend(extract_department_scope_ids(item))
        return ids
    if isinstance(raw_scope, (int, float)):
        return [int(raw_scope)]
    if isinstance(raw_scope, str) and raw_scope.strip().isdigit():
        return [int(raw_scope.strip())]

    return ids


def extract_department_scope_tokens(raw_scope: Any) -> list[str]:
    values: list[str] = []

    if raw_scope is None:
        return values
    if isinstance(raw_scope, dict):
        for key, value in raw_scope.items():
            if key in _TEXT_KEYS:
                values.extend(extract_department_scope_tokens(value))
            elif isinstance(value, (dict, list, tuple, set)):
                values.extend(extract_department_scope_tokens(value))
        return _unique(values)
    if isinstance(raw_scope, (list, tuple, set)):
        for item in raw_scope:
            values.extend(extract_department_scope_tokens(item))
        return _unique(values)
    if isinstance(raw_scope, str):
        return _unique([token for token in _split_scalar(raw_scope) if not token.isdigit()])

    return values


def resolve_department_scope_labels(
    raw_scope: Any,
    *,
    department_names_by_id: dict[int, str] | None = None,
    department_codes_by_id: dict[int, str] | None = None,
) -> list[str]:
    labels: list[str] = []

    department_names_by_id = department_names_by_id or {}
    department_codes_by_id = department_codes_by_id or {}

    for department_id in extract_department_scope_ids(raw_scope):
        name = department_names_by_id.get(department_id)
        if name:
            labels.append(name)
        code = department_codes_by_id.get(department_id)
        if code:
            labels.append(code)

    labels.extend(extract_department_scope_tokens(raw_scope))
    return _unique(labels)


def department_matches_scope(
    department: str | None,
    scope_values: Iterable[str],
    *,
    owner_department_name: str | None = None,
    owner_department_code: str | None = None,
) -> bool:
    if not department:
        return True

    normalized_department = department.strip().lower()
    normalized_scope = {
        value.strip().lower()
        for value in scope_values
        if isinstance(value, str) and value.strip()
    }

    if owner_department_name:
        normalized_scope.add(owner_department_name.strip().lower())
    if owner_department_code:
        normalized_scope.add(owner_department_code.strip().lower())

    if not normalized_scope or normalized_scope & GLOBAL_SCOPE_TOKENS:
        return True

    if normalized_department in normalized_scope:
        return True

    return any(
        normalized_department in scope_value or scope_value in normalized_department
        for scope_value in normalized_scope
        if len(scope_value) > 2
    )
