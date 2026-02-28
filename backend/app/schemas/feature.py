"""Feature schemas."""
from decimal import Decimal

from pydantic import BaseModel, Field


class FeatureTaskCreate(BaseModel):
    """Task within a feature."""
    name: str = Field(..., min_length=1, max_length=500)
    effort_hours: Decimal = Field(..., ge=0)
    role: str = Field(..., min_length=1, max_length=100)
    fte: Decimal | None = None


class EffortAllocationCreate(BaseModel):
    role: str = Field(..., min_length=1, max_length=100)
    allocation_pct: Decimal = Field(..., ge=0, le=100)
    effort_hours: Decimal = Field(..., ge=0)
    fte: Decimal | None = None


class FeatureCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    priority: int = Field(default=1, ge=1)
    effort_hours: Decimal = Field(default=0, ge=0)
    effort_story_points: int | None = None
    effort_allocations: list[EffortAllocationCreate] = []
    tasks: list[FeatureTaskCreate] = []


class FeatureUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    priority: int | None = None
    effort_hours: Decimal | None = None
    effort_story_points: int | None = None
    effort_allocations: list[EffortAllocationCreate] | None = None
    tasks: list[FeatureTaskCreate] | None = None


class EffortAllocationResponse(BaseModel):
    id: int
    role: str
    allocation_pct: Decimal
    effort_hours: Decimal
    fte: Decimal | None

    class Config:
        from_attributes = True


class FeatureTaskResponse(BaseModel):
    name: str
    effort_hours: Decimal
    role: str
    fte: Decimal | None = None


class FeatureResponse(BaseModel):
    id: int
    version_id: int
    name: str
    description: str | None
    priority: int
    effort_hours: Decimal
    effort_story_points: int | None
    ai_suggested_effort: Decimal | None
    ai_suggested_approved: bool
    effort_allocations: list[EffortAllocationResponse] = []
    tasks: list[FeatureTaskResponse] = []

    class Config:
        from_attributes = True


class AIEstimateRequest(BaseModel):
    requirement_text: str = Field(..., min_length=1)


class AIEstimateResponse(BaseModel):
    features: list[FeatureCreate]
    raw_suggestion: str
