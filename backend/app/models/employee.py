"""
Employee and Position models
"""
from sqlalchemy import Column, BigInteger, Text, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base


class Position(Base):
    """Job position model"""
    __tablename__ = "positions"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    grade = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    employees = relationship("Employee", back_populates="position")

    def __repr__(self):
        return f"<Position(id={self.id}, name='{self.name}', grade='{self.grade}')>"


class Employee(Base):
    """Employee model"""
    __tablename__ = "employees"

    id = Column(BigInteger, primary_key=True, index=True)
    employee_code = Column(Text, unique=True, nullable=True)
    full_name = Column(Text, nullable=False)
    email = Column(Text, nullable=True)
    department_id = Column(BigInteger, ForeignKey("departments.id"), nullable=False)
    position_id = Column(BigInteger, ForeignKey("positions.id"), nullable=False)
    manager_id = Column(BigInteger, ForeignKey("employees.id"), nullable=True)
    hire_date = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    department = relationship("Department", back_populates="employees")
    position = relationship("Position", back_populates="employees")
    manager = relationship("Employee", remote_side=[id], backref="subordinates")
    goals = relationship("Goal", back_populates="employee")

    def __repr__(self):
        return f"<Employee(id={self.id}, name='{self.full_name}', code='{self.employee_code}')>"
