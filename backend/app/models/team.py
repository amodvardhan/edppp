"""Team member model."""
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TeamMember(Base):
    """Team member configuration per version."""

    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("project_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    member_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cost_rate_per_day: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    billing_rate_per_day: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    monthly_cost_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    billing_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    utilization_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    working_days_per_month: Mapped[int] = mapped_column(nullable=False, default=20)
    hours_per_day: Mapped[int] = mapped_column(nullable=False, default=8)

    version: Mapped["ProjectVersion"] = relationship("ProjectVersion", back_populates="team_members")
