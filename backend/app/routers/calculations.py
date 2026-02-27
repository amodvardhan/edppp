"""Calculation API routes."""
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.database import get_db
from app.engine.calculator import CalculationEngine
from app.models.bu_rate import RoleDefaultRate
from app.models.feature import Feature
from app.models.project import Project, ProjectVersion, RevenueModel
from app.models.team import TeamMember
from app.models.user import User
from app.schemas.calculation import (
    CostBreakdown,
    ProfitabilityBreakdown,
    RevenueBreakdown,
    ReverseMarginResult,
    SprintAllocation,
)

router = APIRouter(prefix="/projects", tags=["calculations"])


async def _get_default_rates(db: AsyncSession) -> dict[str, tuple[Decimal, Decimal]]:
    result = await db.execute(select(RoleDefaultRate))
    return {r.role.strip(): (r.cost_rate_per_day, r.billing_rate_per_day) for r in result.scalars().all()}


async def _load_version_data(db: AsyncSession, project_id: int):
    result = await db.execute(
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .limit(1)
        .options(
            selectinload(ProjectVersion.team_members),
            selectinload(ProjectVersion.features).selectinload(Feature.effort_allocations),
            selectinload(ProjectVersion.sprint_config),
            selectinload(ProjectVersion.project),
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Project not found")
    project = version.project
    return version, project


@router.get("/{project_id}/calculations/cost", response_model=CostBreakdown)
async def get_cost(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    version, _ = await _load_version_data(db, project_id)
    default_rates = await _get_default_rates(db)
    engine = CalculationEngine()
    effort_allocations = {}
    for f in version.features:
        effort_allocations[f.id] = list(f.effort_allocations) if f.effort_allocations else []
    base_cost = engine.base_cost(
        list(version.team_members),
        list(version.features),
        effort_allocations,
        default_rates,
    )
    base, buffer, total = engine.cost_with_buffers(
        base_cost,
        version.contingency_pct,
        version.management_reserve_pct,
    )
    return CostBreakdown(
        base_cost=base,
        risk_buffer=buffer,
        total_cost=total,
        contingency_pct=version.contingency_pct,
        management_reserve_pct=version.management_reserve_pct,
    )


@router.get("/{project_id}/calculations/revenue", response_model=RevenueBreakdown)
async def get_revenue(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    version, project = await _load_version_data(db, project_id)
    default_rates = await _get_default_rates(db)
    engine = CalculationEngine()
    effort_allocations = {}
    for f in version.features:
        effort_allocations[f.id] = list(f.effort_allocations) if f.effort_allocations else []
    revenue = engine.revenue(
        version,
        project,
        list(version.team_members),
        list(version.features),
        effort_allocations,
        default_rates,
    )
    return RevenueBreakdown(
        revenue=revenue,
        revenue_model=project.revenue_model.value if hasattr(project.revenue_model, "value") else str(project.revenue_model),
    )


@router.get("/{project_id}/calculations/profitability", response_model=ProfitabilityBreakdown)
async def get_profitability(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    version, project = await _load_version_data(db, project_id)
    default_rates = await _get_default_rates(db)
    engine = CalculationEngine()
    effort_allocations = {}
    for f in version.features:
        effort_allocations[f.id] = list(f.effort_allocations) if f.effort_allocations else []
    base_cost = engine.base_cost(
        list(version.team_members),
        list(version.features),
        effort_allocations,
        default_rates,
    )
    _, _, total_cost = engine.cost_with_buffers(
        base_cost,
        version.contingency_pct,
        version.management_reserve_pct,
    )
    revenue = engine.revenue(
        version,
        project,
        list(version.team_members),
        list(version.features),
        effort_allocations,
        default_rates,
    )
    gross_margin = engine.gross_margin(revenue, total_cost)
    margin_below = engine.margin_below_threshold(gross_margin) if gross_margin is not None else False
    return ProfitabilityBreakdown(
        revenue=revenue,
        cost=total_cost,
        gross_margin_pct=gross_margin,
        net_margin_pct=gross_margin,
        margin_below_threshold=margin_below,
    )


@router.get("/{project_id}/calculations/sprint", response_model=SprintAllocation)
async def get_sprint_allocation(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """
    Sprint planning steps:
    1. Total effort = features (with task contingency) × version contingency
    2. Sprint weeks = from project creation (sprint_duration_weeks)
    3. Total sprints = ceil(total_effort / sprint_capacity)
    4. Frontend generates the table with sprints_required rows
    """
    version, _ = await _load_version_data(db, project_id)
    engine = CalculationEngine()
    effort_allocations = {f.id: list(f.effort_allocations or []) for f in version.features}
    effort_with_task_contingency = engine.total_effort_hours_with_task_contingency(
        list(version.features),
        effort_allocations,
    )
    contingency_factor = Decimal(1) + (version.contingency_pct or 0) / Decimal(100)
    total_effort = engine._round(effort_with_task_contingency * contingency_factor)
    capacity = engine.sprint_capacity(
        list(version.team_members),
        version.sprint_config,
    )
    sprints = engine.sprints_required(total_effort, capacity)
    effort_per_sprint = total_effort / sprints if sprints > 0 else Decimal(0)
    return SprintAllocation(
        sprint_capacity_hours=capacity,
        total_effort_hours=total_effort,
        sprints_required=sprints,
        effort_per_sprint=engine._round(effort_per_sprint),
    )


@router.get("/{project_id}/calculations/reverse-margin", response_model=ReverseMarginResult)
async def reverse_margin(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    target_margin_pct: Decimal = Query(..., ge=0, le=100),
):
    version, project = await _load_version_data(db, project_id)
    default_rates = await _get_default_rates(db)
    engine = CalculationEngine()
    effort_allocations = {}
    for f in version.features:
        effort_allocations[f.id] = list(f.effort_allocations) if f.effort_allocations else []
    base_cost = engine.base_cost(
        list(version.team_members),
        list(version.features),
        effort_allocations,
        default_rates,
    )
    _, _, total_cost = engine.cost_with_buffers(
        base_cost,
        version.contingency_pct,
        version.management_reserve_pct,
    )
    effort_allocations = {f.id: list(f.effort_allocations or []) for f in version.features}
    effort_with_task = engine.total_effort_hours_with_task_contingency(
        list(version.features),
        effort_allocations,
    )
    contingency_factor = Decimal(1) + (version.contingency_pct or 0) / Decimal(100)
    total_effort = engine._round(effort_with_task * contingency_factor)
    required_revenue = engine.reverse_margin_revenue(total_cost, target_margin_pct)
    required_billing = engine.reverse_margin_billing_rate(
        total_cost,
        total_effort,
        target_margin_pct,
    ) if total_effort > 0 else None
    return ReverseMarginResult(
        target_margin_pct=target_margin_pct,
        required_revenue=required_revenue,
        required_billing_rate=required_billing,
    )
