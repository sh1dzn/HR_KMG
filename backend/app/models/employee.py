"""
Employee and Position models
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Position(Base):
    """Job position model"""
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    grade = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    employees = relationship("Employee", back_populates="position")

    def __repr__(self):
        return f"<Position(id={self.id}, name='{self.name}', grade='{self.grade}')>"


class Employee(Base):
    """Employee model"""
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    employee_code = Column(String(50), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    hire_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    department = relationship("Department", back_populates="employees")
    position = relationship("Position", back_populates="employees")
    manager = relationship("Employee", remote_side=[id], backref="subordinates")
    goals = relationship("Goal", back_populates="employee")

    def __repr__(self):
        return f"<Employee(id={self.id}, name='{self.full_name}', code='{self.employee_code}')>"
