from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: str = "medium"


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[str] = None


@router.get("")
async def list_announcements(request: Request):
    user = await get_current_user(request)
    query = {}
    if user["role"] in ["hr_manager", "employee"]:
        query["tenant_id"] = user.get("tenant_id")
    announcements = await db.announcements.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return announcements


@router.post("")
async def create_announcement(req: AnnouncementCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    announcement = {
        "id": str(uuid.uuid4()),
        "tenant_id": user.get("tenant_id"),
        "title": req.title,
        "content": req.content,
        "priority": req.priority,
        "created_by": user.get("name", user["email"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(announcement)
    announcement.pop("_id", None)
    return announcement


@router.put("/{announcement_id}")
async def update_announcement(announcement_id: str, req: AnnouncementUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    result = await db.announcements.update_one({"id": announcement_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    ann = await db.announcements.find_one({"id": announcement_id}, {"_id": 0})
    return ann


@router.delete("/{announcement_id}")
async def delete_announcement(announcement_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.announcements.delete_one({"id": announcement_id})
    return {"message": "Deleted"}
