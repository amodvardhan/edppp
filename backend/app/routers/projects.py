"""Project API routes."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user, get_user_roles
from app.auth.rbac import can_create_project, can_delete_project
from app.database import get_db
from app.models.audit import AuditLog
from app.models.project import Project, ProjectVersion, ProjectStatus, RevenueModel, SprintConfig
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=dict)
async def create_project(
    data: ProjectCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_create_project(roles):
        raise HTTPException(status_code=403, detail="Cannot create project")
    result = await db.execute(select(Project).where(Project.name == data.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Project name already exists")
    project = Project(
        name=data.name,
        client_name=data.client_name,
        revenue_model=RevenueModel(data.revenue_model),
        currency=data.currency.upper(),
        sprint_duration_weeks=data.sprint_duration_weeks,
        project_duration_months=data.project_duration_months,
        project_duration_sprints=data.project_duration_sprints,
        fixed_revenue=data.fixed_revenue,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()
    version = ProjectVersion(
        project_id=project.id,
        version_number=1,
        status=ProjectStatus.DRAFT,
        created_by=user.id,
    )
    db.add(version)
    await db.flush()
    sprint_config = SprintConfig(
        version_id=version.id,
        duration_weeks=data.sprint_duration_weeks,
        working_days_per_month=20,
        hours_per_day=8,
    )
    db.add(sprint_config)
    await db.flush()
    db.add(AuditLog(
        project_id=project.id,
        version_id=version.id,
        user_id=user.id,
        action="create",
        entity_type="project",
        entity_id=project.id,
        new_value=project.name,
    ))
    await db.refresh(project)
    return {
        "project_id": project.id,
        "version_id": version.id,
        "version_number": 1,
    }


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(
        id=project.id,
        name=project.name,
        client_name=project.client_name,
        revenue_model=project.revenue_model.value if hasattr(project.revenue_model, "value") else str(project.revenue_model),
        currency=project.currency,
        sprint_duration_weeks=project.sprint_duration_weeks,
        project_duration_months=project.project_duration_months,
        project_duration_sprints=project.project_duration_sprints,
        fixed_revenue=project.fixed_revenue,
        created_by=project.created_by,
        created_at=project.created_at.isoformat() if project.created_at else "",
    )


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_delete_project(roles):
        raise HTTPException(status_code=403, detail="Cannot delete project")
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.versions))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    version_result = await db.execute(
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .limit(1)
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Project not found")
    if version.status != ProjectStatus.DRAFT.value or version.is_locked:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete project: only draft projects can be deleted",
        )
    await db.execute(delete(AuditLog).where(AuditLog.project_id == project_id))
    await db.delete(project)
