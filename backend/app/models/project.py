"""Project and version models."""
from decimal import Decimal
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RevenueModel(str, PyEnum):
    FIXED = "fixed"
    T_M = "t_m"
    MILESTONE = "milestone"


class ProjectStatus(str, PyEnum):
    DRAFT = "draft"
    REVIEW = "review"
    SUBMITTED = "submitted"
    WON = "won"
    # Kept for backward compatibility when reading existing DB rows
    LOCKED = "locked"


class Project(Base):
    """Project entity."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    client_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    revenue_model: Mapped[str] = mapped_column(
        Enum(RevenueModel),
        nullable=False,
        default=RevenueModel.FIXED,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    sprint_duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    project_duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_duration_sprints: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fixed_revenue: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    versions: Mapped[list["ProjectVersion"]] = relationship(
        "ProjectVersion",
        back_populates="project",
        order_by="ProjectVersion.version_number.desc()",
        cascade="all, delete-orphan",
    )


class ProjectVersion(Base):
    """Immutable version snapshot of project plan."""

    __tablename__ = "project_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(ProjectStatus),
        nullable=False,
        default=ProjectStatus.DRAFT,
    )
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    locked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    estimation_authority: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contingency_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    management_reserve_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="versions")
    team_members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember",
        back_populates="version",
        cascade="all, delete-orphan",
    )
    features: Mapped[list["Feature"]] = relationship(
        "Feature",
        back_populates="version",
        cascade="all, delete-orphan",
    )
    sprint_config: Mapped["SprintConfig | None"] = relationship(
        "SprintConfig",
        back_populates="version",
        uselist=False,
        cascade="all, delete-orphan",
    )
    sprint_plan_rows: Mapped[list["SprintPlanRow"]] = relationship(
        "SprintPlanRow",
        back_populates="version",
        cascade="all, delete-orphan",
        order_by="SprintPlanRow.sort_order",
    )


class SprintConfig(Base):
    """Sprint configuration per version."""

    __tablename__ = "sprint_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("project_versions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    working_days_per_month: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    hours_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=8)

    version: Mapped["ProjectVersion"] = relationship("ProjectVersion", back_populates="sprint_config")
