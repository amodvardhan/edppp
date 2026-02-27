"""Authentication service."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token, get_password_hash, verify_password
from app.models.user import Role, User, UserRole
from app.schemas.auth import UserCreate, UserLogin, UserResponse


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    """Create user with roles."""
    user = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    await db.flush()
    for role_id in data.role_ids:
        db.add(UserRole(user_id=user.id, role_id=role_id))
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, data: UserLogin) -> User | None:
    """Authenticate user by email and password."""
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        return None
    return user


def user_to_response(user: User) -> UserResponse:
    """Convert user to response with roles."""
    roles = []
    for ur in user.user_roles:
        if ur.role:
            roles.append(ur.role.name)
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=roles,
    )
