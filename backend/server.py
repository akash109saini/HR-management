from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

from database import db, client
from routes.auth_routes import router as auth_router
from routes.tenant_routes import router as tenant_router
from routes.employee_routes import router as employee_router
from routes.attendance_routes import router as attendance_router
from routes.leave_routes import router as leave_router
from routes.payroll_routes import router as payroll_router
from routes.recruitment_routes import router as recruitment_router
from routes.performance_routes import router as performance_router
from routes.announcement_routes import router as announcement_router
from routes.dashboard_routes import router as dashboard_router
from routes.user_routes import router as user_router
from routes.settings_routes import router as settings_router
from routes.ai_routes import router as ai_router
from routes.whatsapp_routes import router as whatsapp_router
from routes.blockchain_routes import router as blockchain_router
from routes.demo_routes import router as demo_router
from routes.biometric_routes import iclock_router, admin_router as biometric_admin_router
from routes.tax_routes import router as tax_router
from routes.pf_routes import router as pf_router
from routes.org_routes import router as org_router
from seed import seed_database

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="HRMS API", version="1.0.0")

# CORS
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3001")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(tenant_router)
app.include_router(employee_router)
app.include_router(org_router)
app.include_router(attendance_router)
app.include_router(leave_router)
app.include_router(payroll_router)
app.include_router(recruitment_router)
app.include_router(performance_router)
app.include_router(announcement_router)
app.include_router(dashboard_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(ai_router)
app.include_router(whatsapp_router)
app.include_router(blockchain_router)
app.include_router(demo_router)
app.include_router(iclock_router)
app.include_router(biometric_admin_router)
app.include_router(tax_router)
app.include_router(pf_router)


@app.get("/api")
async def root():
    return {"message": "HRMS API v1.0"}


@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("employee_id")
    await db.users.create_index("tenant_id")
    await db.attendance.create_index([("user_id", 1), ("date", 1)])
    await db.attendance.create_index("tenant_id")
    await db.leaves.create_index("user_id")
    await db.leaves.create_index("tenant_id")
    await db.punch_corrections.create_index("user_id")
    await db.punch_corrections.create_index("tenant_id")
    await db.payslips.create_index([("employee_id", 1), ("month", 1), ("year", 1)])
    await db.payslips.create_index([("tenant_id", 1), ("month", 1), ("year", 1)])
    await db.login_attempts.create_index("identifier")
    await db.tax_settings.create_index([("tenant_id", 1), ("financial_year", 1)], unique=True)
    await db.tax_declarations.create_index([("employee_id", 1), ("financial_year", 1)], unique=True)
    await db.tax_declarations.create_index([("tenant_id", 1), ("financial_year", 1), ("status", 1)])
    await db.pf_settings.create_index("tenant_id", unique=True)
    logger.info("Database indexes created")

    # Seed database
    await seed_database()
    logger.info("Startup complete")


@app.on_event("shutdown")
async def shutdown():
    client.close()
