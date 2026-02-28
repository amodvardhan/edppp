"""Estimation history and justification models."""
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EffortAllocation(Base):
    """Role distribution for feature effort."""

    __tablename__ = "effort_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    feature_id: Mapped[int] = mapped_column(
        ForeignKey("features.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    allocation_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    effort_hours: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    fte: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    feature: Mapped["Feature"] = relationship("Feature", back_populates="effort_allocations")


class EstimationHistory(Base):
    """Track estimation changes per version."""

    __tablename__ = "estimation_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("project_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    feature_id: Mapped[int] = mapped_column(
        ForeignKey("features.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_effort: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=True)
    new_effort: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    changed_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    authority: Mapped[str] = mapped_column(String(50), nullable=False)


class JustificationLog(Base):
    """Justification when TA overrides effort > threshold."""

    __tablename__ = "justification_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("project_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    feature_id: Mapped[int] = mapped_column(
        ForeignKey("features.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_effort: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    new_effort: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
