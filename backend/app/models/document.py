"""
Document (ВНД) model
"""
from sqlalchemy import Column, BigInteger, Text, Date, DateTime, ForeignKey, Enum as SQLEnum, Boolean
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship
from enum import Enum
from app.database import Base


def _pg_enum(enum_cls, name: str):
    return SQLEnum(
        enum_cls,
        name=name,
        values_callable=lambda values: [item.value for item in values],
    )


class DocumentType(str, Enum):
    """Document type enumeration"""
    VND = "vnd"  # Внутренний нормативный документ
    STRATEGY = "strategy"
    KPI_FRAMEWORK = "kpi_framework"
    POLICY = "policy"
    REGULATION = "regulation"
    INSTRUCTION = "instruction"
    STANDARD = "standard"
    OTHER = "other"


class Document(Base):
    """Internal regulatory document (ВНД) model"""
    __tablename__ = "documents"

    doc_id = Column(UUID(as_uuid=False), primary_key=True, index=True)
    doc_type = Column(_pg_enum(DocumentType, "doc_type_enum"), nullable=False)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)
    owner_department_id = Column(BigInteger, ForeignKey("departments.id"), nullable=True)
    department_scope = Column(JSONB, nullable=True)
    keywords = Column(ARRAY(Text), nullable=True)
    version = Column(Text, default="1.0")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    owner_department = relationship("Department", back_populates="documents")

    def __repr__(self):
        return f"<Document(doc_id={self.doc_id}, title='{self.title[:50]}...', type={self.doc_type})>"

    def get_keywords_list(self) -> list:
        """Get keywords as a list"""
        return list(self.keywords or [])

    def get_department_scope_list(self) -> list:
        """Get department scope as a list"""
        if isinstance(self.department_scope, list):
            return self.department_scope
        return list(self.department_scope or [])
