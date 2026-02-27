"""Calculation result schemas."""
from decimal import Decimal

from pydantic import BaseModel


class CostBreakdown(BaseModel):
    base_cost: Decimal
    risk_buffer: Decimal
    total_cost: Decimal
    contingency_pct: Decimal
    management_reserve_pct: Decimal


class RevenueBreakdown(BaseModel):
    revenue: Decimal
    revenue_model: str


class ProfitabilityBreakdown(BaseModel):
    revenue: Decimal
    cost: Decimal
    gross_margin_pct: Decimal | None
    net_margin_pct: Decimal | None
    margin_below_threshold: bool


class SprintAllocation(BaseModel):
    sprint_capacity_hours: Decimal
    total_effort_hours: Decimal
    sprints_required: int
    effort_per_sprint: Decimal


class ReverseMarginResult(BaseModel):
    target_margin_pct: Decimal
    required_revenue: Decimal
    required_billing_rate: Decimal | None
