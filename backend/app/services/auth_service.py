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
