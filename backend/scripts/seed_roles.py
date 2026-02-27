"""Seed roles and demo user."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker, init_db
from app.models.user import Role, User, UserRole
from app.auth.jwt import get_password_hash


ROLES = [
    ("admin", "System administrator"),
    ("delivery_manager", "Delivery Manager"),
    ("business_analyst", "Business Analyst"),
    ("project_manager", "Project Manager"),
    ("technical_architect", "Technical Architect"),
    ("finance_reviewer", "Finance Reviewer"),
    ("viewer", "Read-only viewer"),
]


async def seed():
    await init_db()
    async with async_session_maker() as db:
        for name, desc in ROLES:
            r = await db.execute(select(Role).where(Role.name == name))
            if not r.scalar_one_or_none():
                db.add(Role(name=name, description=desc))
        await db.commit()

        admin_role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one()
        r = await db.execute(select(User).where(User.email == "admin@dppe.local"))
        if not r.scalar_one_or_none():
            user = User(
                email="admin@dppe.local",
                hashed_password=get_password_hash("admin123"),
                full_name="Admin User",
            )
            db.add(user)
            await db.flush()
            db.add(UserRole(user_id=user.id, role_id=admin_role.id))
        await db.commit()
    print("Seeded roles and admin user (admin@dppe.local / admin123)")


if __name__ == "__main__":
    asyncio.run(seed())
