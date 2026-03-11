"""
Department model
"""
from sqlalchemy import Column, BigInteger, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Department(Base):
    """Department/organizational unit model"""
    __tablename__ = "departments"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(Text, nullable=False, unique=True)
    code = Column(Text, unique=True, nullable=True)
    parent_id = Column(BigInteger, ForeignKey("departments.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    parent = relationship("Department", remote_side=[id], backref="children")
    employees = relationship("Employee", back_populates="department")
    documents = relationship("Document", back_populates="owner_department")

    def __repr__(self):
        return f"<Department(id={self.id}, name='{self.name}', code='{self.code}')>"
