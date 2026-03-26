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
