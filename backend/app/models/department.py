"""
Department model
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Department(Base):
    """Department/organizational unit model"""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    parent = relationship("Department", remote_side=[id], backref="children")
    employees = relationship("Employee", back_populates="department")
    documents = relationship("Document", back_populates="owner_department")

    def __repr__(self):
        return f"<Department(id={self.id}, name='{self.name}', code='{self.code}')>"
