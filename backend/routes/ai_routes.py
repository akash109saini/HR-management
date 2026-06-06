"""
AI Engine Routes — HR Intelligence Service
Uses Vectrion in NestJS backend (Google Gemini) for serving all AI features.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid
import httpx
import os

router = APIRouter(prefix="/api/ai", tags=["ai"])

NESTJS_AI_URL = "http://localhost:8002/api/ai"


async def _forward_to_nestjs(method: str, path: str, json_data: dict = None, params: dict = None, request: Request = None) -> dict:
    """Helper to forward HTTP request to the NestJS backend with JWT auth propagation."""
    headers = {"Content-Type": "application/json"}
    if request:
        auth_header = request.headers.get("Authorization")
        if auth_header:
            headers["Authorization"] = auth_header

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if method.upper() == "POST":
                res = await client.post(f"{NESTJS_AI_URL}{path}", json=json_data, headers=headers)
            elif method.upper() == "GET":
                res = await client.get(f"{NESTJS_AI_URL}{path}", params=params, headers=headers)
            else:
                raise HTTPException(status_code=400, detail="Invalid HTTP method")
            
            if res.status_code >= 400:
                try:
                    err_detail = res.json()
                    if isinstance(err_detail, dict) and "message" in err_detail:
                        detail_msg = err_detail["message"]
                    else:
                        detail_msg = res.text
                except Exception:
                    detail_msg = res.text
                raise HTTPException(status_code=res.status_code, detail=f"NestJS AI service error: {detail_msg}")
            
            return res.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Vectrion NestJS AI service unreachable: {str(e)}")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    files: Optional[List[dict]] = None

class SentimentRequest(BaseModel):
    text: str
    context: Optional[str] = "HR feedback"

class ResumeParseRequest(BaseModel):
    resume_text: str
    job_description: Optional[str] = None
    blind_hiring: bool = True

class FeedbackRequest(BaseModel):
    text: str
    category: Optional[str] = "general"
    anonymous: bool = True
    rating: Optional[int] = None


# ─── HR CHATBOT ───────────────────────────────────────────────────────────────

@router.post("/chat")
async def hr_chatbot(req: ChatRequest, request: Request):
    """AI HR Chatbot — delegates message serving to Vectrion in NestJS."""
    user = await get_current_user(request)
    payload = {"message": req.message, "session_id": req.session_id, "files": req.files}
    
    data = await _forward_to_nestjs("POST", "/chat", json_data=payload, request=request)
    
    # Optional: log the conversation to local DB for tracking
    try:
        await db.ai_conversations.insert_one({
            "conversation_id": str(uuid.uuid4()),
            "session_id":      data.get("session_id"),
            "employee_id":     user.get("employee_id"),
            "tenant_id":       user.get("tenant_id"),
            "user_message":    req.message,
            "ai_response":     data.get("response"),
            "model":           data.get("model", "gemini-2.5-flash"),
            "timestamp":       datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # non-blocking
        
    return data


# ─── ATTRITION RISK PREDICTION ────────────────────────────────────────────────

@router.get("/attrition-risk/{employee_id}")
async def predict_attrition_risk(employee_id: str, request: Request):
    """AI Attrition Risk prediction — delegates logic and scoring to Vectrion."""
    return await _forward_to_nestjs("GET", f"/attrition-risk/{employee_id}", request=request)


# ─── SENTIMENT ANALYSIS ───────────────────────────────────────────────────────

@router.post("/sentiment")
async def analyze_sentiment(req: SentimentRequest, request: Request):
    """Analyze sentiment of text — delegates to Vectrion."""
    payload = {"text": req.text, "context": req.context}
    return await _forward_to_nestjs("POST", "/analyze-sentiment", json_data=payload, request=request)


# ─── FEEDBACK COLLECTION & SENTIMENT DASHBOARD ────────────────────────────────

@router.post("/feedback")
async def submit_feedback(req: FeedbackRequest, request: Request):
    """Employee feedback collection — calls Vectrion for analysis, then saves."""
    user = await get_current_user(request)

    payload = {"text": req.text, "context": f"Feedback Category: {req.category}"}
    sentiment = {}
    try:
        sentiment = await _forward_to_nestjs("POST", "/analyze-sentiment", json_data=payload, request=request)
    except Exception:
        sentiment = {
            "sentiment": "neutral",
            "score": 0.0,
            "confidence": 0.5,
            "emotions": [],
            "key_themes": [],
            "summary": "Fallback (Service error)",
            "action_needed": False,
            "recommended_action": ""
        }

    doc = {
        "feedback_id":        str(uuid.uuid4()),
        "tenant_id":          user.get("tenant_id"),
        "employee_id":        None if req.anonymous else user.get("employee_id"),
        "employee_name":      None if req.anonymous else user.get("name"),
        "anonymous":          req.anonymous,
        "category":           req.category,
        "text":               req.text,
        "rating":             req.rating,
        "sentiment":          sentiment.get("sentiment", "neutral"),
        "score":              float(sentiment.get("score", 0)),
        "confidence":         float(sentiment.get("confidence", 0)),
        "emotions":           sentiment.get("emotions", []),
        "key_themes":         sentiment.get("key_themes", []),
        "summary":            sentiment.get("summary", ""),
        "action_needed":      bool(sentiment.get("action_needed", False)),
        "recommended_action": sentiment.get("recommended_action", ""),
        "created_at":         datetime.now(timezone.utc).isoformat(),
    }
    await db.feedbacks.insert_one(doc)
    return {"message": "Thanks for sharing — your feedback helps us improve.", "feedback": {k: v for k, v in doc.items() if k != "_id"}}


@router.get("/sentiment-dashboard")
async def sentiment_dashboard(request: Request, days: int = 30):
    """HR-only: Aggregated sentiment analytics."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="HR / Admin only")

    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query: dict = {"created_at": {"$gte": cutoff}}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")

    feedbacks = await db.feedbacks.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)

    total           = len(feedbacks)
    sentiment_counts: dict = {"positive": 0, "negative": 0, "neutral": 0, "mixed": 0}
    category_counts: dict  = {}
    theme_counts:    dict  = {}
    emotion_counts:  dict  = {}
    score_sum        = 0.0
    action_items:    list  = []
    daily:           dict  = {}

    for f in feedbacks:
        s = f.get("sentiment", "neutral")
        sentiment_counts[s] = sentiment_counts.get(s, 0) + 1
        cat = f.get("category", "general")
        category_counts[cat] = category_counts.get(cat, 0) + 1
        for t in (f.get("key_themes") or [])[:5]:
            theme_counts[t] = theme_counts.get(t, 0) + 1
        for e in (f.get("emotions") or [])[:5]:
            emotion_counts[e] = emotion_counts.get(e, 0) + 1
        score_sum += float(f.get("score", 0))
        if f.get("action_needed"):
            action_items.append({k: f[k] for k in ("feedback_id", "text", "sentiment", "summary", "recommended_action", "category", "created_at") if k in f})
        day = (f.get("created_at") or "")[:10]
        if day:
            d = daily.setdefault(day, {"date": day, "positive": 0, "negative": 0, "neutral": 0, "mixed": 0, "avg_score": 0, "n": 0})
            d[s] = d.get(s, 0) + 1
            n = d["n"] + 1
            d["avg_score"] = round((d["avg_score"] * d["n"] + float(f.get("score", 0))) / n, 3)
            d["n"] = n

    top = lambda dd, n=8: sorted([{"label": k, "count": v} for k, v in dd.items()], key=lambda x: -x["count"])[:n]

    return {
        "period_days": days, "total_feedbacks": total,
        "average_score": round(score_sum / total, 3) if total else 0,
        "sentiment_distribution": sentiment_counts,
        "category_distribution":  category_counts,
        "top_themes":   top(theme_counts),
        "top_emotions": top(emotion_counts),
        "action_needed_count": len(action_items),
        "action_needed_items": action_items[:20],
        "trend":              sorted(daily.values(), key=lambda x: x["date"]),
        "recent_feedbacks":   feedbacks[:10],
    }


@router.get("/feedbacks")
async def list_feedbacks(request: Request, limit: int = 50, sentiment: Optional[str] = None, category: Optional[str] = None):
    """HR-only: list raw feedbacks."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="HR / Admin only")
    query: dict = {}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    if sentiment:
        query["sentiment"] = sentiment
    if category:
        query["category"] = category
    docs = await db.feedbacks.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return docs


# ─── RESUME PARSER ────────────────────────────────────────────────────────────

@router.post("/parse-resume")
async def parse_resume(req: ResumeParseRequest, request: Request):
    """Parse resume with Vectrion in NestJS."""
    payload = {
        "resume_text": req.resume_text,
        "job_description": req.job_description,
        "blind_hiring": req.blind_hiring
    }
    return await _forward_to_nestjs("POST", "/parse-resume", json_data=payload, request=request)


# ─── AI CAREER PATH SUGGESTIONS ───────────────────────────────────────────────

@router.get("/career-path/{employee_id}")
async def suggest_career_path(employee_id: str, request: Request):
    """Career path suggestions — delegates to Vectrion in NestJS."""
    return await _forward_to_nestjs("GET", f"/career-path/{employee_id}", request=request)


# ─── STATUS ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def ai_status(request: Request):
    """Check AI service status."""
    try:
        guide = await _forward_to_nestjs("GET", "/setup-guide", request=request)
        return {
            "status":           "running",
            "ai_available":     True,
            "model":            guide.get("model", "gemini-2.5-flash"),
            "provider":         "Google Gemini (Vectrion)",
            "key_configured":   guide.get("status") == "configured",
            "features":         ["chat", "attrition-risk", "sentiment", "parse-resume", "career-path", "feedback"],
        }
    except Exception:
        return {
            "status":           "degraded",
            "ai_available":     False,
            "model":            "gemini-2.5-flash",
            "provider":         "Google Gemini (Vectrion)",
            "key_configured":   False,
            "features":         ["chat", "attrition-risk", "sentiment", "parse-resume", "career-path", "feedback"],
        }
