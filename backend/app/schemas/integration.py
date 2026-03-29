"""
Schemas for sandbox HR system integrations.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class IntegrationSystemInfo(BaseModel):
    code: str
    name: str
    description: str
    status: str


class IntegrationSystemsResponse(BaseModel):
    systems: List[IntegrationSystemInfo]


class GoalsExportRequest(BaseModel):
    employee_id: int = Field(..., description="ID сотрудника")
    quarter: Optional[str] = Field(None, pattern="^Q[1-4]$", description="Квартал")
    year: Optional[int] = Field(None, ge=2020, le=2030, description="Год")
    target_system: str = Field(..., description="1c/sap/oracle")
    include_drafts: bool = Field(True, description="Включать черновики")
    dispatch_mode: Literal["sync", "queued"] = Field("sync", description="Режим отправки")
    simulate_result: Literal["success", "timeout", "auth_error", "validation_error", "random"] = Field(
        "success",
        description="Симуляция результата интеграции для sandbox-демо",
    )


class GoalExportReference(BaseModel):
    goal_id: str
    external_ref: str


class GoalsExportResponse(BaseModel):
    batch_id: str
    target_system: str
    employee_id: int
    employee_name: str
    exported_count: int
    message: str
    payload: dict
    goal_refs: List[GoalExportReference]
    delivery_status: Literal["queued", "sent", "failed", "confirmed"] = "sent"
    delivery_error_code: Optional[str] = None
    delivery_error_message: Optional[str] = None
    mode: str = "demo_sandbox"


class IntegrationBatchInfo(BaseModel):
    batch_id: str
    target_system: str
    employee_id: int
    employee_name: str
    exported_count: int
    status: Literal["queued", "sent", "failed", "confirmed"]
    mode: str = "demo_sandbox"
    attempt_count: int = 1
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    requested_at: str
    updated_at: str


class IntegrationBatchesResponse(BaseModel):
    items: List[IntegrationBatchInfo]
    total: int


class IntegrationBatchCallbackRequest(BaseModel):
    result: Literal["confirmed", "failed"] = Field(..., description="Результат callback от HRIS")
    error_message: Optional[str] = Field(None, description="Текст ошибки, если callback=failed")


class IntegrationBatchRetryRequest(BaseModel):
    simulate_result: Literal["success", "timeout", "auth_error", "validation_error", "random"] = Field(
        "success",
        description="Сценарий повторной отправки в sandbox-режиме",
    )


class IntegrationHealthResponse(BaseModel):
    mode: str = "demo_sandbox"
    total_batches: int
    queued: int
    sent: int
    confirmed: int
    failed: int
    success_rate: float
    last_batch_at: Optional[str] = None
