"""Team member API routes."""
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, get_user_roles
from app.config import get_settings
from app.auth.rbac import can_edit_team
from app.database import get_db
from app.models.audit import AuditLog
from app.models.bu_rate import RoleDefaultRate
from app.models.project import Project, ProjectVersion
from app.models.team import TeamMember
from app.models.user import User
from app.schemas.feature import FeatureCreate
from app.schemas.team import (
    AITeamSuggestionRequest,
    AITeamSuggestionResponse,
    TeamMemberCreate,
    TeamMemberResponse,
    TeamMemberUpdate,
)
from app.services.ai_service import suggest_team_allocation

router = APIRouter(prefix="/projects", tags=["team"])


async def _get_version(db: AsyncSession, project_id: int, require_unlocked: bool = True) -> ProjectVersion:
    result = await db.execute(
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .limit(1)
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Project not found")
    if require_unlocked and v.is_locked:
        raise HTTPException(status_code=400, detail="Version is locked")
    return v


@router.post("/{project_id}/team/ai-suggest", response_model=AITeamSuggestionResponse)
async def ai_suggest_team(
    project_id: int,
    data: AITeamSuggestionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    """Suggest realistic team composition based on features. Human-in-loop: user must approve before adding."""
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot edit team")
    await _get_version(db, project_id, require_unlocked=True)
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    features = [
        FeatureCreate(
            name=item.get("name", "Unnamed"),
            effort_hours=Decimal(str(item.get("effort_hours", 0))),
            priority=int(item.get("priority", 1)),
        )
        for item in data.features
    ]
    total_effort = sum(float(f.effort_hours) for f in features)
    members, raw = await suggest_team_allocation(
        features, total_effort, project.sprint_duration_weeks or get_settings().default_sprint_duration_weeks
    )
    return AITeamSuggestionResponse(members=members, raw_suggestion=raw)


@router.get("/{project_id}/team", response_model=list[TeamMemberResponse])
async def list_team(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    version = await _get_version(db, project_id, require_unlocked=False)
    result = await db.execute(select(TeamMember).where(TeamMember.version_id == version.id))
    members = result.scalars().all()
    return [TeamMemberResponse.model_validate(m) for m in members]


@router.post("/{project_id}/team", response_model=TeamMemberResponse)
async def add_team_member(
    project_id: int,
    data: TeamMemberCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot edit team")
    version = await _get_version(db, project_id, require_unlocked=True)
    cost_rate = data.cost_rate_per_day
    billing_rate = data.billing_rate_per_day
    if cost_rate is None or billing_rate is None:
        default_result = await db.execute(
            select(RoleDefaultRate).where(RoleDefaultRate.role == data.role)
        )
        default_row = default_result.scalar_one_or_none()
        if default_row:
            if cost_rate is None:
                cost_rate = default_row.cost_rate_per_day
            if billing_rate is None:
                billing_rate = default_row.billing_rate_per_day
    member = TeamMember(
        version_id=version.id,
        role=data.role,
        member_name=data.member_name,
        cost_rate_per_day=cost_rate,
        billing_rate_per_day=billing_rate,
        utilization_pct=data.utilization_pct,
        working_days_per_month=data.working_days_per_month,
        hours_per_day=data.hours_per_day,
    )
    db.add(member)
    await db.flush()
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="add_team_member",
        entity_type="team_member",
        entity_id=member.id,
        new_value=data.role,
    ))
    await db.refresh(member)
    return TeamMemberResponse.model_validate(member)


@router.patch("/{project_id}/team/{member_id}", response_model=TeamMemberResponse)
async def update_team_member(
    project_id: int,
    member_id: int,
    data: TeamMemberUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot edit team")
    version = await _get_version(db, project_id, require_unlocked=True)
    member = await db.get(TeamMember, member_id)
    if not member or member.version_id != version.id:
        raise HTTPException(status_code=404, detail="Member not found")
    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(member, k, v)
    await db.flush()
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="update_team_member",
        entity_type="team_member",
        entity_id=member.id,
    ))
    await db.refresh(member)
    return TeamMemberResponse.model_validate(member)


@router.delete("/{project_id}/team/{member_id}")
async def delete_team_member(
    project_id: int,
    member_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot edit team")
    version = await _get_version(db, project_id, require_unlocked=True)
    member = await db.get(TeamMember, member_id)
    if not member or member.version_id != version.id:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.delete(member)
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="delete_team_member",
        entity_type="team_member",
        entity_id=member_id,
    ))
    return {"ok": True}
