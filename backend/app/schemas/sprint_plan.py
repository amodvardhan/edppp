"""Sprint plan schemas."""
from typing import Literal

from pydantic import BaseModel, Field


class SprintPlanRowSchema(BaseModel):
    id: str
    type: Literal["sprint-week", "phase"]
    sprint_num: int | None = None
    week_num: int | None = None
    phase: Literal["pre_uat", "uat", "go_live"] | None = None
    values: dict[str, float] = Field(default_factory=dict)


class SprintPlanSchema(BaseModel):
    rows: list[SprintPlanRowSchema]
    roles: list[str]


class SprintPlanUpdate(BaseModel):
    rows: list[SprintPlanRowSchema]
    roles: list[str]
