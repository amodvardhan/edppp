"""BU default rates API - organization-level rates per role (/day)."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, get_user_roles
from app.auth.rbac import can_edit_team
from app.database import get_db
from app.models.bu_rate import RoleDefaultRate
from app.models.user import User
from app.schemas.bu_rate import (
    RoleDefaultRateCreate,
    RoleDefaultRateResponse,
    RoleDefaultRateUpdate,
)

router = APIRouter(prefix="/settings", tags=["bu-rates"])


@router.get("/bu-rates", response_model=list[RoleDefaultRateResponse])
async def list_bu_rates(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(RoleDefaultRate).order_by(RoleDefaultRate.role))
    return [RoleDefaultRateResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/bu-rates", response_model=RoleDefaultRateResponse)
async def create_bu_rate(
    data: RoleDefaultRateCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot manage BU rates")
    existing = await db.execute(select(RoleDefaultRate).where(RoleDefaultRate.role == data.role))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role already has default rate")
    rate = RoleDefaultRate(
        role=data.role,
        cost_rate_per_day=data.cost_rate_per_day,
        billing_rate_per_day=data.billing_rate_per_day,
    )
    db.add(rate)
    await db.flush()
    await db.refresh(rate)
    return RoleDefaultRateResponse.model_validate(rate)


@router.patch("/bu-rates/{rate_id}", response_model=RoleDefaultRateResponse)
async def update_bu_rate(
    rate_id: int,
    data: RoleDefaultRateUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot manage BU rates")
    rate = await db.get(RoleDefaultRate, rate_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(rate, k, v)
    await db.refresh(rate)
    return RoleDefaultRateResponse.model_validate(rate)


@router.delete("/bu-rates/{rate_id}", status_code=204)
async def delete_bu_rate(
    rate_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot manage BU rates")
    rate = await db.get(RoleDefaultRate, rate_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    await db.delete(rate)
    return None
