"""Team member schemas."""
from decimal import Decimal

from pydantic import BaseModel, Field


class TeamMemberCreate(BaseModel):
    role: str = Field(..., min_length=1, max_length=100)
    member_name: str | None = None
    cost_rate_per_day: Decimal | None = None
    billing_rate_per_day: Decimal | None = None
    utilization_pct: Decimal = Field(default=80, ge=0, le=100)
    working_days_per_month: int = Field(default=20, ge=1, le=31)
    hours_per_day: int = Field(default=8, ge=1, le=24)


class TeamMemberUpdate(BaseModel):
    role: str | None = None
    member_name: str | None = None
    cost_rate_per_day: Decimal | None = None
    billing_rate_per_day: Decimal | None = None
    utilization_pct: Decimal | None = None
    working_days_per_month: int | None = None
    hours_per_day: int | None = None


class TeamMemberResponse(BaseModel):
    id: int
    version_id: int
    role: str
    member_name: str | None
    cost_rate_per_day: Decimal | None
    billing_rate_per_day: Decimal | None
    utilization_pct: Decimal
    working_days_per_month: int
    hours_per_day: int

    class Config:
        from_attributes = True


class AITeamSuggestionRequest(BaseModel):
    """Request body for AI team suggestion based on features."""

    features: list[dict]  # [{name, effort_hours, priority, ...}]


class AITeamSuggestionResponse(BaseModel):
    """AI-suggested team members (human-in-loop: user must approve before adding)."""

    members: list[TeamMemberCreate]
    raw_suggestion: str
