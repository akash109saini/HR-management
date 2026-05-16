"""
Demo Data Seeder — populates rich sample data across all HR modules for showcasing.
Super-admin only.
"""
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone, timedelta
from database import db
from auth_utils import get_current_user
import uuid
import random

router = APIRouter(prefix="/api/demo", tags=["demo-seeder"])


SAMPLE_FEEDBACKS = [
    {"text": "Loving the new flexible work-from-home policy! Big productivity boost.", "category": "work_environment", "rating": 5, "sentiment": "positive", "score": 0.85, "emotions": ["happy", "grateful"], "key_themes": ["flexibility", "wfh", "productivity"], "summary": "Strong appreciation for remote-work policy.", "action_needed": False},
    {"text": "Communication from leadership has been spotty this quarter. We need clearer roadmaps.", "category": "management", "rating": 2, "sentiment": "negative", "score": -0.55, "emotions": ["frustrated", "concerned"], "key_themes": ["communication", "leadership", "roadmap"], "summary": "Frustration over inconsistent leadership communication.", "action_needed": True, "recommended_action": "Schedule monthly all-hands with clear quarterly roadmap."},
    {"text": "The free lunch program is great but I wish there were more healthy options.", "category": "work_environment", "rating": 4, "sentiment": "mixed", "score": 0.2, "emotions": ["satisfied", "wanting"], "key_themes": ["food", "wellness"], "summary": "Positive overall, requests healthier food choices.", "action_needed": False},
    {"text": "I feel my career growth has plateaued. No clear path to promotion.", "category": "growth", "rating": 2, "sentiment": "negative", "score": -0.65, "emotions": ["stagnant", "disappointed"], "key_themes": ["career growth", "promotion", "development"], "summary": "Employee feels stuck in current role.", "action_needed": True, "recommended_action": "Set up career-pathing conversation with manager + HR business partner."},
    {"text": "My team manager is amazing — supportive, clear, and pushes us to grow.", "category": "management", "rating": 5, "sentiment": "positive", "score": 0.9, "emotions": ["appreciative", "motivated"], "key_themes": ["manager", "support", "growth"], "summary": "High satisfaction with direct manager.", "action_needed": False},
    {"text": "Salary review this year was disappointing given inflation. Hard to stay motivated.", "category": "compensation", "rating": 2, "sentiment": "negative", "score": -0.7, "emotions": ["disappointed", "demotivated"], "key_themes": ["salary", "inflation", "motivation"], "summary": "Concern about compensation not keeping up with inflation.", "action_needed": True, "recommended_action": "Review compensation bands against market benchmarks."},
    {"text": "New onboarding process is much smoother. Felt welcome from day one.", "category": "general", "rating": 5, "sentiment": "positive", "score": 0.88, "emotions": ["welcomed", "valued"], "key_themes": ["onboarding", "welcome", "first impression"], "summary": "Strong positive experience with onboarding.", "action_needed": False},
    {"text": "Workload has been crazy with 3 back-to-back releases. Risk of burnout.", "category": "work_environment", "rating": 2, "sentiment": "negative", "score": -0.6, "emotions": ["overwhelmed", "exhausted"], "key_themes": ["workload", "burnout", "release cycle"], "summary": "High stress from intense release schedule.", "action_needed": True, "recommended_action": "Audit release calendar; consider staggering or adding resources."},
    {"text": "Office is fine, work is okay. Nothing special either way.", "category": "general", "rating": 3, "sentiment": "neutral", "score": 0.05, "emotions": ["indifferent"], "key_themes": ["routine"], "summary": "Neutral sentiment, no strong opinions.", "action_needed": False},
    {"text": "The new health insurance coverage is significantly better. Thank you!", "category": "compensation", "rating": 5, "sentiment": "positive", "score": 0.8, "emotions": ["grateful", "secure"], "key_themes": ["benefits", "health insurance"], "summary": "Strong appreciation for improved benefits.", "action_needed": False},
    {"text": "Mentorship program has been transformative for my growth.", "category": "growth", "rating": 5, "sentiment": "positive", "score": 0.85, "emotions": ["grateful", "growing"], "key_themes": ["mentorship", "growth", "development"], "summary": "Mentorship driving career growth.", "action_needed": False},
    {"text": "Cross-team collaboration is broken. Each team operates in silos.", "category": "work_environment", "rating": 2, "sentiment": "negative", "score": -0.5, "emotions": ["frustrated"], "key_themes": ["collaboration", "silos", "teamwork"], "summary": "Silos hampering cross-team work.", "action_needed": True, "recommended_action": "Introduce cross-functional rituals (e.g., demo days, town halls)."},
]


@router.post("/seed")
async def seed_demo_data(request: Request):
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    # Pick a tenant — default to first non-system tenant
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(50)
    if not tenants:
        raise HTTPException(status_code=400, detail="No tenants found; create a tenant first.")
    tenant = tenants[0]
    tenant_id = tenant.get("tenant_id") or tenant.get("id")

    employees = await db.users.find(
        {"tenant_id": tenant_id, "role": "employee"}, {"_id": 0, "password_hash": 0}
    ).to_list(50)
    if not employees:
        raise HTTPException(status_code=400, detail="No employees in tenant; cannot seed feedback/attendance.")

    summary: dict = {"tenant_id": tenant_id, "tenant_name": tenant.get("name")}

    # 1. Feedbacks (sentiment data)
    now = datetime.now(timezone.utc)
    fb_inserted = 0
    for i, f in enumerate(SAMPLE_FEEDBACKS):
        days_ago = i * 2
        emp = random.choice(employees)
        anonymous = random.random() < 0.6
        doc = {
            "feedback_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "employee_id": None if anonymous else emp.get("employee_id"),
            "employee_name": None if anonymous else emp.get("name"),
            "anonymous": anonymous,
            "category": f["category"],
            "text": f["text"],
            "rating": f.get("rating"),
            "sentiment": f["sentiment"],
            "score": f["score"],
            "confidence": 0.85,
            "emotions": f.get("emotions", []),
            "key_themes": f.get("key_themes", []),
            "summary": f.get("summary", ""),
            "action_needed": f.get("action_needed", False),
            "recommended_action": f.get("recommended_action", ""),
            "created_at": (now - timedelta(days=days_ago, hours=random.randint(1, 23))).isoformat(),
            "demo": True,
        }
        await db.feedbacks.insert_one(doc)
        fb_inserted += 1
    summary["feedbacks_inserted"] = fb_inserted

    # 2. Blockchain credentials (3 per employee)
    from routes.blockchain_routes import compute_credential_hash, sign_hash, issuer_checksum, IS_CONFIGURED
    cred_inserted = 0
    if IS_CONFIGURED:
        cred_templates = [
            {"credential_type": "degree", "title": "B.Tech in Computer Science", "issuer_name": "IIT Bombay", "issue_date": "2019-06-15"},
            {"credential_type": "certification", "title": "AWS Solutions Architect Professional", "issuer_name": "Amazon Web Services", "issue_date": "2023-08-20"},
            {"credential_type": "employment_letter", "title": "Employment Confirmation Letter", "issuer_name": tenant.get("name", "Company"), "issue_date": "2024-01-15"},
        ]
        for emp in employees[:5]:
            for tmpl in cred_templates:
                cred_uid = str(uuid.uuid4())
                payload = {
                    "credential_uid": cred_uid,
                    "employee_id": emp.get("employee_id"),
                    "employee_name": emp.get("name", ""),
                    **tmpl,
                    "credential_id": f"DEMO-{cred_uid[:8].upper()}",
                    "description": "",
                    "issued_at": now.isoformat(),
                    "issued_by": user["email"],
                    "tenant_id": tenant_id,
                    "extra": {},
                }
                hash_hex = compute_credential_hash(payload)
                signature_hex = sign_hash(hash_hex)
                await db.credentials.insert_one({
                    "credential_uid": cred_uid,
                    "employee_id": emp.get("employee_id"),
                    "tenant_id": tenant_id,
                    "credential_type": tmpl["credential_type"],
                    "title": tmpl["title"],
                    "payload": payload,
                    "hash": hash_hex,
                    "signature": signature_hex,
                    "issuer_address": issuer_checksum(),
                    "issued_by": user["email"],
                    "onchain_tx_hash": None,
                    "onchain_anchored": False,
                    "revoked": False,
                    "created_at": now.isoformat(),
                    "demo": True,
                })
                cred_inserted += 1
    summary["credentials_inserted"] = cred_inserted

    # 3. WhatsApp conversation history
    wa_msgs = [
        ("inbound", "Hi"), ("outbound", "👋 Hello! I'm your HRMS Assistant."),
        ("inbound", "leave balance"), ("outbound", "📅 Leave Balance — Annual: 14/21, Sick: 7/10, Casual: 5/7"),
        ("inbound", "payslip"), ("outbound", "💰 Latest Payslip — Net Pay: ₹75,000"),
        ("inbound", "my profile"), ("outbound", "👤 Your Profile — Dept: Engineering"),
    ]
    wa_inserted = 0
    for emp in employees[:3]:
        if not emp.get("mobile"):
            continue
        for j, (direction, text) in enumerate(wa_msgs):
            await db.whatsapp_messages.insert_one({
                "message_id": str(uuid.uuid4()),
                ("from" if direction == "inbound" else "to"): emp["mobile"],
                "employee_id": emp.get("employee_id"),
                "tenant_id": tenant_id,
                "text": text,
                "type": "text",
                "direction": direction,
                "send_status": "sent" if direction == "outbound" else None,
                "created_at": (now - timedelta(hours=24 - j)).isoformat(),
                "demo": True,
            })
            wa_inserted += 1
    summary["whatsapp_messages_inserted"] = wa_inserted

    # 4. Announcements (3 sample)
    anns = [
        {"title": "🎉 Q2 All-Hands This Friday", "body": "Join us this Friday at 3 PM for the Q2 town hall. Agenda: roadmap, kudos, Q&A.", "priority": "high"},
        {"title": "🏖️ Summer Office Closure", "body": "Office closed July 4-7 for the summer break. Plan your leaves accordingly.", "priority": "medium"},
        {"title": "💪 New Wellness Program Launched", "body": "Monthly gym reimbursement up to ₹2,000 + free mental health counselling sessions.", "priority": "low"},
    ]
    ann_inserted = 0
    for a in anns:
        await db.announcements.insert_one({
            "announcement_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            **a,
            "created_by": user["email"],
            "created_at": now.isoformat(),
            "demo": True,
        })
        ann_inserted += 1
    summary["announcements_inserted"] = ann_inserted

    return {"message": "Demo data seeded successfully", **summary}


@router.delete("/seed")
async def remove_demo_data(request: Request):
    """Remove all docs marked with demo=true."""
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    r1 = await db.feedbacks.delete_many({"demo": True})
    r2 = await db.credentials.delete_many({"demo": True})
    r3 = await db.whatsapp_messages.delete_many({"demo": True})
    r4 = await db.announcements.delete_many({"demo": True})
    return {
        "message": "Demo data removed",
        "feedbacks_removed": r1.deleted_count,
        "credentials_removed": r2.deleted_count,
        "whatsapp_removed": r3.deleted_count,
        "announcements_removed": r4.deleted_count,
    }


@router.get("/status")
async def demo_status(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="HR / Admin only")
    return {
        "feedbacks_demo": await db.feedbacks.count_documents({"demo": True}),
        "credentials_demo": await db.credentials.count_documents({"demo": True}),
        "whatsapp_demo": await db.whatsapp_messages.count_documents({"demo": True}),
        "announcements_demo": await db.announcements.count_documents({"demo": True}),
    }
