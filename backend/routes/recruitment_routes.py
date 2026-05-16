from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(prefix="/api/recruitment", tags=["recruitment"])


class JobPostingCreate(BaseModel):
    title: str
    department: str
    description: str
    requirements: str = ""
    location: str = ""
    salary_range: str = ""


class JobPostingUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None


class ApplicantCreate(BaseModel):
    job_id: str
    name: str
    email: str
    phone: str = ""
    resume_text: str = ""


class ApplicantUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("/jobs")
async def list_jobs(request: Request):
    user = await get_current_user(request)
    query = {}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "employee":
        query["tenant_id"] = user.get("tenant_id")
        query["status"] = "open"
    jobs = await db.job_postings.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return jobs


@router.post("/jobs")
async def create_job(req: JobPostingCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    job = {
        "id": str(uuid.uuid4()),
        "tenant_id": user.get("tenant_id"),
        "title": req.title,
        "department": req.department,
        "description": req.description,
        "requirements": req.requirements,
        "location": req.location,
        "salary_range": req.salary_range,
        "status": "open",
        "applicant_count": 0,
        "created_by": user.get("name", user["email"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.job_postings.insert_one(job)
    job.pop("_id", None)
    return job


@router.put("/jobs/{job_id}")
async def update_job(job_id: str, req: JobPostingUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    result = await db.job_postings.update_one({"id": job_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    job = await db.job_postings.find_one({"id": job_id}, {"_id": 0})
    return job


@router.get("/applicants")
async def list_applicants(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    job_id = request.query_params.get("job_id")
    if job_id:
        query["job_id"] = job_id
    applicants = await db.applicants.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return applicants


@router.post("/applicants")
async def create_applicant(req: ApplicantCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    job = await db.job_postings.find_one({"id": req.job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    applicant = {
        "id": str(uuid.uuid4()),
        "job_id": req.job_id,
        "tenant_id": job.get("tenant_id"),
        "name": req.name,
        "email": req.email,
        "phone": req.phone,
        "resume_text": req.resume_text,
        "status": "applied",
        "notes": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.applicants.insert_one(applicant)
    await db.job_postings.update_one({"id": req.job_id}, {"$inc": {"applicant_count": 1}})
    applicant.pop("_id", None)
    return applicant


@router.put("/applicants/{applicant_id}")
async def update_applicant(applicant_id: str, req: ApplicantUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    result = await db.applicants.update_one({"id": applicant_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Applicant not found")
    applicant = await db.applicants.find_one({"id": applicant_id}, {"_id": 0})
    return applicant
