"""Add tasks column to features table. Run: python -m scripts.add_feature_tasks_column"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE features
            ADD COLUMN IF NOT EXISTS tasks JSONB
        """))
    print("Added tasks column to features table.")


if __name__ == "__main__":
    asyncio.run(migrate())
