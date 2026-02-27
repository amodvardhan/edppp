"""Feature API routes."""
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user, get_user_roles
from app.auth.rbac import can_edit_features, can_modify_effort
from app.config import get_settings
from app.database import get_db
from app.models.bu_rate import RoleDefaultRate
from app.engine.calculator import CalculationEngine
from app.models.audit import AuditLog
from app.models.estimation import EffortAllocation, EstimationHistory, JustificationLog
from app.models.feature import Feature
from app.models.project import ProjectVersion
from app.models.user import User
from app.schemas.feature import (
    AIEstimateRequest,
    AIEstimateResponse,
    EffortAllocationCreate,
    FeatureCreate,
    FeatureResponse,
    FeatureTaskResponse,
    FeatureUpdate,
)
from app.services.ai_service import estimate_features_from_requirements
from app.services.document_extractor import extract_text_from_file

router = APIRouter(prefix="/projects", tags=["features"])


def _tasks_to_response(tasks: list | None) -> list:
    if not tasks:
        return []
    return [
        FeatureTaskResponse(name=t.get("name", ""), effort_hours=Decimal(str(t.get("effort_hours", 0))), role=t.get("role", "Developer"))
        for t in tasks
    ]


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


@router.get("/{project_id}/features", response_model=list[FeatureResponse])
async def list_features(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    version = await _get_version(db, project_id, require_unlocked=False)
    result = await db.execute(
        select(Feature)
        .where(Feature.version_id == version.id)
        .options(selectinload(Feature.effort_allocations))
    )
    features = result.scalars().all()
    return [
        FeatureResponse(
            id=f.id,
            version_id=f.version_id,
            name=f.name,
            description=f.description,
            priority=f.priority,
            effort_hours=f.effort_hours,
            effort_story_points=f.effort_story_points,
            ai_suggested_effort=f.ai_suggested_effort,
            ai_suggested_approved=f.ai_suggested_approved,
            effort_allocations=[{"id": a.id, "role": a.role, "allocation_pct": a.allocation_pct, "effort_hours": a.effort_hours} for a in (f.effort_allocations or [])],
            tasks=_tasks_to_response(f.tasks),
        )
        for f in features
    ]


@router.post("/{project_id}/features", response_model=FeatureResponse)
async def add_feature(
    project_id: int,
    data: FeatureCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_features(roles):
        raise HTTPException(status_code=403, detail="Cannot edit features")
    version = await _get_version(db, project_id)
    tasks_data = [{"name": t.name, "effort_hours": float(t.effort_hours), "role": t.role} for t in (data.tasks or [])]
    feature = Feature(
        version_id=version.id,
        name=data.name,
        description=data.description,
        priority=data.priority,
        effort_hours=data.effort_hours,
        effort_story_points=data.effort_story_points,
        tasks=tasks_data if tasks_data else None,
    )
    db.add(feature)
    await db.flush()
    for a in data.effort_allocations:
        db.add(EffortAllocation(
            feature_id=feature.id,
            role=a.role,
            allocation_pct=a.allocation_pct,
            effort_hours=a.effort_hours,
        ))
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="add_feature",
        entity_type="feature",
        entity_id=feature.id,
        new_value=data.name,
    ))
    await db.refresh(feature)
    result = await db.execute(
        select(Feature)
        .where(Feature.id == feature.id)
        .options(selectinload(Feature.effort_allocations))
    )
    f = result.scalar_one()
    return FeatureResponse(
        id=f.id,
        version_id=f.version_id,
        name=f.name,
        description=f.description,
        priority=f.priority,
        effort_hours=f.effort_hours,
        effort_story_points=f.effort_story_points,
        ai_suggested_effort=f.ai_suggested_effort,
        ai_suggested_approved=f.ai_suggested_approved,
        effort_allocations=[{"id": a.id, "role": a.role, "allocation_pct": a.allocation_pct, "effort_hours": a.effort_hours} for a in (f.effort_allocations or [])],
        tasks=_tasks_to_response(f.tasks),
    )


async def _get_bu_role_names(db: AsyncSession) -> list[str]:
    result = await db.execute(select(RoleDefaultRate.role).order_by(RoleDefaultRate.role))
    return [str(r[0]).strip() for r in result.all() if r[0]]


@router.post("/{project_id}/features/ai-estimate", response_model=AIEstimateResponse)
async def ai_estimate(
    project_id: int,
    data: AIEstimateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_features(roles):
        raise HTTPException(status_code=403, detail="Cannot edit features")
    await _get_version(db, project_id)
    bu_role_names = await _get_bu_role_names(db)
    features, raw = await estimate_features_from_requirements(data.requirement_text, bu_role_names)
    return AIEstimateResponse(features=features, raw_suggestion=raw)


@router.post("/{project_id}/features/ai-estimate-upload", response_model=AIEstimateResponse)
async def ai_estimate_from_upload(
    project_id: int,
    file: Annotated[UploadFile, File()],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    """Upload requirement doc (PDF, DOCX, TXT) and get AI-suggested features with effort."""
    if not can_edit_features(roles):
        raise HTTPException(status_code=403, detail="Cannot edit features")
    await _get_version(db, project_id)
    content = await file.read()
    try:
        requirement_text = extract_text_from_file(content, file.filename or "document")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not requirement_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from document")
    bu_role_names = await _get_bu_role_names(db)
    features, raw = await estimate_features_from_requirements(requirement_text, bu_role_names)
    return AIEstimateResponse(features=features, raw_suggestion=raw)


@router.patch("/{project_id}/features/{feature_id}", response_model=FeatureResponse)
async def update_feature(
    project_id: int,
    feature_id: int,
    data: FeatureUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
    justification: str | None = None,
):
    version = await _get_version(db, project_id)
    result = await db.execute(
        select(Feature)
        .where(Feature.id == feature_id, Feature.version_id == version.id)
        .options(selectinload(Feature.effort_allocations))
    )
    feature = result.scalar_one_or_none()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")

    if data.effort_hours is not None:
        if not can_modify_effort(roles) and not can_edit_features(roles):
            raise HTTPException(status_code=403, detail="Cannot modify effort")
        engine = CalculationEngine()
        if engine.effort_override_exceeds_threshold(feature.effort_hours, data.effort_hours):
            if "technical_architect" not in [r.lower() for r in roles] and "admin" not in [r.lower() for r in roles]:
                raise HTTPException(
                    status_code=403,
                    detail="Effort change >15% requires Technical Architect approval",
                )
            if not justification or len(justification.strip()) < 10:
                raise HTTPException(
                    status_code=400,
                    detail="Justification required when effort change exceeds 15%",
                )
            db.add(JustificationLog(
                version_id=version.id,
                feature_id=feature.id,
                previous_effort=feature.effort_hours,
                new_effort=data.effort_hours,
                justification=justification,
                created_by=user.id,
            ))
        db.add(EstimationHistory(
            version_id=version.id,
            feature_id=feature.id,
            previous_effort=feature.effort_hours,
            new_effort=data.effort_hours,
            changed_by=user.id,
            authority="technical_architect" if can_modify_effort(roles) else "business_analyst",
        ))
        feature.effort_hours = data.effort_hours
    elif not can_edit_features(roles):
        raise HTTPException(status_code=403, detail="Cannot edit features")

    if data.name is not None:
        feature.name = data.name
    if data.description is not None:
        feature.description = data.description
    if data.priority is not None:
        feature.priority = data.priority
    if data.effort_story_points is not None:
        feature.effort_story_points = data.effort_story_points
    if data.effort_allocations is not None:
        for a in feature.effort_allocations or []:
            await db.delete(a)
        for a in data.effort_allocations:
            db.add(EffortAllocation(
                feature_id=feature.id,
                role=a.role,
                allocation_pct=a.allocation_pct,
                effort_hours=a.effort_hours,
            ))
    if data.tasks is not None:
        feature.tasks = [{"name": t.name, "effort_hours": float(t.effort_hours), "role": t.role} for t in data.tasks]
        # Derive effort_allocations from tasks so cost calculation uses correct roles
        role_hours: dict[str, Decimal] = {}
        for t in data.tasks:
            r = (t.role or "").strip() or "Unassigned"
            role_hours[r] = role_hours.get(r, Decimal(0)) + t.effort_hours
        total_hrs = sum(role_hours.values()) or Decimal(1)
        for a in list(feature.effort_allocations or []):
            await db.delete(a)
        for role, hrs in role_hours.items():
            pct = (hrs / total_hrs * 100).quantize(Decimal("0.01"))
            db.add(
                EffortAllocation(
                    feature_id=feature.id,
                    role=role,
                    allocation_pct=pct,
                    effort_hours=hrs,
                )
            )

    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="update_feature",
        entity_type="feature",
        entity_id=feature.id,
    ))
    await db.refresh(feature)
    result = await db.execute(
        select(Feature)
        .where(Feature.id == feature.id)
        .options(selectinload(Feature.effort_allocations))
    )
    f = result.scalar_one()
    return FeatureResponse(
        id=f.id,
        version_id=f.version_id,
        name=f.name,
        description=f.description,
        priority=f.priority,
        effort_hours=f.effort_hours,
        effort_story_points=f.effort_story_points,
        ai_suggested_effort=f.ai_suggested_effort,
        ai_suggested_approved=f.ai_suggested_approved,
        effort_allocations=[{"id": a.id, "role": a.role, "allocation_pct": a.allocation_pct, "effort_hours": a.effort_hours} for a in (f.effort_allocations or [])],
        tasks=_tasks_to_response(f.tasks),
    )


@router.delete("/{project_id}/features/{feature_id}")
async def delete_feature(
    project_id: int,
    feature_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    roles: Annotated[list[str], Depends(get_user_roles)],
):
    if not can_edit_features(roles):
        raise HTTPException(status_code=403, detail="Cannot edit features")
    version = await _get_version(db, project_id)
    result = await db.execute(select(Feature).where(Feature.id == feature_id, Feature.version_id == version.id))
    feature = result.scalar_one_or_none()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")
    await db.delete(feature)
    db.add(AuditLog(
        project_id=project_id,
        version_id=version.id,
        user_id=user.id,
        action="delete_feature",
        entity_type="feature",
        entity_id=feature_id,
    ))
    return {"ok": True}
