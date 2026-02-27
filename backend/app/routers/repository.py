"""Repository and dashboard API routes."""
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.database import get_db
from app.engine.calculator import CalculationEngine
from app.models.bu_rate import RoleDefaultRate
from app.models.feature import Feature
from app.models.project import Project, ProjectVersion, ProjectStatus, RevenueModel
from app.models.team import TeamMember
from app.models.user import User

router = APIRouter(prefix="/repository", tags=["repository"])


async def _get_default_rates(db: AsyncSession) -> dict[str, tuple[Decimal, Decimal]]:
    result = await db.execute(select(RoleDefaultRate))
    return {r.role.strip(): (r.cost_rate_per_day, r.billing_rate_per_day) for r in result.scalars().all()}


@router.get("/projects")
async def list_projects(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    search: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    q = select(Project).order_by(Project.created_at.desc())
    if search:
        q = q.where(Project.name.ilike(f"%{search}%") | Project.client_name.ilike(f"%{search}%"))
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    projects = result.scalars().all()
    items = []
    for p in projects:
        v_result = await db.execute(
            select(ProjectVersion)
            .where(ProjectVersion.project_id == p.id)
            .order_by(ProjectVersion.version_number.desc())
            .limit(1)
            .options(
                selectinload(ProjectVersion.team_members),
                selectinload(ProjectVersion.features).selectinload(Feature.effort_allocations),
                selectinload(ProjectVersion.sprint_config),
                selectinload(ProjectVersion.project),
            )
        )
        v = v_result.scalar_one_or_none()
        revenue = cost = margin = None
        v_status = "draft"
        if v:
            default_rates = await _get_default_rates(db)
            engine = CalculationEngine()
            effort_alloc = {f.id: list(f.effort_allocations or []) for f in v.features}
            base = engine.base_cost(list(v.team_members), list(v.features), effort_alloc, default_rates)
            _, _, cost = engine.cost_with_buffers(base, v.contingency_pct, v.management_reserve_pct)
            revenue = engine.revenue(v, p, list(v.team_members), list(v.features), effort_alloc, default_rates)
            margin = engine.gross_margin(revenue, cost)
            v_status = (v.status.value if hasattr(v.status, "value") else v.status) or "draft"
            if v_status == "locked":
                v_status = "won"  # legacy
        if status and status.lower() != v_status.lower():
            continue
        items.append({
            "id": p.id,
            "name": p.name,
            "client_name": p.client_name,
            "currency": p.currency,
            "revenue_model": p.revenue_model.value if hasattr(p.revenue_model, "value") else str(p.revenue_model),
            "created_by": p.created_by,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "status": v_status if v else "draft",
            "revenue": float(revenue) if revenue is not None else None,
            "cost": float(cost) if cost is not None else None,
            "margin_pct": float(margin) if margin is not None else None,
        })
    return {"items": items, "total": len(items)}


@router.get("/dashboard")
async def get_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(Project))
    projects = result.scalars().all()
    total_revenue = Decimal(0)
    total_cost = Decimal(0)
    margins = []
    project_count = 0
    below_threshold = 0
    engine = CalculationEngine()
    role_usage = {}
    default_rates = await _get_default_rates(db)

    for p in projects:
        v_result = await db.execute(
            select(ProjectVersion)
            .where(ProjectVersion.project_id == p.id)
            .order_by(ProjectVersion.version_number.desc())
            .limit(1)
            .options(
                selectinload(ProjectVersion.team_members),
                selectinload(ProjectVersion.features).selectinload(Feature.effort_allocations),
                selectinload(ProjectVersion.project),
            )
        )
        v = v_result.scalar_one_or_none()
        if not v:
            continue
        project_count += 1
        effort_alloc = {f.id: list(f.effort_allocations or []) for f in v.features}
        base = engine.base_cost(list(v.team_members), list(v.features), effort_alloc, default_rates)
        _, _, cost = engine.cost_with_buffers(base, v.contingency_pct, v.management_reserve_pct)
        revenue = engine.revenue(v, p, list(v.team_members), list(v.features), effort_alloc, default_rates)
        total_revenue += revenue
        total_cost += cost
        margin = engine.gross_margin(revenue, cost)
        if margin is not None:
            margins.append(float(margin))
            if engine.margin_below_threshold(margin):
                below_threshold += 1
        for m in v.team_members:
            role_usage[m.role] = role_usage.get(m.role, 0) + 1

    avg_margin = sum(margins) / len(margins) if margins else 0
    return {
        "total_simulated_revenue": float(total_revenue),
        "total_simulated_cost": float(total_cost),
        "avg_margin_pct": round(avg_margin, 2),
        "project_count": project_count,
        "projects_below_threshold": below_threshold,
        "top_roles": sorted(role_usage.items(), key=lambda x: -x[1])[:10],
    }
