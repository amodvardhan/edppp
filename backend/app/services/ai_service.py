"""AI effort estimation and team allocation service."""
import json
import re
from decimal import Decimal

from openai import AsyncOpenAI

from app.config import get_settings
from app.schemas.feature import EffortAllocationCreate, FeatureCreate, FeatureTaskCreate
from app.schemas.team import TeamMemberCreate


FEATURE_EXTRACTION_PROMPT = """You are an expert software delivery estimator and business analyst. Your task is to extract a detailed feature breakdown from requirement documents (SOW, ToR, user stories, PRD, etc.).

## Output Format
Return a JSON array of features. Each feature MUST have exactly these fields:

- sr_no: integer (sequential number, 1, 2, 3...)
- name: string (clear, concise feature name)
- description: string (brief 1-2 sentence description of what the feature delivers)
- priority: integer (1 = highest/critical, 2 = high, 3 = medium, 4 = low, 5 = nice-to-have)
- tasks: array of task objects, each with:
  - name: string (specific deliverable or work item)
  - effort_hours: number (realistic hours for this task)
  - role: string (primary role doing this work)
- effort_hours: number (TOTAL hours = sum of all task effort_hours for this feature)
- effort_allocations: array derived from tasks, each with:
  - role: string
  - allocation_pct: number (percentage of this feature's effort by this role, must sum to 100)
  - effort_hours: number (hours for this role on this feature)

## Role Guidelines (AI Suggested Roles)
Suggest the most appropriate role for each task. Use common delivery role names such as:
- Developer, Senior Developer for development work (UI, frontend, backend, API, integration, coding)
- QA Engineer for testing, QA, validation, UAT
- Business Analyst for requirements, analysis, documentation
- UX Designer for design, wireframes, prototypes
- Tech Lead, DevOps, Data Engineer, Project Manager when relevant

If the organization has BU-configured roles, prefer these when they fit: {bu_role_names}
Otherwise suggest the best-fit role for the task (e.g. Developer, QA Engineer, Business Analyst).
The user will select a BU role in the grid for billing and cost calculation.
Assign exactly one role per task.

## Task Breakdown Rules
- Break each feature into 2-8 discrete, actionable tasks
- Each task should be completable by one role in a reasonable timeframe
- Effort should be realistic: simple UI = 4-8 hrs, API = 8-16 hrs, complex integration = 16-40 hrs
- Tasks must be specific (e.g. "Implement login API with JWT" not "Backend work")
- Sum of task effort_hours MUST equal feature effort_hours

## Extraction Rules
- Extract ALL features mentioned or implied in the requirements
- Infer tasks from descriptions when not explicitly listed
- Use priority 1 for must-have/critical path items
- Be thorough: capture integrations, testing, documentation, deployment tasks
- If a section describes multiple sub-features, create separate features

## Example
[
  {
    "sr_no": 1,
    "name": "User Authentication",
    "description": "Secure login, registration, and session management.",
    "priority": 1,
    "tasks": [
      {"name": "Login/Register UI components", "effort_hours": 12, "role": "Developer"},
      {"name": "Auth API with JWT", "effort_hours": 16, "role": "Developer"},
      {"name": "Unit and integration tests", "effort_hours": 8, "role": "QA Engineer"}
    ],
    "effort_hours": 36,
    "effort_allocations": [
      {"role": "Developer", "allocation_pct": 77.8, "effort_hours": 28},
      {"role": "QA Engineer", "allocation_pct": 22.2, "effort_hours": 8}
    ]
  }
]

Return ONLY valid JSON. No markdown, no explanation, no code blocks.

Requirements:
"""


def _build_feature_prompt(bu_role_names_str: str) -> str:
    return FEATURE_EXTRACTION_PROMPT.replace("{bu_role_names}", bu_role_names_str)


async def estimate_features_from_requirements(
    requirement_text: str,
    bu_role_names: list[str] | None = None,
) -> tuple[list[FeatureCreate], str]:
    """Use AI to suggest features with tasks, effort, priority, and role from requirement text.
    bu_role_names: Optional BU-configured roles; AI prefers these when they fit, but can suggest
    other appropriate roles. User maps to BU roles in the grid for billing."""
    settings = get_settings()
    role_list = bu_role_names if bu_role_names else [
        "Developer", "Senior Developer", "QA Engineer", "Business Analyst",
        "UX Designer", "Tech Lead", "DevOps", "Data Engineer", "Project Manager",
    ]
    bu_role_names_str = ", ".join(role_list)
    if not settings.openai_api_key:
        return [], "AI estimation unavailable: OPENAI_API_KEY not configured"

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    try:
        prompt = _build_feature_prompt(bu_role_names_str) + requirement_text
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You return only valid JSON. No markdown, no explanation."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content or ""
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
        data = json.loads(content.strip())
        features = []
        first_role = role_list[0] if role_list else "Developer"

        def sanitize_role(raw: str) -> str:
            """Use AI-suggested role as-is; only sanitize empty/invalid."""
            r = str(raw or "").strip()[:100]
            return r if r else first_role

        for item in data if isinstance(data, list) else []:
            tasks_raw = item.get("tasks", [])
            tasks = []
            for t in tasks_raw:
                tasks.append(
                    FeatureTaskCreate(
                        name=str(t.get("name", "Unnamed"))[:500],
                        effort_hours=Decimal(str(t.get("effort_hours", 0))),
                        role=sanitize_role(t.get("role", first_role)),
                    )
                )
            allocations = []
            for a in item.get("effort_allocations", []):
                allocations.append(
                    EffortAllocationCreate(
                        role=sanitize_role(a.get("role", first_role)),
                        allocation_pct=Decimal(str(a.get("allocation_pct", 100))),
                        effort_hours=Decimal(str(a.get("effort_hours", item.get("effort_hours", 0)))),
                    )
                )
            if not allocations and tasks:
                role_hours: dict[str, Decimal] = {}
                for t in tasks:
                    role_hours[t.role] = role_hours.get(t.role, Decimal(0)) + t.effort_hours
                total = sum(role_hours.values()) or Decimal(1)
                for role, hrs in role_hours.items():
                    pct = (hrs / total * 100).quantize(Decimal("0.01"))
                    allocations.append(EffortAllocationCreate(role=role, allocation_pct=pct, effort_hours=hrs))
            if not allocations:
                allocations.append(
                    EffortAllocationCreate(
                        role=first_role,
                        allocation_pct=Decimal(100),
                        effort_hours=Decimal(str(item.get("effort_hours", 0))),
                    )
                )
            features.append(
                FeatureCreate(
                    name=str(item.get("name", "Unnamed"))[:255],
                    description=str(item.get("description", ""))[:2000] if item.get("description") else None,
                    priority=int(item.get("priority", 1)),
                    effort_hours=Decimal(str(item.get("effort_hours", 0))),
                    effort_allocations=allocations,
                    tasks=tasks,
                )
            )
        return features, content
    except Exception as e:
        return [], str(e)


async def suggest_team_allocation(
    features: list[FeatureCreate],
    total_effort_hours: float,
    sprint_duration_weeks: int = 2,
) -> tuple[list[TeamMemberCreate], str]:
    """Suggest realistic team composition based on features and effort."""
    settings = get_settings()
    if not settings.openai_api_key:
        return [], "AI team suggestion unavailable: OPENAI_API_KEY not configured"

    feature_summary = "\n".join(
        f"- {f.name}: {float(f.effort_hours)} hrs (priority {f.priority})"
        for f in features[:20]
    )
    if len(features) > 20:
        feature_summary += f"\n... and {len(features) - 20} more features"

    prompt = f"""You are an expert delivery manager. Given the following features and total effort, suggest a REALISTIC team composition.

Features and effort:
{feature_summary}

Total effort: {total_effort_hours} hours
Sprint duration: {sprint_duration_weeks} weeks

Return a JSON array of team members. Each member must have:
- role: string (e.g. "Senior Developer", "QA Engineer", "Business Analyst", "Tech Lead")
- cost_rate_per_day: number (cost to company per day, e.g. 400)
- billing_rate_per_day: number (rate to client per day, e.g. 960)
- utilization_pct: number (0-100, typical 80 for full-time on project)
- working_days_per_month: 20
- hours_per_day: 8

Rules:
- Suggest a SMALL, realistic team (typically 2-6 people for most projects)
- Match roles to the work (dev features need developers, QA needs QA, etc.)
- Avoid overstaffing; prefer fewer senior people over many juniors
- Total team capacity should roughly match total effort over a reasonable timeline
- Use member_name: null (we don't assign names yet)
"""
    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You return only valid JSON. No markdown, no explanation."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content or ""
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
        data = json.loads(content.strip())
        members = []
        for item in data if isinstance(data, list) else []:
            members.append(
                TeamMemberCreate(
                    role=str(item.get("role", "Developer")),
                    member_name=None,
                    cost_rate_per_day=Decimal(str(item.get("cost_rate_per_day", 400))),
                    billing_rate_per_day=Decimal(str(item.get("billing_rate_per_day", 960))),
                    utilization_pct=Decimal(str(item.get("utilization_pct", 80))),
                    working_days_per_month=int(item.get("working_days_per_month", 20)),
                    hours_per_day=int(item.get("hours_per_day", 8)),
                )
            )
        return members, content
    except Exception as e:
        return [], str(e)
