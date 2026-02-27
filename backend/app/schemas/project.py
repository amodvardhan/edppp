"""Project schemas."""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    client_name: str | None = None
    revenue_model: Literal["fixed", "t_m", "milestone"] = "fixed"
    currency: str = Field(..., min_length=3, max_length=3)
    sprint_duration_weeks: int = Field(default=2, ge=1, le=4)
    project_duration_months: int | None = None
    project_duration_sprints: int | None = None
    fixed_revenue: Decimal | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    client_name: str | None
    revenue_model: str
    currency: str
    sprint_duration_weeks: int
    project_duration_months: int | None
    project_duration_sprints: int | None
    fixed_revenue: Decimal | None
    created_by: int
    created_at: str

    class Config:
        from_attributes = True


class ProjectVersionUpdate(BaseModel):
    contingency_pct: Decimal | None = Field(None, ge=0, le=100)
    management_reserve_pct: Decimal | None = Field(None, ge=0, le=100)
    notes: str | None = None


# Allowed status transitions: Draft→Review, Review→Submitted, Submitted→Won
STATUS_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["review"],
    "review": ["submitted", "draft"],
    "submitted": ["won", "review"],
    "won": [],  # Locked; unlock reverts to submitted
}


class ProjectVersionResponse(BaseModel):
    id: int
    project_id: int
    version_number: int
    status: str
    is_locked: bool
    contingency_pct: Decimal
    management_reserve_pct: Decimal
    estimation_authority: str | None
    created_at: str

    class Config:
        from_attributes = True
