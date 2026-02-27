"""Auth API routes."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token
from app.database import get_db
from app.models.user import User
from app.schemas.auth import Token, UserCreate, UserLogin, UserResponse
from app.services.auth_service import authenticate_user, create_user, user_to_response

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
async def register(
    data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await create_user(db, data)
    await db.refresh(user)
    from sqlalchemy.orm import selectinload
    from app.models.user import UserRole
    await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = (await db.execute(select(User).where(User.id == user.id).options(selectinload(User.user_roles).selectinload(UserRole.role)))).scalar_one()
    token = create_access_token(data={"sub": str(user.id)})
    return Token(access_token=token, user=user_to_response(user))


@router.post("/login", response_model=Token)
async def login(
    data: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await authenticate_user(db, data)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    from sqlalchemy.orm import selectinload
    from app.models.user import UserRole
    await db.refresh(user)
    result = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = result.scalar_one()
    token = create_access_token(data={"sub": str(user.id)})
    return Token(access_token=token, user=user_to_response(user))
