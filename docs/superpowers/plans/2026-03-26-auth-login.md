# Auth & Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based authentication with role-based access control to the HR_KMG application using the existing PostgreSQL database.

**Architecture:** New `users` and `refresh_tokens` tables in PostgreSQL, FastAPI auth service with JWT access+refresh tokens, React AuthContext with protected routes, seed script for 450 existing employees.

**Tech Stack:** FastAPI, SQLAlchemy, python-jose, passlib[bcrypt], React Context API, Axios interceptors, httpOnly cookies

---

### Task 1: Add Backend Dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add auth packages to requirements.txt**

Add these two lines to the end of `backend/requirements.txt`:

```
# Authentication
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
```

- [ ] **Step 2: Add auth settings to config.py**

In `backend/app/config.py`, add these fields to the `Settings` class after the `MAX_GOALS_PER_EMPLOYEE` line (line 36):

```python
    # Authentication
    JWT_SECRET_KEY: str = "change-me-in-production-use-a-64-char-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DEFAULT_SEED_PASSWORD: str = "KMG2026!"
    ADMIN_EMPLOYEE_IDS: str = ""
```

- [ ] **Step 3: Add env vars to .env**

Append to `.env`:

```env
JWT_SECRET_KEY=hR_kMg_2026_s3cur3_jwt_k3y_f0r_pr0duct10n_ch4ng3_m3_pl34s3_64ch
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
DEFAULT_SEED_PASSWORD=KMG2026!
ADMIN_EMPLOYEE_IDS=
```

- [ ] **Step 4: Install dependencies**

Run: `cd /root/HR_KMG/backend && pip install python-jose[cryptography]==3.3.0 passlib[bcrypt]==1.7.4`
Expected: Successfully installed packages

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app/config.py .env
git commit -m "feat(auth): add JWT and bcrypt dependencies, auth config settings"
```

---

### Task 2: User and RefreshToken Models

**Files:**
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create User and RefreshToken models**

Create `backend/app/models/user.py`:

```python
"""
User and RefreshToken models for authentication
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, BigInteger, text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from enum import Enum

from app.database import Base


class UserRole(str, Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    employee_id = Column(BigInteger, ForeignKey("employees.id"), unique=True, nullable=False)
    role = Column(
        SQLEnum(UserRole, name="userrole", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
        default=UserRole.EMPLOYEE,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    must_change_password = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    employee = relationship("Employee", backref="user", uselist=False)
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', role={self.role})>"


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="refresh_tokens")

    def __repr__(self):
        return f"<RefreshToken(id={self.id}, user_id={self.user_id}, expires_at={self.expires_at})>"
```

- [ ] **Step 2: Register models in __init__.py**

Replace the contents of `backend/app/models/__init__.py`:

```python
"""
Database models for HR AI Module
"""
from app.models.department import Department
from app.models.employee import Employee, Position
from app.models.goal import Goal, GoalEvent, GoalEventType, GoalReview, GoalStatus, Quarter, ReviewVerdict
from app.models.document import Document, DocumentType
from app.models.user import User, UserRole, RefreshToken

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
]
```

- [ ] **Step 3: Verify imports work**

Run: `cd /root/HR_KMG/backend && python -c "from app.models.user import User, UserRole, RefreshToken; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/user.py backend/app/models/__init__.py
git commit -m "feat(auth): add User and RefreshToken SQLAlchemy models"
```

---

### Task 3: Database Migration — Create Tables

**Files:**
- Create: `backend/scripts/create_auth_tables.py`

- [ ] **Step 1: Create migration script**

Create `backend/scripts/create_auth_tables.py`:

```python
"""
Create users and refresh_tokens tables in existing PostgreSQL database.
Run from backend dir: python -m scripts.create_auth_tables
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


def create_tables():
    with engine.begin() as conn:
        # Create enum type if it doesn't exist
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE userrole AS ENUM ('employee', 'manager', 'admin');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """))

        # Create users table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                employee_id BIGINT NOT NULL UNIQUE REFERENCES employees(id),
                role userrole NOT NULL DEFAULT 'employee',
                is_active BOOLEAN NOT NULL DEFAULT true,
                must_change_password BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))

        # Create refresh_tokens table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))

        # Create indexes
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens(user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens(expires_at);"))

    print("Auth tables created successfully.")


if __name__ == "__main__":
    create_tables()
```

- [ ] **Step 2: Create the __init__.py for scripts package**

Create `backend/scripts/__init__.py` (empty file):

```python
```

- [ ] **Step 3: Run the migration**

Run: `cd /root/HR_KMG/backend && python -m scripts.create_auth_tables`
Expected: `Auth tables created successfully.`

- [ ] **Step 4: Verify tables exist**

Run: `cd /root/HR_KMG/backend && python -c "from sqlalchemy import text; from app.database import engine; r = engine.connect().execute(text(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('users','refresh_tokens')\")); print([row[0] for row in r])"`
Expected: `['users', 'refresh_tokens']`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/
git commit -m "feat(auth): add migration script for users and refresh_tokens tables"
```

---

### Task 4: Auth Service — Password Hashing and JWT

**Files:**
- Create: `backend/app/services/auth_service.py`

- [ ] **Step 1: Create auth service**

Create `backend/app/services/auth_service.py`:

```python
"""
Authentication service — JWT tokens, password hashing, user authentication
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User, RefreshToken

logger = logging.getLogger("hr_ai.auth")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "employee_id": user.employee_id,
        "exp": expires,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def create_refresh_token(db: Session, user: User) -> str:
    raw_token = str(uuid.uuid4())
    token_hash = pwd_context.hash(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    rt = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(rt)
    db.commit()
    return raw_token


def validate_refresh_token(db: Session, raw_token: str) -> Optional[User]:
    now = datetime.now(timezone.utc)
    tokens = db.query(RefreshToken).filter(RefreshToken.expires_at > now).all()
    for rt in tokens:
        if pwd_context.verify(raw_token, rt.token_hash):
            user = rt.user
            if user and user.is_active:
                return user
    return None


def rotate_refresh_token(db: Session, raw_token: str, user: User) -> Optional[str]:
    now = datetime.now(timezone.utc)
    tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.expires_at > now,
    ).all()
    for rt in tokens:
        if pwd_context.verify(raw_token, rt.token_hash):
            db.delete(rt)
            db.flush()
            new_token = create_refresh_token(db, user)
            return new_token
    return None


def revoke_all_user_tokens(db: Session, user_id) -> int:
    count = db.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete(synchronize_session=False)
    db.commit()
    return count


def cleanup_expired_tokens(db: Session) -> int:
    now = datetime.now(timezone.utc)
    count = db.query(RefreshToken).filter(RefreshToken.expires_at <= now).delete(synchronize_session=False)
    db.commit()
    return count


def authenticate(db: Session, email: str, password: str) -> Optional[User]:
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
```

- [ ] **Step 2: Verify service imports work**

Run: `cd /root/HR_KMG/backend && python -c "from app.services.auth_service import authenticate, create_access_token, hash_password; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/auth_service.py
git commit -m "feat(auth): add auth service with JWT, bcrypt, token rotation"
```

---

### Task 5: Auth Dependencies — get_current_user and Role Checks

**Files:**
- Create: `backend/app/dependencies/__init__.py`
- Create: `backend/app/dependencies/auth.py`

- [ ] **Step 1: Create dependencies package**

Create `backend/app/dependencies/__init__.py` (empty):

```python
```

- [ ] **Step 2: Create auth dependencies**

Create `backend/app/dependencies/auth.py`:

```python
"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth_service import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден или неактивен")

    return user


def require_role(*allowed_roles: str):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
        if user_role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return current_user
    return role_checker
```

- [ ] **Step 3: Verify dependencies work**

Run: `cd /root/HR_KMG/backend && python -c "from app.dependencies.auth import get_current_user, require_role; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/dependencies/
git commit -m "feat(auth): add FastAPI auth dependencies (get_current_user, require_role)"
```

---

### Task 6: Auth Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/auth.py`

- [ ] **Step 1: Create auth schemas**

Create `backend/app/schemas/auth.py`:

```python
"""
Pydantic schemas for authentication API
"""
from typing import Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email пользователя")
    password: str = Field(..., min_length=1, description="Пароль")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool
    user: "UserProfile"


class UserProfile(BaseModel):
    id: str
    email: str
    role: str
    employee_id: int
    employee_name: Optional[str] = None
    department_name: Optional[str] = None
    position_name: Optional[str] = None
    must_change_password: bool

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, description="Новый пароль (мин. 8 символов)")


class ChangePasswordResponse(BaseModel):
    message: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


LoginResponse.model_rebuild()
```

- [ ] **Step 2: Verify schemas**

Run: `cd /root/HR_KMG/backend && python -c "from app.schemas.auth import LoginRequest, LoginResponse, UserProfile, ChangePasswordRequest, RefreshResponse; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/auth.py
git commit -m "feat(auth): add Pydantic schemas for auth API"
```

---

### Task 7: Auth API Router

**Files:**
- Create: `backend/app/api/auth.py`
- Modify: `backend/app/api/__init__.py`

- [ ] **Step 1: Create auth router**

Create `backend/app/api/auth.py`:

```python
"""
Authentication API endpoints
"""
import time
import logging
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    LoginRequest,
    LoginResponse,
    RefreshResponse,
    UserProfile,
)
from app.services.auth_service import (
    authenticate,
    cleanup_expired_tokens,
    create_access_token,
    create_refresh_token,
    hash_password,
    revoke_all_user_tokens,
    rotate_refresh_token,
    validate_refresh_token,
    verify_password,
)

logger = logging.getLogger("hr_ai.auth")

router = APIRouter()

# Simple in-memory rate limiter for login
_login_attempts: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 5  # attempts per window


def _check_rate_limit(client_ip: str):
    now = time.time()
    attempts = _login_attempts[client_ip]
    _login_attempts[client_ip] = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    if len(_login_attempts[client_ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Слишком много попыток входа. Повторите через минуту.")
    _login_attempts[client_ip].append(now)


REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds


def _set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="strict",
        path="/api/auth",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )


def _clear_refresh_cookie(response: Response):
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/auth")


def _build_user_profile(user: User) -> UserProfile:
    emp = user.employee
    return UserProfile(
        id=str(user.id),
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        employee_id=user.employee_id,
        employee_name=emp.full_name if emp else None,
        department_name=emp.department.name if emp and emp.department else None,
        position_name=emp.position.name if emp and emp.position else None,
        must_change_password=user.must_change_password,
    )


@router.post("/login", response_model=LoginResponse)
async def login(request: Request, body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    user = authenticate(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль")

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(db, user)
    _set_refresh_cookie(response, refresh_token)

    # Cleanup expired tokens opportunistically
    cleanup_expired_tokens(db)

    return LoginResponse(
        access_token=access_token,
        must_change_password=user.must_change_password,
        user=_build_user_profile(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token отсутствует")

    user = validate_refresh_token(db, raw_token)
    if not user:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token недействителен или истёк")

    new_refresh = rotate_refresh_token(db, raw_token, user)
    if not new_refresh:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не удалось обновить токен")

    access_token = create_access_token(user)
    _set_refresh_cookie(response, new_refresh)

    return RefreshResponse(access_token=access_token)


@router.post("/logout")
async def logout(response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    revoke_all_user_tokens(db, current_user.id)
    _clear_refresh_cookie(response)
    return {"message": "Выход выполнен"}


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    return _build_user_profile(current_user)


@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный текущий пароль")

    if body.old_password == body.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Новый пароль должен отличаться от текущего")

    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()

    return ChangePasswordResponse(message="Пароль успешно изменён")
```

- [ ] **Step 2: Register auth router in api/__init__.py**

In `backend/app/api/__init__.py`, add the import and router registration. The file should become:

```python
"""
API Routes for HR AI Module
"""
from fastapi import APIRouter
from app.api import alerts, auth, goals, evaluation, generation, dashboard, employees, integrations

api_router = APIRouter()

# Auth router (public + authenticated)
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Авторизация"],
)

# Include all routers
api_router.include_router(
    employees.router,
    prefix="/employees",
    tags=["Сотрудники"],
)

api_router.include_router(
    goals.router,
    prefix="/goals",
    tags=["Цели"],
)

api_router.include_router(
    evaluation.router,
    prefix="/evaluation",
    tags=["Оценка целей (SMART)"],
)

api_router.include_router(
    generation.router,
    prefix="/generation",
    tags=["Генерация целей (RAG)"],
)

api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Аналитика и дашборд"],
)

api_router.include_router(
    alerts.router,
    prefix="/alerts",
    tags=["Алерты качества"],
)

api_router.include_router(
    integrations.router,
    prefix="/integrations",
    tags=["Интеграции (1C/SAP/Oracle)"],
)


# OpenAPI tag metadata for Swagger UI ordering and descriptions
TAGS_METADATA = [
    {"name": "Авторизация", "description": "Вход, выход, обновление токена, смена пароля"},
    {"name": "Служебные", "description": "Health check и метаинформация сервиса"},
    {"name": "Сотрудники", "description": "Список сотрудников с поиском и фильтрацией по подразделению"},
    {"name": "Цели", "description": "CRUD целей, workflow согласования (submit/approve/reject/comment), аудит-трейл"},
    {"name": "Оценка целей (SMART)", "description": "Оценка одной цели или пакетная оценка по SMART-методологии, переформулировка"},
    {"name": "Генерация целей (RAG)", "description": "AI-генерация целей на основе ВНД и стратегии, каскадирование, управление индексом"},
    {"name": "Аналитика и дашборд", "description": "Сводная статистика, индекс зрелости, тренды по кварталам"},
    {"name": "Алерты качества", "description": "Уведомления о слабых целях, дисбалансе весов, стагнации согласования"},
    {"name": "Интеграции (1C/SAP/Oracle)", "description": "Mock-экспорт целей во внешние HR-системы"},
]
```

- [ ] **Step 3: Test auth endpoints are registered**

Run: `cd /root/HR_KMG/backend && python -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/auth/login' in routes, f'Missing login route. Routes: {routes}'; print('Auth routes registered OK')"`
Expected: `Auth routes registered OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/auth.py backend/app/api/__init__.py backend/app/schemas/auth.py
git commit -m "feat(auth): add auth API router with login, refresh, logout, me, change-password"
```

---

### Task 8: Seed Script — Create User Accounts for Existing Employees

**Files:**
- Create: `backend/scripts/seed_users.py`

- [ ] **Step 1: Create seed script**

Create `backend/scripts/seed_users.py`:

```python
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

        password_hash = hash_password(settings.DEFAULT_SEED_PASSWORD)
        created = {"employee": 0, "manager": 0, "admin": 0}
        skipped = 0

        for emp in employees:
            # Skip if user already exists for this employee
            existing = db.query(User).filter(User.employee_id == emp.id).first()
            if existing:
                skipped += 1
                continue

            if not emp.email:
                print(f"  SKIP: Employee {emp.id} ({emp.full_name}) has no email")
                skipped += 1
                continue

            # Check if email is already taken by another user
            existing_email = db.query(User).filter(User.email == emp.email).first()
            if existing_email:
                print(f"  SKIP: Email {emp.email} already in use (employee {emp.id})")
                skipped += 1
                continue

            # Determine role
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
```

- [ ] **Step 2: Run the seed script**

Run: `cd /root/HR_KMG/backend && python -m scripts.seed_users`
Expected: Output showing users created (e.g., `Created: 450 users (X employees, Y managers, 0 admins)`)

- [ ] **Step 3: Verify users exist in database**

Run: `cd /root/HR_KMG/backend && python -c "from app.database import SessionLocal; from app.models.user import User, UserRole; db = SessionLocal(); total = db.query(User).count(); managers = db.query(User).filter(User.role == UserRole.MANAGER).count(); print(f'Total users: {total}, Managers: {managers}'); db.close()"`
Expected: Shows total users and manager count

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/seed_users.py
git commit -m "feat(auth): add user seed script for existing employees"
```

---

### Task 9: Protect Existing API Routes

**Files:**
- Modify: `backend/app/api/goals.py`
- Modify: `backend/app/api/evaluation.py`
- Modify: `backend/app/api/generation.py`
- Modify: `backend/app/api/dashboard.py`
- Modify: `backend/app/api/alerts.py`
- Modify: `backend/app/api/employees.py`
- Modify: `backend/app/api/integrations.py`

- [ ] **Step 1: Protect goals router (employee+)**

In `backend/app/api/goals.py`, add imports at the top (after line 8):

```python
from app.dependencies.auth import get_current_user
from app.models.user import User
```

Add `current_user` dependency to each endpoint. For `get_goals` (line 222), add data scoping by role. Replace the function signature and the query-building section:

Find:
```python
@router.get("/", response_model=GoalListResponse)
async def get_goals(
    employee_id: Optional[int] = None,
    department_id: Optional[int] = None,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Получить список целей с фильтрацией
    """
    query = db.query(Goal)

    if employee_id:
        query = query.filter(Goal.employee_id == employee_id)
    if department_id:
        query = query.join(Employee).filter(Employee.department_id == department_id)
```

Replace with:
```python
@router.get("/", response_model=GoalListResponse)
async def get_goals(
    employee_id: Optional[int] = None,
    department_id: Optional[int] = None,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Получить список целей с фильтрацией
    """
    query = db.query(Goal)

    # Role-based data scoping
    user_role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    if user_role == "employee":
        query = query.filter(Goal.employee_id == current_user.employee_id)
    elif user_role == "manager":
        sub_ids = [s.id for s in current_user.employee.subordinates] if current_user.employee else []
        allowed_ids = [current_user.employee_id] + sub_ids
        query = query.filter(Goal.employee_id.in_(allowed_ids))
    # admin: no filter

    if employee_id:
        query = query.filter(Goal.employee_id == employee_id)
    if department_id:
        query = query.join(Employee).filter(Employee.department_id == department_id)
```

For all other goal endpoints (`get_goal`, `get_goal_workflow`, `create_goal`, `update_goal`, `submit_goal`, `approve_goal`, `reject_goal`, `comment_goal`, `delete_goal`), add `current_user: User = Depends(get_current_user)` to the function signature.

- [ ] **Step 2: Protect evaluation router (employee+)**

In `backend/app/api/evaluation.py`, add at the top imports:
```python
from app.dependencies.auth import get_current_user
from app.models.user import User
```

Add `current_user: User = Depends(get_current_user)` parameter to all endpoint functions.

- [ ] **Step 3: Protect generation router (employee+)**

In `backend/app/api/generation.py`, add the same imports and `current_user: User = Depends(get_current_user)` to all endpoint functions.

- [ ] **Step 4: Protect dashboard router (manager+)**

In `backend/app/api/dashboard.py`, add imports:
```python
from app.dependencies.auth import require_role
from app.models.user import User
```

Add `current_user: User = Depends(require_role("manager", "admin"))` to all endpoint functions.

- [ ] **Step 5: Protect alerts router (manager+)**

In `backend/app/api/alerts.py`, add imports:
```python
from app.dependencies.auth import require_role
from app.models.user import User
```

Add `current_user: User = Depends(require_role("manager", "admin"))` to the `get_alerts_summary` endpoint.

- [ ] **Step 6: Protect employees router (manager+)**

In `backend/app/api/employees.py`, add imports:
```python
from app.dependencies.auth import require_role
from app.models.user import User
```

Add `current_user: User = Depends(require_role("manager", "admin"))` to the `get_employees` endpoint.

- [ ] **Step 7: Protect integrations router (admin only)**

In `backend/app/api/integrations.py`, add imports:
```python
from app.dependencies.auth import require_role
from app.models.user import User
```

Add `current_user: User = Depends(require_role("admin"))` to both endpoints.

- [ ] **Step 8: Update main.py description**

In `backend/app/main.py`, replace line 53:
```
Все эндпоинты принимают и возвращают JSON. Аутентификация не требуется
(хакатонный контур). Для production-интеграции добавьте Bearer-токен
через middleware.
```

With:
```
Все эндпоинты принимают и возвращают JSON. Авторизация через JWT Bearer-токен.
Получите токен через POST /api/auth/login.
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/ backend/app/main.py
git commit -m "feat(auth): protect all API routes with JWT auth and role checks"
```

---

### Task 10: Frontend Auth Context

**Files:**
- Create: `frontend/src/contexts/AuthContext.jsx`

- [ ] **Step 1: Create AuthContext**

Create `frontend/src/contexts/AuthContext.jsx`:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

// Module-level access token storage (not in localStorage for security)
let accessToken = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const isAuthenticated = !!user
  const role = user?.role || null

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout')
    } catch {
      // ignore errors on logout
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const res = await client.post('/auth/refresh', null, { withCredentials: true })
      setAccessToken(res.data.access_token)
      // Fetch user profile
      const me = await client.get('/auth/me', {
        headers: { Authorization: `Bearer ${res.data.access_token}` },
      })
      setUser(me.data)
      return true
    } catch {
      setAccessToken(null)
      setUser(null)
      return false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await client.post('/auth/login', { email, password }, { withCredentials: true })
    setAccessToken(res.data.access_token)
    setUser(res.data.user)
    return res.data
  }, [])

  // On mount: try silent refresh
  useEffect(() => {
    refreshToken().finally(() => setLoading(false))
  }, [refreshToken])

  const value = {
    user,
    role,
    isAuthenticated,
    loading,
    login,
    logout,
    refreshToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Verify file created**

Run: `ls -la /root/HR_KMG/frontend/src/contexts/AuthContext.jsx`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/AuthContext.jsx
git commit -m "feat(auth): add React AuthContext with token management"
```

---

### Task 11: Axios Interceptors

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add auth interceptors to client.js**

Add the following after the `client` creation (after line 14) and before the `getSelectedModel` function:

```javascript
// ─── Auth token interceptors ────────────────────────────────────────────────
import { getAccessToken, setAccessToken } from '../contexts/AuthContext'

// Request interceptor: attach Bearer token
client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Always send cookies for /auth endpoints
  if (config.url?.startsWith('/auth')) {
    config.withCredentials = true
  }
  return config
})

// Response interceptor: handle 401 with token refresh
let isRefreshing = false
let refreshQueue = []

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return client(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await client.post('/auth/refresh', null, { withCredentials: true })
        const newToken = res.data.access_token
        setAccessToken(newToken)
        refreshQueue.forEach(({ resolve }) => resolve(newToken))
        refreshQueue = []
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      } catch (refreshError) {
        refreshQueue.forEach(({ reject }) => reject(refreshError))
        refreshQueue = []
        setAccessToken(null)
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)
```

- [ ] **Step 2: Add auth API functions to client.js**

Add these exports at the end of the file (before `export default client`):

```javascript
// Auth API
export const authLogin = async (email, password) => {
  const response = await client.post('/auth/login', { email, password }, { withCredentials: true })
  return response.data
}

export const authRefresh = async () => {
  const response = await client.post('/auth/refresh', null, { withCredentials: true })
  return response.data
}

export const authLogout = async () => {
  const response = await client.post('/auth/logout', null, { withCredentials: true })
  return response.data
}

export const authMe = async () => {
  const response = await client.get('/auth/me')
  return response.data
}

export const authChangePassword = async (oldPassword, newPassword) => {
  const response = await client.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
  return response.data
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat(auth): add Axios auth interceptors and auth API functions"
```

---

### Task 12: Login Page

**Files:**
- Create: `frontend/src/pages/Login.jsx`

- [ ] **Step 1: Create Login page**

Create `frontend/src/pages/Login.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import KmgLogo from '../components/KmgLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      if (data.must_change_password) {
        navigate('/change-password')
      } else {
        navigate('/')
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'Ошибка входа. Проверьте email и пароль.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="gradient-brand flex h-12 w-12 items-center justify-center rounded-xl" style={{ boxShadow: '0px 1px 2px rgba(10,13,18,0.10)' }}>
            <KmgLogo className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Performance Goals</h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>КМГ-КУМКОЛЬ</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
              placeholder="Введите пароль"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="gradient-brand w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Login.jsx
git commit -m "feat(auth): add Login page"
```

---

### Task 13: Change Password Page

**Files:**
- Create: `frontend/src/pages/ChangePassword.jsx`

- [ ] **Step 1: Create ChangePassword page**

Create `frontend/src/pages/ChangePassword.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authChangePassword } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import KmgLogo from '../components/KmgLogo'

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { refreshToken } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Новый пароль должен содержать не менее 8 символов')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      await authChangePassword(oldPassword, newPassword)
      // Refresh user profile to clear must_change_password flag
      await refreshToken()
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'Ошибка смены пароля')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="gradient-brand flex h-12 w-12 items-center justify-center rounded-xl" style={{ boxShadow: '0px 1px 2px rgba(10,13,18,0.10)' }}>
            <KmgLogo className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Смена пароля</h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Необходимо установить новый пароль</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Текущий пароль</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Новый пароль</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
              placeholder="Минимум 8 символов"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Подтвердите пароль</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="gradient-brand w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          >
            {loading ? 'Сохранение...' : 'Сменить пароль'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ChangePassword.jsx
git commit -m "feat(auth): add ChangePassword page with validation"
```

---

### Task 14: Integrate Auth into App.jsx

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Wrap app in AuthProvider in main.jsx**

Replace `frontend/src/main.jsx` with:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 2: Add auth imports and ProtectedRoute to App.jsx**

At the top of `frontend/src/App.jsx`, add these imports after the existing ones (after line 12):

```jsx
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import { useAuth } from './contexts/AuthContext'
import { Navigate } from 'react-router-dom'
```

Add a `ProtectedRoute` component right before the `App` function (before line 184):

```jsx
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, loading, user } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.must_change_password) return <Navigate to="/change-password" replace />
  if (allowedRoles) {
    const userRole = user?.role
    if (!allowedRoles.includes(userRole)) return <Navigate to="/" replace />
  }
  return children
}
```

- [ ] **Step 3: Update navigation config for role-based visibility**

Replace the `navigation` array (lines 86-132) with role metadata:

```javascript
const navigation = [
  {
    name: 'Главная', href: '/',
    icon: HomeIcon,
    roles: ['employee', 'manager', 'admin'],
  },
  {
    name: 'Дашборд', href: '/dashboard',
    icon: BarChartIcon,
    roles: ['manager', 'admin'],
  },
  {
    name: 'Оценка целей', href: '/evaluation',
    icon: ChecklistIcon,
    roles: ['employee', 'manager', 'admin'],
  },
  { divider: true },
  {
    name: 'Сотрудники',
    icon: UsersIcon,
    href: '/employees',
    badgeKey: 'employees',
    roles: ['employee', 'manager', 'admin'],
    filters: [
      { label: 'Все',              href: '/employees' },
      { label: 'Черновики',        href: '/employees?status=draft',       dot: 'var(--fg-quaternary)' },
      { label: 'На согласовании',  href: '/employees?status=submitted',   dot: 'var(--text-warning-primary)' },
      { label: 'Утверждённые',     href: '/employees?status=approved',    dot: 'var(--fg-success-primary)' },
      { label: 'В работе',         href: '/employees?status=in_progress', dot: 'var(--fg-brand-primary)' },
      { label: 'Выполненные',      href: '/employees?status=done',        dot: 'var(--fg-success-primary)' },
    ],
  },
  {
    name: 'Согласование', href: '/approvals',
    icon: ChecklistIcon,
    badgeKey: 'pending',
    roles: ['employee', 'manager', 'admin'],
  },
  { divider: true },
  {
    name: 'Генерация целей', href: '/generation',
    icon: StarIcon,
    roles: ['employee', 'manager', 'admin'],
  },
  {
    name: 'Операции', href: '/operations',
    icon: BellIcon,
    roles: ['admin'],
  },
  {
    name: 'Настройки', href: '/settings',
    icon: SettingsIcon,
    roles: ['employee', 'manager', 'admin'],
  },
]
```

- [ ] **Step 4: Filter navigation by role in the sidebar**

In the `App` function, inside the `<nav>` where `navigation.map` is called, add role filtering. Replace:

```jsx
          {navigation.map((item, idx) => {
            if (item.divider) {
```

With:

```jsx
          {navigation.filter((item) => item.divider || !item.roles || item.roles.includes(role)).map((item, idx) => {
            if (item.divider) {
```

(Where `role` comes from `useAuth()` — see next step.)

- [ ] **Step 5: Add useAuth to App function and update sidebar footer**

At the top of the `App` function (line 185), add:

```javascript
  const { isAuthenticated, loading, user, role, logout } = useAuth()
```

Replace the sidebar footer section showing "HR Admin" (lines 462-471) with dynamic user info:

```jsx
              <div className="flex items-center gap-3 px-1">
                <div className="gradient-brand flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                  {user?.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.employee_name || 'User'}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {user?.role === 'admin' ? 'Администратор' : user?.role === 'manager' ? 'Руководитель' : 'Сотрудник'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Выйти"
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--fg-quaternary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
```

- [ ] **Step 6: Update Routes to use ProtectedRoute**

Replace the `<Routes>` block (lines 527-536) with:

```jsx
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/evaluation" element={<ProtectedRoute><GoalEvaluation /></ProtectedRoute>} />
            <Route path="/generation" element={<ProtectedRoute><GoalGeneration /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Dashboard /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute><EmployeeGoals /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute allowedRoles={['admin']}><Operations /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute><Approvals /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          </Routes>
```

- [ ] **Step 7: Hide sidebar on login/change-password pages**

Wrap the sidebar and header in a conditional. At the start of the `return` in `App`, before the sidebar `<aside>`, add:

```jsx
  // Don't show sidebar on auth pages
  if (!isAuthenticated && !loading) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
      </div>
    )
  }
```

This should be placed right before the existing `return (` in the App function (before line 272).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/main.jsx frontend/src/App.jsx
git commit -m "feat(auth): integrate auth into App with protected routes, role-based nav, user profile"
```

---

### Task 15: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify backend starts**

Run: `cd /root/HR_KMG/backend && timeout 10 python -c "from app.main import app; print('App created OK')" 2>&1`
Expected: `App created OK`

- [ ] **Step 2: Verify auth flow works programmatically**

Run:
```bash
cd /root/HR_KMG/backend && python -c "
from app.database import SessionLocal
from app.models.user import User
from app.services.auth_service import authenticate, create_access_token, decode_access_token

db = SessionLocal()
# Get first user
user = db.query(User).first()
print(f'Test user: {user.email} role={user.role}')

# Test authentication
authed = authenticate(db, user.email, 'KMG2026!')
print(f'Auth result: {authed is not None}')

# Test JWT
token = create_access_token(authed)
decoded = decode_access_token(token)
print(f'JWT decoded: sub={decoded[\"sub\"]}, role={decoded[\"role\"]}')

db.close()
print('All auth checks passed!')
"
```
Expected: `All auth checks passed!`

- [ ] **Step 3: Verify frontend builds**

Run: `cd /root/HR_KMG/frontend && npm run build 2>&1 | tail -5`
Expected: Build completes without errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(auth): complete JWT auth system with login, RBAC, seed script"
```
