from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/performance", tags=["performance"])


class ReviewCreate(BaseModel):
    employee_id: str
    review_period: str
    rating: int  # 1-5
    goals: str = ""
    achievements: str = ""
    areas_of_improvement: str = ""


class ReviewUpdate(BaseModel):
    rating: Optional[int] = None
    goals: Optional[str] = None
    achievements: Optional[str] = None
    areas_of_improvement: Optional[str] = None
    status: Optional[str] = None


@router.get("")
async def list_reviews(request: Request):
    user = await get_current_user(request)
    query = {}
    if user["role"] == "employee":
        query["employee_id"] = user.get("employee_id")
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    reviews = await db.performance_reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return reviews


@router.post("")
async def create_review(req: ReviewCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    employee = await db.users.find_one({"employee_id": req.employee_id}, {"_id": 0, "password_hash": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    review = {
        "id": str(uuid.uuid4()),
        "employee_id": req.employee_id,
        "employee_name": employee.get("name", ""),
        "reviewer_id": user.get("employee_id", user["email"]),
        "reviewer_name": user.get("name", ""),
        "tenant_id": user.get("tenant_id") or employee.get("tenant_id"),
        "review_period": req.review_period,
        "rating": min(5, max(1, req.rating)),
        "goals": req.goals,
        "achievements": req.achievements,
        "areas_of_improvement": req.areas_of_improvement,
        "ai_summary": None,
        "status": "submitted",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.performance_reviews.insert_one(review)
    review.pop("_id", None)
    return review


@router.put("/{review_id}")
async def update_review(review_id: str, req: ReviewUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    result = await db.performance_reviews.update_one({"id": review_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    review = await db.performance_reviews.find_one({"id": review_id}, {"_id": 0})
    return review


@router.post("/{review_id}/ai-summary")
async def generate_ai_summary(review_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    review = await db.performance_reviews.find_one({"id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"review-{review_id}",
            system_message="You are an HR performance review analyst. Generate concise, professional performance summaries."
        ).with_model("openai", "gpt-5.2")

        prompt = f"""Generate a professional performance review summary for the following employee review:

Employee: {review.get('employee_name', 'N/A')}
Review Period: {review.get('review_period', 'N/A')}
Rating: {review.get('rating', 'N/A')}/5
Goals: {review.get('goals', 'N/A')}
Achievements: {review.get('achievements', 'N/A')}
Areas of Improvement: {review.get('areas_of_improvement', 'N/A')}

Provide a 3-4 sentence summary highlighting key strengths, areas for growth, and an overall assessment. Be constructive and professional."""

        user_message = UserMessage(text=prompt)
        summary = await chat.send_message(user_message)

        await db.performance_reviews.update_one(
            {"id": review_id},
            {"$set": {"ai_summary": summary}}
        )
        return {"ai_summary": summary}
    except Exception as e:
        logger.error(f"AI summary generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI summary generation failed: {str(e)}")
