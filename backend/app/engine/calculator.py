"""Centralized calculation engine - all formulas deterministic, Decimal only. Rates are per day."""
from decimal import Decimal, ROUND_HALF_UP, ROUND_UP
from typing import Any

from app.config import get_settings
from app.models.feature import Feature
from app.models.project import ProjectVersion, RevenueModel, SprintConfig
from app.models.team import TeamMember


def _task_contingency_multiplier(role: str, settings) -> Decimal:
    """Task-level contingency by seniority from config."""
    if not role or not role.strip():
        return Decimal(str(settings.task_contingency_default))
    r = role.strip().lower()
    if "junior" in r or "jr " in r:
        return Decimal(str(settings.task_contingency_junior))
    if "senior" in r or "sr " in r or "lead" in r:
        return Decimal(str(settings.task_contingency_senior))
    return Decimal(str(settings.task_contingency_default))


def _get_bu_rate_for_role(role: str, default_rates: dict[str, tuple[Decimal, Decimal]]) -> tuple[Decimal, Decimal]:
    """Get BU (cost, billing) rate for role. Case-insensitive lookup."""
    if not role or not role.strip():
        return (Decimal(0), Decimal(0))
    r = role.strip()
    if r in default_rates:
        return default_rates[r]
    lower = r.lower()
    for k, v in default_rates.items():
        if k.lower() == lower:
            return v
    return (Decimal(0), Decimal(0))


def _resolve_cost_rate_per_day(
    member: TeamMember,
    default_rates: dict[str, tuple[Decimal, Decimal]],
) -> Decimal:
    """Cost rate per day: member override or BU default."""
    if member.cost_rate_per_day is not None and member.cost_rate_per_day > 0:
        return member.cost_rate_per_day
    if member.monthly_cost_rate is not None and member.monthly_cost_rate > 0 and member.working_days_per_month:
        return member.monthly_cost_rate / Decimal(member.working_days_per_month)
    cost_rate, _ = _get_bu_rate_for_role(member.role, default_rates)
    return cost_rate


def _resolve_billing_rate_per_day(
    member: TeamMember,
    default_rates: dict[str, tuple[Decimal, Decimal]],
) -> Decimal:
    """Billing rate per day: member override or BU default."""
    if member.billing_rate_per_day is not None and member.billing_rate_per_day > 0:
        return member.billing_rate_per_day
    if member.billing_rate is not None and member.billing_rate > 0 and member.hours_per_day:
        return member.billing_rate * Decimal(member.hours_per_day)
    _, billing_rate = _get_bu_rate_for_role(member.role, default_rates)
    return billing_rate


class CalculationEngine:
    """Deterministic financial calculation engine. Rates are per day."""

    def __init__(self) -> None:
        self.settings = get_settings()

    @staticmethod
    def _round(value: Decimal, places: int = 2) -> Decimal:
        """Round for internal calculation - display layer rounds for output."""
        quantize = Decimal(10) ** -places
        return value.quantize(quantize, rounding=ROUND_HALF_UP)

    def cost_per_day(
        self,
        member: TeamMember,
        default_rates: dict[str, tuple[Decimal, Decimal]],
    ) -> Decimal:
        """Effective cost per day = cost_rate_per_day / utilization (cost when fully utilized)."""
        rate = _resolve_cost_rate_per_day(member, default_rates)
        utilization = member.utilization_pct / Decimal(100)
        if utilization == 0:
            return Decimal(0)
        return self._round(rate / utilization)

    def total_effort_hours(self, features: list[Feature]) -> Decimal:
        """Sum of all feature effort hours (base, no contingency)."""
        return sum(f.effort_hours for f in features)

    def total_effort_hours_with_task_contingency(
        self,
        features: list[Feature],
        effort_allocations: dict[int, list[Any]],
    ) -> Decimal:
        """Sum of effort hours with task-level contingency (Jr/Sr) applied."""
        total = Decimal(0)
        for feature in features:
            allocations = effort_allocations.get(feature.id, [])
            if allocations:
                for alloc in allocations:
                    mult = _task_contingency_multiplier(alloc.role, self.settings)
                    total += alloc.effort_hours * mult
            else:
                mult = Decimal(str(self.settings.task_contingency_default))
                total += feature.effort_hours * mult
        return self._round(total)

    def base_cost(
        self,
        team_members: list[TeamMember],
        features: list[Feature],
        effort_allocations: dict[int, list[Any]],
        default_rates: dict[str, tuple[Decimal, Decimal]],
    ) -> Decimal:
        """Total Cost = Σ (Effort Hours × Cost per Hour). Cost per hour = cost_rate_per_day / (hours_per_day * utilization)."""
        total = Decimal(0)
        for feature in features:
            allocations = effort_allocations.get(feature.id, [])
            if allocations:
                for alloc in allocations:
                    base_hours = alloc.effort_hours
                    mult = _task_contingency_multiplier(alloc.role, self.settings)
                    role_hours = base_hours * mult
                    member = next(
                        (m for m in team_members if m.role == alloc.role),
                        None,
                    )
                    if member:
                        cost_rate = _resolve_cost_rate_per_day(member, default_rates)
                        hours_per_day = Decimal(member.hours_per_day or self.settings.default_hours_per_day)
                        util = member.utilization_pct / Decimal(100)
                        if hours_per_day > 0 and util > 0:
                            cost_per_hour = cost_rate / (hours_per_day * util)
                            total += role_hours * cost_per_hour
                    else:
                        cost_rate, _ = _get_bu_rate_for_role(alloc.role, default_rates)
                        hours_per_day = Decimal(self.settings.default_hours_per_day)
                        util = Decimal(str(self.settings.default_utilization_pct / 100))
                        if cost_rate > 0 and hours_per_day > 0 and util > 0:
                            cost_per_hour = cost_rate / (hours_per_day * util)
                            total += role_hours * cost_per_hour
            else:
                total_hours = feature.effort_hours
                mult = Decimal(str(self.settings.task_contingency_default))
                if team_members:
                    mult = _task_contingency_multiplier(team_members[0].role, self.settings)
                role_hours = total_hours * mult
                if team_members:
                    m0 = team_members[0]
                    cost_rate = _resolve_cost_rate_per_day(m0, default_rates)
                    hours_per_day = Decimal(m0.hours_per_day or self.settings.default_hours_per_day)
                    util = m0.utilization_pct / Decimal(100)
                    if hours_per_day > 0 and util > 0:
                        cost_per_hour = cost_rate / (hours_per_day * util)
                        total += role_hours * cost_per_hour
        return self._round(total)

    def cost_with_buffers(
        self,
        base_cost: Decimal,
        contingency_pct: Decimal,
        management_reserve_pct: Decimal,
    ) -> tuple[Decimal, Decimal, Decimal]:
        """Base cost + risk buffer + total cost."""
        contingency = base_cost * (contingency_pct / Decimal(100))
        reserve = base_cost * (management_reserve_pct / Decimal(100))
        risk_buffer = self._round(contingency + reserve)
        total = self._round(base_cost + risk_buffer)
        return (base_cost, risk_buffer, total)

    def revenue(
        self,
        version: ProjectVersion,
        project: Any,
        team_members: list[TeamMember],
        features: list[Feature],
        effort_allocations: dict[int, list[Any]],
        default_rates: dict[str, tuple[Decimal, Decimal]],
        milestone_amounts: list[Decimal] | None = None,
    ) -> Decimal:
        """Revenue based on model: Fixed, T&M, or Milestone. Billing is per day."""
        if project.revenue_model == RevenueModel.FIXED and project.fixed_revenue:
            return project.fixed_revenue

        if project.revenue_model == RevenueModel.MILESTONE and milestone_amounts:
            return sum(milestone_amounts)

        if project.revenue_model == RevenueModel.T_M:
            total = Decimal(0)
            for feature in features:
                allocations = effort_allocations.get(feature.id, [])
                if allocations:
                    for alloc in allocations:
                        member = next(
                            (m for m in team_members if m.role == alloc.role),
                            None,
                        )
                        if member:
                            billing_per_day = _resolve_billing_rate_per_day(member, default_rates)
                            hours_per_day = Decimal(member.hours_per_day or 8)
                            if hours_per_day > 0:
                                effort_days = alloc.effort_hours / hours_per_day
                                total += effort_days * billing_per_day
                        else:
                            _, billing_per_day = _get_bu_rate_for_role(alloc.role, default_rates)
                            hours_per_day = Decimal(8)
                            if billing_per_day > 0 and hours_per_day > 0:
                                effort_days = alloc.effort_hours / hours_per_day
                                total += effort_days * billing_per_day
                else:
                    total_hours = feature.effort_hours
                    if team_members:
                        billing_per_day = _resolve_billing_rate_per_day(team_members[0], default_rates)
                        hours_per_day = Decimal(team_members[0].hours_per_day or 8)
                        if hours_per_day > 0:
                            effort_days = total_hours / hours_per_day
                            total += effort_days * billing_per_day
            return self._round(total)

        return Decimal(0)

    def gross_margin(self, revenue: Decimal, cost: Decimal) -> Decimal | None:
        """Gross Margin % = (Revenue - Cost) / Revenue × 100."""
        if revenue == 0:
            return None
        return self._round((revenue - cost) / revenue * Decimal(100))

    def net_margin(self, revenue: Decimal, total_cost: Decimal) -> Decimal | None:
        """Net Margin % (with reserve applied)."""
        return self.gross_margin(revenue, total_cost)

    def reverse_margin_revenue(self, cost: Decimal, target_margin_pct: Decimal) -> Decimal:
        """Required Revenue = Cost / (1 - Target Margin)."""
        if target_margin_pct >= 100:
            return Decimal(0)
        factor = Decimal(1) - (target_margin_pct / Decimal(100))
        if factor <= 0:
            return Decimal(0)
        return self._round(cost / factor)

    def reverse_margin_billing_rate(
        self,
        total_cost: Decimal,
        total_effort_hours: Decimal,
        target_margin_pct: Decimal,
    ) -> Decimal:
        """Required Billing Rate per day = Required Revenue / Total Effort Days."""
        if total_effort_hours <= 0:
            return Decimal(0)
        required_revenue = self.reverse_margin_revenue(total_cost, target_margin_pct)
        effort_days = total_effort_hours / Decimal(8)
        if effort_days <= 0:
            return Decimal(0)
        return self._round(required_revenue / effort_days)

    def sprint_capacity(
        self,
        team_members: list[TeamMember],
        sprint_config: SprintConfig | None,
    ) -> Decimal:
        """Sprint Capacity = Members × Working Days in Sprint × Hours × Utilization."""
        if not sprint_config:
            working_days_per_month = self.settings.default_working_days_per_month
            duration_weeks = self.settings.default_sprint_duration_weeks
        else:
            working_days_per_month = sprint_config.working_days_per_month
            duration_weeks = sprint_config.duration_weeks

        days_in_sprint = Decimal(working_days_per_month * duration_weeks // 2)
        if days_in_sprint <= 0:
            days_in_sprint = Decimal(
                self.settings.default_working_days_per_month * self.settings.default_sprint_duration_weeks // 2
            )
        total = Decimal(0)
        for m in team_members:
            capacity = (
                days_in_sprint
                * Decimal(m.hours_per_day)
                * (m.utilization_pct / Decimal(100))
            )
            total += capacity
        return self._round(total)

    def sprints_required(
        self,
        total_effort_hours: Decimal,
        sprint_capacity: Decimal,
    ) -> int:
        """Number of sprints required."""
        if sprint_capacity <= 0:
            return 0
        return int((total_effort_hours / sprint_capacity).to_integral_value(rounding=ROUND_UP))

    def effort_override_exceeds_threshold(
        self,
        previous_effort: Decimal,
        new_effort: Decimal,
    ) -> bool:
        """Check if effort change exceeds ±15% threshold."""
        if previous_effort == 0:
            return new_effort != 0
        pct_change = abs((new_effort - previous_effort) / previous_effort * Decimal(100))
        return pct_change > Decimal(str(self.settings.effort_override_threshold))

    def margin_below_threshold(self, margin_pct: Decimal | None) -> bool:
        """Check if margin is below warning threshold (e.g. 15%)."""
        if margin_pct is None:
            return False
        return margin_pct < Decimal(str(self.settings.margin_threshold_warning))

    def sprint_plan_cost(
        self,
        sprint_plan_rows: list[dict],
        team_members: list[TeamMember],
        default_rates: dict[str, tuple[Decimal, Decimal]],
        sprint_config: dict | None,
        contingency_pct: Decimal = Decimal(0),
        management_reserve_pct: Decimal = Decimal(0),
    ) -> tuple[Decimal, Decimal, Decimal]:
        """
        Cost from sprint plan: FTE × cost_rate_per_day × duration_days per row.
        Returns (base_cost, risk_buffer, total_cost).
        """
        if not sprint_config:
            working_days = self.settings.default_working_days_per_month
            duration_weeks = self.settings.default_sprint_duration_weeks
        else:
            working_days = sprint_config.get("working_days_per_month", 20)
            duration_weeks = sprint_config.get("duration_weeks", 2)
        days_per_sprint = Decimal(working_days * duration_weeks // 2)
        if days_per_sprint <= 0:
            days_per_sprint = Decimal(10)

        role_to_rate: dict[str, Decimal] = {}
        for m in team_members:
            r = (m.role or "").strip()
            if r and r not in role_to_rate:
                role_to_rate[r] = _resolve_cost_rate_per_day(m, default_rates)
        for role in set(k for row in sprint_plan_rows for k in (row.get("allocations") or {})):
            if role and role not in role_to_rate:
                rate, _ = _get_bu_rate_for_role(role, default_rates)
                role_to_rate[role] = rate

        total = Decimal(0)
        for row in sprint_plan_rows:
            allocations = row.get("allocations") or {}
            row_type = row.get("row_type") or ""
            if row_type == "phase":
                days = days_per_sprint
            else:
                days = days_per_sprint
            for role, fte in allocations.items():
                rate = role_to_rate.get((role or "").strip(), Decimal(0))
                fte_val = Decimal(str(fte)) if fte is not None else Decimal(0)
                total += fte_val * rate * days
        base = self._round(total)
        return self.cost_with_buffers(base, contingency_pct, management_reserve_pct)
