"""Sprint plan API routes."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, get_user_roles
from app.auth.rbac import can_edit_team, can_edit_features
from app.database import get_db
from app.models.project import ProjectVersion
from app.models.sprint_plan import SprintPlanRow
from app.models.team import TeamMember
from app.schemas.sprint_plan import SprintPlanRowSchema, SprintPlanSchema, SprintPlanUpdate

router = APIRouter(prefix="/projects", tags=["sprint-plan"])


async def _get_version(db: AsyncSession, project_id: int, require_unlocked: bool = True) -> ProjectVersion:
    result = await db.execute(
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Project not found")
    if require_unlocked and version.is_locked:
        raise HTTPException(status_code=403, detail="Project is locked")
    return version


def _row_to_schema(r: SprintPlanRow) -> SprintPlanRowSchema:
    if r.row_type == "sprint-week" and r.sprint_num is not None and r.week_num is not None:
        row_id = f"s{r.sprint_num}w{r.week_num}"
    else:
        row_id = r.phase or f"row_{r.id}"
    return SprintPlanRowSchema(
        id=row_id,
        type=r.row_type,
        sprint_num=r.sprint_num,
        week_num=r.week_num,
        phase=r.phase,
        values=r.allocations or {},
    )


@router.get("/{project_id}/sprint-plan", response_model=SprintPlanSchema)
async def get_sprint_plan(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[object, Depends(get_current_user)],
):
    version = await _get_version(db, project_id, require_unlocked=False)
    result = await db.execute(
        select(SprintPlanRow).where(SprintPlanRow.version_id == version.id).order_by(SprintPlanRow.sort_order)
    )
    rows = result.scalars().all()
    team_result = await db.execute(
        select(TeamMember).where(TeamMember.version_id == version.id)
    )
    team = team_result.scalars().all()
    roles = list(dict.fromkeys(m.role for m in team))
    if not roles:
        roles = ["Technical Architect", "Project Manager", "QA"]
    if rows:
        schema_rows = [_row_to_schema(r) for r in rows]
        all_roles = set(roles)
        for r in schema_rows:
            all_roles.update(r.values.keys())
        roles_sorted = sorted(all_roles)
        for row in schema_rows:
            for role in roles_sorted:
                if role not in row.values:
                    row.values[role] = 0.0
        return SprintPlanSchema(rows=schema_rows, roles=roles_sorted)
    return SprintPlanSchema(rows=[], roles=sorted(roles))


@router.put("/{project_id}/sprint-plan", response_model=SprintPlanSchema)
async def save_sprint_plan(
    project_id: int,
    data: SprintPlanUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[object, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_team(roles) and not can_edit_features(roles):
        raise HTTPException(status_code=403, detail="Cannot edit sprint plan")
    version = await _get_version(db, project_id)
    await db.execute(delete(SprintPlanRow).where(SprintPlanRow.version_id == version.id))
    for i, row in enumerate(data.rows):
        db_row = SprintPlanRow(
            version_id=version.id,
            row_type=row.type,
            sprint_num=row.sprint_num,
            week_num=row.week_num,
            phase=row.phase,
            allocations=row.values,
            sort_order=i,
        )
        db.add(db_row)
    await db.flush()
    return SprintPlanSchema(rows=data.rows, roles=data.roles)
