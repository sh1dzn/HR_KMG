"""
Seed user accounts for all existing employees.
Run from backend dir: python -m scripts.seed_users
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.employee import Employee
from app.models.user import User, UserRole
from app.services.auth_service import hash_password
from app.config import settings


def seed_users():
    db: Session = SessionLocal()
    try:
        # Find which employee IDs are managers (someone references them as manager_id)
        manager_ids = set()
        rows = db.query(Employee.manager_id).filter(Employee.manager_id.isnot(None)).distinct().all()
        for (mid,) in rows:
            manager_ids.add(mid)

        # Parse admin employee IDs from config
        admin_ids = set()
        if settings.ADMIN_EMPLOYEE_IDS:
            for eid in settings.ADMIN_EMPLOYEE_IDS.split(","):
                eid = eid.strip()
                if eid.isdigit():
                    admin_ids.add(int(eid))

        # Get all active employees
        employees = db.query(Employee).filter(Employee.is_active == True).all()

        seed_password = (settings.DEFAULT_SEED_PASSWORD or "").strip()
        if len(seed_password) < 12:
            raise RuntimeError(
                "DEFAULT_SEED_PASSWORD must be set in .env and contain at least 12 characters."
            )

        password_hash = hash_password(seed_password)
        created = {"employee": 0, "manager": 0, "admin": 0}
        skipped = 0

        for emp in employees:
            existing = db.query(User).filter(User.employee_id == emp.id).first()
            if existing:
                skipped += 1
                continue

            if not emp.email:
                print(f"  SKIP: Employee {emp.id} ({emp.full_name}) has no email")
                skipped += 1
                continue

            existing_email = db.query(User).filter(User.email == emp.email).first()
            if existing_email:
                print(f"  SKIP: Email {emp.email} already in use (employee {emp.id})")
                skipped += 1
                continue

            if emp.id in admin_ids:
                role = UserRole.ADMIN
            elif emp.id in manager_ids:
                role = UserRole.MANAGER
            else:
                role = UserRole.EMPLOYEE

            user = User(
                email=emp.email,
                password_hash=password_hash,
                employee_id=emp.id,
                role=role,
                is_active=True,
                must_change_password=True,
            )
            db.add(user)
            created[role.value] += 1

        db.commit()

        total = sum(created.values())
        print(f"Seeding complete:")
        print(f"  Created: {total} users ({created['employee']} employees, {created['manager']} managers, {created['admin']} admins)")
        print(f"  Skipped: {skipped}")

    finally:
        db.close()


if __name__ == "__main__":
    seed_users()
