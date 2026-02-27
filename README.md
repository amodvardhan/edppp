# Enterprise Delivery Planning & Profitability Platform (EDPPP)

A secure, deterministic, auditable internal application for Delivery, BA, Finance, and Pre-Sales teams to create delivery plans, configure teams, estimate effort, and calculate cost & profitability.

## Architecture

- **Frontend**: Vite + React + TypeScript
- **Backend**: Python FastAPI
- **Database**: PostgreSQL
- **Auth**: JWT + RBAC (7 roles)

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (optional, for PostgreSQL)

### 1. Database

**Option A: Docker**
```bash
docker-compose up -d postgres
```

**Option B: Local PostgreSQL**
```bash
createdb dppe
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: DATABASE_URL, SECRET_KEY
python scripts/seed_roles.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 4. Login

- **URL**: http://localhost:5173
- **Default admin**: admin@dppe.local / admin123

## Roles

| Role | Create Project | Edit Team | Edit Features | Lock | Unlock |
|------|----------------|-----------|---------------|------|--------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delivery Manager | ✓ | ✓ | ✓ | | |
| Business Analyst | ✓ | | ✓ | | |
| Project Manager | | | | | |
| Technical Architect | | | (effort) | | |
| Finance Reviewer | ✓ | | | ✓ | |
| Viewer | | | | | |

## API Documentation

When the backend is running: http://localhost:8000/docs

## Environment Variables

See `.env.example` for all configuration options.
