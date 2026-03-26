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
