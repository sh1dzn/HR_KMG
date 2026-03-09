"""
Database models for HR AI Module
"""
from app.models.department import Department
from app.models.employee import Employee, Position
from app.models.goal import Goal, GoalEvent, GoalReview, GoalStatus
from app.models.document import Document, DocumentType

__all__ = [
    "Department",
    "Employee",
    "Position",
    "Goal",
    "GoalEvent",
    "GoalReview",
    "GoalStatus",
    "Document",
    "DocumentType"
]
