"""BU default rate schemas."""
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class RoleDefaultRateCreate(BaseModel):
    role: str = Field(..., min_length=1, max_length=100)
    cost_rate_per_day: Decimal = Field(..., ge=0)
    billing_rate_per_day: Decimal = Field(..., ge=0)

    @field_validator("role")
    @classmethod
    def strip_role(cls, v: str) -> str:
        return v.strip() if v else v


class RoleDefaultRateUpdate(BaseModel):
    cost_rate_per_day: Decimal | None = Field(None, ge=0)
    billing_rate_per_day: Decimal | None = Field(None, ge=0)


class RoleDefaultRateResponse(BaseModel):
    id: int
    role: str
    cost_rate_per_day: Decimal
    billing_rate_per_day: Decimal

    @field_validator("role")
    @classmethod
    def strip_role(cls, v: str) -> str:
        return v.strip() if v else v

    class Config:
        from_attributes = True
