"""
Document (ВНД) model
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from app.database import Base


class DocumentType(str, Enum):
    """Document type enumeration"""
    VND = "vnd"  # Внутренний нормативный документ
    STRATEGY = "strategy"
    KPI_FRAMEWORK = "kpi_framework"
    POLICY = "policy"
    REGULATION = "regulation"


class Document(Base):
    """Internal regulatory document (ВНД) model"""
    __tablename__ = "documents"

    doc_id = Column(Integer, primary_key=True, index=True)
    doc_type = Column(SQLEnum(DocumentType), nullable=False)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True)
    owner_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    department_scope = Column(String(500), nullable=True)  # Comma-separated department codes
    keywords = Column(String(500), nullable=True)  # Comma-separated keywords
    version = Column(String(20), default="1.0")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner_department = relationship("Department", back_populates="documents")

    def __repr__(self):
        return f"<Document(doc_id={self.doc_id}, title='{self.title[:50]}...', type={self.doc_type})>"

    def get_keywords_list(self) -> list:
        """Get keywords as a list"""
        if self.keywords:
            return [k.strip() for k in self.keywords.split(",")]
        return []

    def get_department_scope_list(self) -> list:
        """Get department scope as a list"""
        if self.department_scope:
            return [d.strip() for d in self.department_scope.split(",")]
        return []
