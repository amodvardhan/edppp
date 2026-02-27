"""Sprint plan allocation model."""
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SprintPlanRow(Base):
    """Sprint plan row per version - stores role allocations (1=100%, 0.5=50%, etc.)."""

    __tablename__ = "sprint_plan_rows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("project_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    row_type: Mapped[str] = mapped_column(String(20), nullable=False)  # sprint-week | phase
    sprint_num: Mapped[int | None] = mapped_column(Integer, nullable=True)
    week_num: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phase: Mapped[str | None] = mapped_column(String(20), nullable=True)  # pre_uat | uat | go_live
    allocations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # {role: 0-1}
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    version: Mapped["ProjectVersion"] = relationship(
        "ProjectVersion",
        back_populates="sprint_plan_rows",
    )
