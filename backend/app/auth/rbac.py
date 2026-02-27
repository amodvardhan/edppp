"""Role-based access control."""
from enum import Enum
from functools import wraps
from typing import Callable

from fastapi import HTTPException, status

ROLE_NAMES = [
    "admin",
    "delivery_manager",
    "business_analyst",
    "project_manager",
    "technical_architect",
    "finance_reviewer",
    "viewer",
]


class Role(str, Enum):
    ADMIN = "admin"
    DELIVERY_MANAGER = "delivery_manager"
    BUSINESS_ANALYST = "business_analyst"
    PROJECT_MANAGER = "project_manager"
    TECHNICAL_ARCHITECT = "technical_architect"
    FINANCE_REVIEWER = "finance_reviewer"
    VIEWER = "viewer"


def require_roles(*allowed: Role) -> Callable:
    """Decorator to require specific roles."""

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user_roles = kwargs.get("user_roles", [])
            if not user_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No roles assigned",
                )
            user_role_names = [r.lower() for r in user_roles]
            allowed_names = [r.value for r in allowed]
            if not any(r in user_role_names for r in allowed_names):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Requires one of: {allowed_names}",
                )
            return await func(*args, **kwargs)

        return wrapper

    return decorator


def can_create_project(roles: list[str]) -> bool:
    return any(
        r.lower() in ["admin", "delivery_manager", "business_analyst", "finance_reviewer"]
        for r in roles
    )


def can_edit_team(roles: list[str]) -> bool:
    return any(
        r.lower() in ["admin", "delivery_manager"]
        for r in roles
    )


def can_edit_features(roles: list[str]) -> bool:
    return any(
        r.lower() in ["admin", "delivery_manager", "business_analyst"]
        for r in roles
    )


def can_modify_effort(roles: list[str]) -> bool:
    return any(
        r.lower() in ["admin", "technical_architect"]
        for r in roles
    )


def can_lock_project(roles: list[str]) -> bool:
    return any(
        r.lower() in ["admin", "finance_reviewer"]
        for r in roles
    )


def can_unlock_project(roles: list[str]) -> bool:
    return any(r.lower() == "admin" for r in roles)


def can_delete_project(roles: list[str]) -> bool:
    return any(
        r.lower() in ["admin", "delivery_manager", "business_analyst", "finance_reviewer"]
        for r in roles
    )
