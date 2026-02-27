"""Project version API routes."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user, get_user_roles
from app.auth.rbac import can_edit_features, can_edit_team, can_lock_project, can_unlock_project
from app.database import get_db
from app.models.audit import AuditLog
from app.models.project import Project, ProjectVersion, ProjectStatus
from app.models.user import User
from app.schemas.project import (
    ProjectVersionResponse,
    ProjectVersionUpdate,
    STATUS_TRANSITIONS,
)

router = APIRouter(prefix="/projects", tags=["versions"])


async def _get_version(db: AsyncSession, project_id: int, version_id: int | None = None) -> ProjectVersion:
    result = await db.execute(
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Project or version not found")
    if version_id and version.id != version_id:
        v2 = await db.get(ProjectVersion, version_id)
        if not v2 or v2.project_id != project_id:
            raise HTTPException(status_code=404, detail="Version not found")
        version = v2
    return version


@router.get("/{project_id}/versions/current", response_model=ProjectVersionResponse)
async def get_current_version(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    version = await _get_version(db, project_id)
    return ProjectVersionResponse(
        id=version.id,
        project_id=version.project_id,
        version_number=version.version_number,
        status=version.status.value if hasattr(version.status, "value") else version.status,
        is_locked=version.is_locked,
        contingency_pct=version.contingency_pct,
        management_reserve_pct=version.management_reserve_pct,
        estimation_authority=version.estimation_authority,
        created_at=version.created_at.isoformat() if version.created_at else "",
    )


@router.patch("/{project_id}/versions/{version_id}")
async def update_version(
    project_id: int,
    version_id: int,
    data: ProjectVersionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    version = await _get_version(db, project_id, version_id)
    if version.is_locked:
        raise HTTPException(status_code=400, detail="Version is locked")
    if not can_edit_team(roles):
        raise HTTPException(status_code=403, detail="Cannot edit version")
    if data.contingency_pct is not None:
        version.contingency_pct = data.contingency_pct
    if data.management_reserve_pct is not None:
        version.management_reserve_pct = data.management_reserve_pct
    if data.notes is not None:
        version.notes = data.notes
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="update_version",
        entity_type="project_version",
        entity_id=version.id,
    ))
    await db.flush()
    return {"ok": True}


@router.patch("/{project_id}/versions/{version_id}/status")
async def transition_status(
    project_id: int,
    version_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
    target_status: str = Query(..., description="Target status: review, submitted, won"),
):
    """Transition version status. Draft→Review, Review→Submitted, Submitted→Won. Won triggers lock."""
    version = await _get_version(db, project_id, version_id)
    if version.is_locked:
        raise HTTPException(status_code=400, detail="Version is locked")
    current = (version.status.value if hasattr(version.status, "value") else version.status) or "draft"
    allowed = STATUS_TRANSITIONS.get(current.lower(), [])
    target = target_status.lower()
    if target not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {current} to {target}. Allowed: {allowed}",
        )
    # Review/Submitted: DM, BA, Admin. Won: Finance/Admin only
    if target == "won":
        if not can_lock_project(roles):
            raise HTTPException(status_code=403, detail="Only Finance/Admin can mark as Won")
    else:
        if not can_edit_features(roles):
            raise HTTPException(status_code=403, detail="Cannot transition status")
    version.status = ProjectStatus(target)
    if target == "won":
        version.is_locked = True
        version.locked_by = user.id
        version.locked_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="status_transition",
        entity_type="project_version",
        entity_id=version.id,
        new_value=target,
    ))
    await db.flush()
    return {"ok": True, "status": target}


@router.post("/{project_id}/versions/{version_id}/lock")
async def lock_version(
    project_id: int,
    version_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    """Mark as Won and lock. Only valid when status is Submitted."""
    if not can_lock_project(roles):
        raise HTTPException(status_code=403, detail="Only Finance can lock")
    version = await _get_version(db, project_id, version_id)
    if version.is_locked:
        raise HTTPException(status_code=400, detail="Already locked")
    current = (version.status.value if hasattr(version.status, "value") else version.status) or "draft"
    if current.lower() != "submitted":
        raise HTTPException(
            status_code=400,
            detail="Can only lock when status is Submitted. Use status transition to move to Submitted first.",
        )
    version.status = ProjectStatus.WON
    version.is_locked = True
    version.locked_by = user.id
    version.locked_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="lock",
        entity_type="project_version",
        entity_id=version.id,
    ))
    await db.flush()
    return {"ok": True}


@router.post("/{project_id}/versions/{version_id}/unlock")
async def unlock_version(
    project_id: int,
    version_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
    reason: str = Query(..., min_length=1),
):
    if not can_unlock_project(roles):
        raise HTTPException(status_code=403, detail="Only Admin can unlock")
    version = await _get_version(db, project_id, version_id)
    if not version.is_locked:
        raise HTTPException(status_code=400, detail="Not locked")
    version.is_locked = False
    version.locked_by = None
    version.locked_at = None
    version.status = ProjectStatus.SUBMITTED
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="unlock",
        entity_type="project_version",
        entity_id=version.id,
        reason=reason,
    ))
    await db.flush()
    return {"ok": True}
