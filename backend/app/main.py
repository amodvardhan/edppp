"""FastAPI application entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import auth, bu_rates, calculations, features, projects, repository, sprint_plan, team, versions

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    pass


app = FastAPI(
    title="Enterprise Delivery Planning & Profitability Platform",
    description="Delivery planning, effort estimation, cost and profitability engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bu_rates.router)
app.include_router(projects.router)
app.include_router(sprint_plan.router)
app.include_router(versions.router)
app.include_router(team.router)
app.include_router(features.router)
app.include_router(calculations.router)
app.include_router(repository.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
