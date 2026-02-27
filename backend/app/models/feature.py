"""Feature and effort models."""
from decimal import Decimal
from typing import Any

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Feature(Base):
    """Feature entity with effort and task breakdown."""

    __tablename__ = "features"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("project_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    effort_hours: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    effort_story_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_suggested_effort: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    ai_suggested_approved: Mapped[bool] = mapped_column(nullable=False, default=False)
    # Task breakdown: [{"name": "...", "effort_hours": 4, "role": "Developer"}, ...]
    tasks: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)

    version: Mapped["ProjectVersion"] = relationship("ProjectVersion", back_populates="features")
    effort_allocations: Mapped[list["EffortAllocation"]] = relationship(
        "EffortAllocation",
        back_populates="feature",
        cascade="all, delete-orphan",
    )
