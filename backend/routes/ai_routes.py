"""
AI Engine Routes — HR Intelligence Service
Uses emergentintegrations LLM (gpt-4.1-mini) for:
- HR Chatbot (employee self-service Q&A)
- Attrition Risk Prediction
- Sentiment Analysis
- Resume Parser with Blind Hiring
- AI Career Path Suggestions
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from emergentintegrations.llm.chat import LlmChat, UserMessage
import os
import json
import uuid
from dotenv import load_dotenv
load_dotenv()

router = APIRouter(prefix="/api/ai", tags=["ai"])

LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_MODEL = "gpt-4.1-mini"
AI_PROVIDER = "openai"

# ─── Chat sessions (in-memory + DB) ───────────────────────────────────────────
chat_sessions: dict = {}


def get_chat_session(session_id: str, system_message: str) -> LlmChat:
    """Get or create a chat session."""
    if session_id not in chat_sessions:
        chat_sessions[session_id] = LlmChat(
            api_key=LLM_KEY,
            session_id=session_id,
            system_message=system_message,
        ).with_model(AI_PROVIDER, AI_MODEL)
    return chat_sessions[session_id]


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class SentimentRequest(BaseModel):
    text: str
    context: Optional[str] = "HR feedback"

class ResumeParseRequest(BaseModel):
    resume_text: str
    job_description: Optional[str] = None
    blind_hiring: bool = True  # Remove name/photo/gender by default


# ─── HR CHATBOT ───────────────────────────────────────────────────────────────

@router.post("/chat")
async def hr_chatbot(req: ChatRequest, request: Request):
    """AI HR Chatbot - Employee can ask HR questions in natural language."""
    user = await get_current_user(request)
    
    # Get employee context
    employee = await db.users.find_one(
        {"employee_id": user.get("employee_id")}, {"_id": 0, "password_hash": 0}
    )
    
    # Get leave balance for context
    leave_balance = {}
    if employee:
        allowances = {"annual": 21, "sick": 10, "casual": 7}
        approved = await db.leaves.find({
            "employee_id": employee.get("employee_id"),
            "status": "approved"
        }).to_list(100)
        taken = {}
        for l in approved:
            taken[l.get("leave_type", "")] = taken.get(l.get("leave_type", ""), 0) + (l.get("days", 1))
        leave_balance = {t: allowances[t] - taken.get(t, 0) for t in allowances}
    
    system_message = f"""You are an intelligent HR Assistant for a multi-tenant HR Management System.

Employee Context:
- Name: {employee.get('name', 'Unknown') if employee else 'Unknown'}
- Department: {employee.get('department', 'N/A') if employee else 'N/A'}
- Designation: {employee.get('designation', 'N/A') if employee else 'N/A'}
- Leave Balance: Annual={leave_balance.get('annual', 'N/A')}, Sick={leave_balance.get('sick', 'N/A')}, Casual={leave_balance.get('casual', 'N/A')} days

You can help with:
- Leave balance queries and policy
- Payroll and salary questions
- Company policies and procedures
- HR process guidance
- Career development advice
- General workplace queries

Always be professional, helpful, and concise. If you don't know something specific, guide the employee to contact HR directly.
"""

    session_id = req.session_id or f"hr_chat_{user.get('_id', user.get('id', 'unknown'))}_{user.get('tenant_id', '')}"
    
    try:
        chat = get_chat_session(session_id, system_message)
        response = await chat.send_message(UserMessage(text=req.message))
        
        # Save conversation to DB
        await db.ai_conversations.insert_one({
            "conversation_id": str(uuid.uuid4()),
            "session_id": session_id,
            "employee_id": user.get("employee_id"),
            "tenant_id": user.get("tenant_id"),
            "user_message": req.message,
            "ai_response": response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        
        return {
            "response": response,
            "session_id": session_id,
            "model": AI_MODEL,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ─── ATTRITION RISK PREDICTION ────────────────────────────────────────────────

@router.get("/attrition-risk/{employee_id}")
async def predict_attrition_risk(employee_id: str, request: Request):
    """AI-powered attrition risk prediction based on engagement patterns."""
    user = await get_current_user(request)
    
    # Gather data
    employee = await db.users.find_one({"employee_id": employee_id}, {"_id": 0, "password_hash": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    leaves = await db.leaves.find({"employee_id": employee_id}).to_list(100)
    attendance = await db.attendances.find({"employee_id": employee_id}).sort("date", -1).limit(60).to_list(60)
    
    # Compute basic stats for context
    leave_count = len(leaves)
    absent_count = sum(1 for a in attendance if a.get("status") == "absent")
    late_count = sum(1 for a in attendance if a.get("status") == "late")
    
    prompt = f"""Analyze the attrition risk for this employee and provide a risk score from 0-100.

Employee Profile:
- Name: {employee.get('name')}
- Designation: {employee.get('designation', 'N/A')}
- Department: {employee.get('department', 'N/A')}
- Joined: {employee.get('date_of_joining', 'N/A')}
- Status: {employee.get('status', 'active')}

Behavioral Metrics (last 60 days):
- Total leave applications: {leave_count}
- Absent days: {absent_count}
- Late arrivals: {late_count}
- Attendance records analyzed: {len(attendance)}

Provide a JSON response with:
{{
  "risk_score": <0-100>,
  "risk_level": "<low|medium|high|critical>",
  "key_factors": ["factor1", "factor2"],
  "recommendations": ["action1", "action2"],
  "summary": "brief explanation"
}}
"""

    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"attrition_{employee_id}_{datetime.now().strftime('%Y%m')}",
            system_message="You are an expert HR analytics AI. Analyze employee data and predict attrition risk. Always respond with valid JSON.",
        ).with_model(AI_PROVIDER, AI_MODEL)
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse JSON from response
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            result = json.loads(json_match.group()) if json_match else {"error": "Parse failed", "raw": response}
        
        # Update employee risk score in DB
        if "risk_score" in result:
            await db.users.update_one(
                {"employee_id": employee_id},
                {"$set": {"attrition_risk_score": result["risk_score"]}}
            )
        
        return {**result, "employee_id": employee_id, "employee_name": employee.get("name"), "analyzed_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ─── SENTIMENT ANALYSIS ───────────────────────────────────────────────────────

@router.post("/sentiment")
async def analyze_sentiment(req: SentimentRequest, request: Request):
    """Analyze sentiment of text from employee surveys or feedback."""
    user = await get_current_user(request)
    
    prompt = f"""Analyze the sentiment of this employee text. Context: {req.context}

Text: "{req.text}"

Respond with JSON:
{{
  "sentiment": "<positive|negative|neutral|mixed>",
  "score": <-1.0 to 1.0>,
  "confidence": <0.0 to 1.0>,
  "emotions": ["emotion1", "emotion2"],
  "key_themes": ["theme1", "theme2"],
  "summary": "brief interpretation",
  "action_needed": <true|false>,
  "recommended_action": "what HR should do if action_needed is true"
}}"""

    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"sentiment_{user.get('_id', user.get('id', 'unknown'))}_{uuid.uuid4()}",
            system_message="You are a sentiment analysis AI for HR. Analyze employee feedback and provide actionable insights. Respond with valid JSON only.",
        ).with_model(AI_PROVIDER, AI_MODEL)
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            result = json.loads(json_match.group()) if json_match else {"raw": response}
        
        return {**result, "analyzed_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ─── RESUME PARSER (BLIND HIRING) ─────────────────────────────────────────────

@router.post("/parse-resume")
async def parse_resume(req: ResumeParseRequest, request: Request):
    """Parse resume with AI. Blind hiring removes name/photo/gender to reduce bias."""
    user = await get_current_user(request)
    
    blind_instructions = ""
    if req.blind_hiring:
        blind_instructions = """
IMPORTANT - BLIND HIRING MODE: Remove all personally identifiable information:
- Remove or replace full name with "Candidate A"
- Remove photos, age, gender, marital status, nationality
- Remove addresses and location details
- Keep all skills, experience, education (anonymized institution names), and achievements
"""

    job_context = f"\n\nJob Description:\n{req.job_description}" if req.job_description else ""

    prompt = f"""Parse this resume and extract structured information.{blind_instructions}{job_context}

Resume:
{req.resume_text}

Respond with JSON:
{{
  "candidate_id": "CAND-{uuid.uuid4().hex[:8].upper()}",
  "blind_mode": {str(req.blind_hiring).lower()},
  "skills": ["skill1", "skill2"],
  "experience_years": <number>,
  "education": [{{"degree": "", "field": "", "year": ""}}],
  "work_history": [{{"title": "", "company": "<anonymized if blind>", "duration": "", "achievements": []}}],
  "strengths": ["strength1", "strength2"],
  "job_fit_score": <0-100 if job_description provided, else null>,
  "job_fit_reasons": ["reason1"],
  "red_flags": ["flag1"],
  "recommendation": "<strong_yes|yes|maybe|no>",
  "summary": "professional summary"
}}"""

    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"resume_{user.get('_id', user.get('id', 'unknown'))}_{uuid.uuid4()}",
            system_message="You are an expert ATS (Applicant Tracking System) AI. Parse resumes objectively and score candidates. Focus on skills and experience, not personal details. Respond with valid JSON only.",
        ).with_model(AI_PROVIDER, AI_MODEL)
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            result = json.loads(json_match.group()) if json_match else {"raw": response}
        
        return {**result, "parsed_at": datetime.now(timezone.utc).isoformat(), "parsed_by": user["email"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ─── AI CAREER PATH SUGGESTIONS ───────────────────────────────────────────────

@router.get("/career-path/{employee_id}")
async def suggest_career_path(employee_id: str, request: Request):
    """AI-powered career pathing based on current skills and role."""
    user = await get_current_user(request)
    
    employee = await db.users.find_one({"employee_id": employee_id}, {"_id": 0, "password_hash": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    prompt = f"""Suggest a personalized career development path for this employee.

Profile:
- Name: {employee.get('name')}
- Current Role: {employee.get('designation', 'N/A')}
- Department: {employee.get('department', 'N/A')}
- Years at Company: calculated from {employee.get('date_of_joining', 'N/A')}

Respond with JSON:
{{
  "current_role": "{employee.get('designation', 'N/A')}",
  "suggested_next_roles": ["role1", "role2"],
  "timeline": "6-12 months",
  "required_skills": ["skill1", "skill2"],
  "recommended_courses": [{{"name": "", "platform": "", "duration": "", "priority": "high|medium|low"}}],
  "certifications": ["cert1", "cert2"],
  "mentorship_suggestions": ["suggestion1"],
  "strengths_to_leverage": ["strength1"],
  "gaps_to_address": ["gap1"],
  "career_summary": "personalized 2-3 sentence career advice"
}}"""

    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"career_{employee_id}_{datetime.now().strftime('%Y%m')}",
            system_message="You are an AI career coach specializing in HR and technology roles. Provide actionable, specific career development advice. Respond with valid JSON only.",
        ).with_model(AI_PROVIDER, AI_MODEL)
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            result = json.loads(json_match.group()) if json_match else {"raw": response}
        
        return {**result, "employee_id": employee_id, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ─── INTERNAL endpoint for NestJS to call ─────────────────────────────────────

@router.get("/status")
async def ai_status():
    """Check AI service status."""
    return {
        "status": "running",
        "model": AI_MODEL,
        "provider": AI_PROVIDER,
        "key_configured": bool(LLM_KEY),
        "features": ["chat", "attrition-risk", "sentiment", "parse-resume", "career-path"],
    }
