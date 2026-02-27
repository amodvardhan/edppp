"""BU (Business Unit) level default rates per role - /day basis."""
from decimal import Decimal

from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RoleDefaultRate(Base):
    """Default cost and billing rates per role at BU/organization level. Rates are per day."""

    __tablename__ = "role_default_rates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    cost_rate_per_day: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    billing_rate_per_day: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
