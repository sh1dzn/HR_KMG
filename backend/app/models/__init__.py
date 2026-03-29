"""
Database models for HR AI Module
"""
from app.models.department import Department
from app.models.employee import Employee, Position
from app.models.goal import Goal, GoalEvent, GoalEventType, GoalReview, GoalStatus, Quarter, ReviewVerdict
from app.models.document import Document, DocumentType
from app.models.user import User, UserRole, RefreshToken
from app.models.dependency import GoalDependency, DependencyType, DependencyStatus, DependencyCreatedBy
from app.models.chat import ChatConversation, ChatMessage, ChatMessageRole

__all__ = [
    "Department",
    "Employee",
    "Position",
    "Goal",
    "GoalEvent",
    "GoalEventType",
    "GoalReview",
    "GoalStatus",
    "Quarter",
    "ReviewVerdict",
    "Document",
    "DocumentType",
    "User",
    "UserRole",
    "RefreshToken",
    "GoalDependency",
    "DependencyType",
    "DependencyStatus",
    "DependencyCreatedBy",
    "ChatConversation",
    "ChatMessage",
    "ChatMessageRole",
]
