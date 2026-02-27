"""Add cost_rate_per_day, billing_rate_per_day to team_members; create role_default_rates table."""
import asyncio
from sqlalchemy import text
from app.database import engine


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE team_members ADD COLUMN IF NOT EXISTS cost_rate_per_day NUMERIC(18,2)"))
        await conn.execute(text("ALTER TABLE team_members ADD COLUMN IF NOT EXISTS billing_rate_per_day NUMERIC(18,2)"))
        try:
            await conn.execute(text("ALTER TABLE team_members ALTER COLUMN monthly_cost_rate DROP NOT NULL"))
        except Exception:
            pass
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS role_default_rates (
                id SERIAL PRIMARY KEY,
                role VARCHAR(100) NOT NULL UNIQUE,
                cost_rate_per_day NUMERIC(18,2) NOT NULL,
                billing_rate_per_day NUMERIC(18,2) NOT NULL
            )
        """))
        await conn.execute(text("""
            UPDATE team_members SET cost_rate_per_day = monthly_cost_rate / NULLIF(working_days_per_month, 0)
            WHERE cost_rate_per_day IS NULL AND monthly_cost_rate IS NOT NULL
        """))
        await conn.execute(text("""
            UPDATE team_members SET billing_rate_per_day = billing_rate * hours_per_day
            WHERE billing_rate_per_day IS NULL AND billing_rate IS NOT NULL AND hours_per_day IS NOT NULL
        """))
    print("Migration complete")


if __name__ == "__main__":
    asyncio.run(migrate())
