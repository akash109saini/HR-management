"""
WhatsApp Business Cloud API Integration
- Webhook verification (GET /api/whatsapp/webhook)
- Receive messages (POST /api/whatsapp/webhook)
- Send messages (POST /api/whatsapp/send)
- Broadcast notifications (POST /api/whatsapp/broadcast)
"""
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import httpx
import os
import logging
import uuid
import json

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

logger = logging.getLogger("uvicorn.access")

WA_TOKEN       = os.environ.get("WHATSAPP_TOKEN", "")
WA_PHONE_ID    = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WA_VERIFY_TKN  = os.environ.get("WHATSAPP_VERIFY_TOKEN", "hrms_whatsapp_verify_token_2026")
GRAPH_API      = "https://graph.facebook.com/v18.0"
IS_CONFIGURED  = bool(WA_TOKEN and WA_PHONE_ID)


# ─── Helper: Send WhatsApp message ────────────────────────────────────────────
async def send_wa_message(to: str, text: str) -> dict:
    """Send text message via Meta WhatsApp Cloud API."""
    if not IS_CONFIGURED:
        logger.warning(f"[WHATSAPP MOCK] To: {to}\n{text[:200]}")
        return {"status": "mock", "to": to}

    url = f"{GRAPH_API}/{WA_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WA_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to.replace("+", "").replace(" ", ""),
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"WhatsApp sent to {to}: {result}")
        return result


async def send_wa_template(to: str, template_name: str, components: List[dict] = None) -> dict:
    """Send template message."""
    if not IS_CONFIGURED:
        logger.warning(f"[WHATSAPP MOCK TEMPLATE] To: {to}, Template: {template_name}")
        return {"status": "mock"}

    url = f"{GRAPH_API}/{WA_PHONE_ID}/messages"
    headers = {"Authorization": f"Bearer {WA_TOKEN}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to.replace("+", "").replace(" ", ""),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en_US"},
            "components": components or [],
        },
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


# ─── Bot message router ───────────────────────────────────────────────────────
async def route_employee_message(text: str, employee: dict) -> str:
    text_l = text.lower().strip()

    if any(k in text_l for k in ["leave balance", "how many leave", "leaves left", "leaves remaining"]):
        return await get_leave_balance_msg(employee)

    if any(k in text_l for k in ["payslip", "salary slip", "pay slip", "last salary"]):
        return await get_payslip_msg(employee)

    if any(k in text_l for k in ["salary", "ctc", "pay", "compensation"]):
        return get_salary_msg(employee)

    if text_l.startswith("apply leave") or "apply for leave" in text_l:
        return (
            "📝 *Leave Application*\n\n"
            "To apply for leave, use the format:\n\n"
            "*LEAVE [type] [start] [end] [reason]*\n\n"
            "Example:\n"
            "*LEAVE sick 2026-06-01 2026-06-02 Not feeling well*\n\n"
            "Available types: annual, sick, casual"
        )

    if text_l.startswith("leave ") and len(text_l.split()) >= 4:
        return await process_leave_via_wa(text_l, employee)

    if any(k in text_l for k in ["my profile", "my info", "details", "my detail"]):
        return get_profile_msg(employee)

    if any(k in text_l for k in ["hi", "hello", "help", "menu", "start", "hey"]):
        return get_help_menu(employee.get("name", "there"))

    # AI fallback
    return (
        f"🤖 I didn't quite understand that, {employee.get('name', 'there')}.\n\n"
        "Type *HELP* to see what I can do, or visit the HR portal for more options.\n\n"
        "Quick shortcuts:\n"
        "• *LEAVE BALANCE* - Your leave status\n"
        "• *PAYSLIP* - Last salary slip\n"
        "• *APPLY LEAVE* - How to apply\n"
        "• *MY PROFILE* - Your details"
    )


async def get_leave_balance_msg(emp: dict) -> str:
    approved = await db.leaves.find({
        "employee_id": emp.get("employee_id"),
        "status": "approved"
    }).to_list(200)
    taken = {}
    for l in approved:
        t = l.get("leave_type", "other")
        taken[t] = taken.get(t, 0) + (l.get("days", 1))
    allowances = {"annual": 21, "sick": 10, "casual": 7}
    msg = f"📅 *Leave Balance — {emp.get('name')}*\n\n"
    for ltype, total in allowances.items():
        used = taken.get(ltype, 0)
        remaining = total - used
        icon = "✅" if remaining > 5 else ("⚠️" if remaining > 0 else "❌")
        msg += f"{icon} *{ltype.capitalize()}*: {remaining}/{total} days left\n"
    pending_count = await db.leaves.count_documents({"employee_id": emp.get("employee_id"), "status": "pending"})
    if pending_count:
        msg += f"\n🕐 {pending_count} pending request(s)\n"
    return msg


async def get_payslip_msg(emp: dict) -> str:
    payroll = await db.payrolls.find_one(
        {"employee_id": emp.get("employee_id")},
        sort=[("year", -1), ("month", -1)]
    )
    if not payroll:
        return "❌ No payslip found. Please contact HR at hr@company.com"
    return (
        f"💰 *Latest Payslip — {emp.get('name')}*\n\n"
        f"📅 Period: {payroll.get('month')}/{payroll.get('year')}\n"
        f"💵 Basic: ₹{payroll.get('basic_salary', 0):,.0f}\n"
        f"➕ Allowances: ₹{payroll.get('allowances', 0):,.0f}\n"
        f"➖ Deductions: ₹{payroll.get('deductions', 0):,.0f}\n"
        f"━━━━━━━━━━━━━━━\n"
        f"💚 *Net Pay: ₹{payroll.get('net_salary', 0):,.0f}*\n"
        f"📊 Status: {payroll.get('status', 'draft').upper()}\n\n"
        "For detailed payslip, login to the HR portal."
    )


def get_salary_msg(emp: dict) -> str:
    return (
        f"💳 *Salary Details — {emp.get('name')}*\n\n"
        f"👤 {emp.get('designation', 'N/A')}\n"
        f"🏢 {emp.get('department', 'N/A')}\n"
        f"💵 CTC: ₹{emp.get('salary', 0):,.0f}/year\n\n"
        "For detailed breakdown, type *PAYSLIP*"
    )


def get_profile_msg(emp: dict) -> str:
    return (
        f"👤 *Your Profile*\n\n"
        f"📛 Name: {emp.get('name')}\n"
        f"📧 Email: {emp.get('email')}\n"
        f"🏢 Dept: {emp.get('department', 'N/A')}\n"
        f"💼 Role: {emp.get('designation', 'N/A')}\n"
        f"📅 Joined: {emp.get('date_of_joining', 'N/A')}\n"
        f"🔑 ID: {emp.get('employee_id')}"
    )


def get_help_menu(name: str) -> str:
    return (
        f"👋 *Hello {name}!*\n\n"
        "I'm your 🤖 *HRMS Assistant*. Here's what I can help with:\n\n"
        "📅 *LEAVE BALANCE* — Check leaves\n"
        "📝 *APPLY LEAVE* — How to apply\n"
        "💰 *PAYSLIP* — Latest salary slip\n"
        "💳 *SALARY* — Salary details\n"
        "👤 *MY PROFILE* — Your info\n\n"
        "_Just type any keyword above!_"
    )


async def process_leave_via_wa(text: str, emp: dict) -> str:
    # Format: leave [type] [start] [end] [reason...]
    parts = text.replace("leave ", "", 1).split()
    if len(parts) < 3:
        return "❌ Format: *LEAVE [type] [start_date] [end_date] [reason]*"
    lt = parts[0]
    start = parts[1]
    end = parts[2] if len(parts) > 2 else parts[1]
    reason = " ".join(parts[3:]) if len(parts) > 3 else "Applied via WhatsApp"

    try:
        from datetime import date
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
        days = (e - s).days + 1
    except ValueError:
        return "❌ Invalid date format. Use YYYY-MM-DD (e.g., 2026-06-01)"

    leave_doc = {
        "leave_id": str(uuid.uuid4()),
        "employee_id": emp.get("employee_id"),
        "tenant_id": emp.get("tenant_id"),
        "employee_name": emp.get("name"),
        "leave_type": lt,
        "start_date": start,
        "end_date": end,
        "days": days,
        "reason": reason,
        "status": "pending",
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "whatsapp_request": True,
    }
    await db.leaves.insert_one(leave_doc)

    return (
        f"✅ *Leave Application Submitted!*\n\n"
        f"📋 Type: {lt.capitalize()}\n"
        f"📅 From: {start} → {end}\n"
        f"📆 Days: {days}\n"
        f"📝 Reason: {reason}\n\n"
        "Your manager has been notified. You'll receive a reply here once actioned. 🙏"
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/webhook", response_class=PlainTextResponse)
async def verify_webhook(
    request: Request,
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
):
    """Meta webhook verification handshake."""
    logger.info(f"WhatsApp webhook verify: mode={hub_mode}, token={hub_verify_token}")
    if hub_mode == "subscribe" and hub_verify_token == WA_VERIFY_TKN:
        logger.info("✅ WhatsApp Webhook VERIFIED!")
        return PlainTextResponse(content=hub_challenge or "", status_code=200)
    logger.warning(f"❌ WhatsApp webhook verification FAILED. Got token: {hub_verify_token}")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def receive_message(request: Request):
    """Receive incoming WhatsApp messages from Meta."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=200, content={"status": "ok"})

    logger.info(f"WhatsApp webhook received: {json.dumps(body)[:300]}")

    # Save raw webhook to DB for debugging
    await db.whatsapp_webhooks.insert_one({
        "received_at": datetime.now(timezone.utc).isoformat(),
        "body": body,
    })

    if body.get("object") != "whatsapp_business_account":
        return JSONResponse(status_code=200, content={"status": "ignored"})

    try:
        entry = (body.get("entry") or [{}])[0]
        change = (entry.get("changes") or [{}])[0]
        value = change.get("value", {})

        messages = value.get("messages", [])
        if not messages:
            return JSONResponse(status_code=200, content={"status": "no_message"})

        msg = messages[0]
        from_number = msg.get("from", "")
        msg_type = msg.get("type", "text")
        msg_id = msg.get("id", "")

        if msg_type == "text":
            text = msg.get("text", {}).get("body", "")
        elif msg_type == "interactive":
            text = msg.get("interactive", {}).get("button_reply", {}).get("title", "")
        else:
            text = f"[{msg_type}]"

        # Find employee by mobile/whatsapp number
        clean_number = from_number.lstrip("+")
        employee = await db.users.find_one({
            "$or": [
                {"mobile": from_number},
                {"mobile": clean_number},
                {"whatsapp_number": from_number},
                {"mobile": {"$regex": clean_number[-10:]}},
            ],
            "role": {"$in": ["employee", "hr_manager"]},
        })

        if not employee:
            try:
                await send_wa_message(
                    from_number,
                    "❌ Your number is not registered in our HR system.\n\nPlease contact your HR department to register your WhatsApp number."
                )
            except Exception as send_exc:
                logger.warning(f"WhatsApp notify-unknown failed for {from_number}: {send_exc}")
            return JSONResponse(status_code=200, content={"status": "unknown_user"})

        # Save message to DB
        await db.whatsapp_messages.insert_one({
            "message_id": msg_id,
            "from": from_number,
            "employee_id": employee.get("employee_id"),
            "tenant_id": employee.get("tenant_id"),
            "text": text,
            "type": msg_type,
            "direction": "inbound",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # Route the message → get the bot reply
        response_text = await route_employee_message(text, employee)

        # Try to send (best-effort — Meta may reject non-opted-in numbers)
        send_status = "sent"
        send_error = None
        try:
            await send_wa_message(from_number, response_text)
        except Exception as send_exc:
            send_status = "send_failed"
            send_error = str(send_exc)[:300]
            logger.warning(f"WhatsApp outbound send failed: {send_error}")

        # Always save outbound message for conversation history
        await db.whatsapp_messages.insert_one({
            "message_id": str(uuid.uuid4()),
            "to": from_number,
            "employee_id": employee.get("employee_id"),
            "tenant_id": employee.get("tenant_id"),
            "text": response_text,
            "type": "text",
            "direction": "outbound",
            "send_status": send_status,
            "send_error": send_error,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return JSONResponse(status_code=200, content={"status": "replied", "send_status": send_status})

    except Exception as e:
        logger.exception(f"WhatsApp webhook processing error: {e}")
        return JSONResponse(status_code=200, content={"status": "error", "detail": str(e)[:200]})


class SendMessageRequest(BaseModel):
    to: str
    message: str


class BroadcastRequest(BaseModel):
    message: str
    employee_ids: Optional[List[str]] = None  # None = all employees in tenant


@router.post("/send")
async def send_message(body: SendMessageRequest, request: Request):
    """Manually send a WhatsApp message to a specific number (HR / Admin use)."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    send_status = "sent"
    send_error = None
    result = None
    try:
        result = await send_wa_message(body.to, body.message)
    except httpx.HTTPStatusError as e:
        send_status = "send_failed"
        try:
            send_error = e.response.json()
        except Exception:
            send_error = e.response.text[:300]
        logger.warning(f"WhatsApp send failed: {send_error}")
    except Exception as e:
        send_status = "send_failed"
        send_error = str(e)[:300]
        logger.warning(f"WhatsApp send unexpected error: {send_error}")

    await db.whatsapp_messages.insert_one({
        "message_id": str(uuid.uuid4()),
        "to": body.to,
        "sent_by": user["email"],
        "tenant_id": user.get("tenant_id"),
        "text": body.message,
        "type": "text",
        "direction": "outbound_manual",
        "send_status": send_status,
        "send_error": send_error if isinstance(send_error, str) else json.dumps(send_error)[:500] if send_error else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": send_status, "result": result, "error": send_error}


@router.post("/broadcast")
async def broadcast_notification(body: BroadcastRequest, request: Request):
    """Send a notification to all or specific employees in the tenant."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {"tenant_id": user.get("tenant_id"), "role": "employee", "status": "active"}
    if body.employee_ids:
        query["employee_id"] = {"$in": body.employee_ids}

    employees = await db.users.find(query).to_list(500)
    sent_count = 0
    failed_count = 0

    for emp in employees:
        phone = emp.get("whatsapp_number") or emp.get("mobile")
        if not phone:
            continue
        try:
            await send_wa_message(phone, body.message)
            sent_count += 1
        except Exception as e:
            logger.warning(f"Failed to send to {emp.get('employee_id')}: {e}")
            failed_count += 1

    return {
        "message": f"Broadcast complete: {sent_count} sent, {failed_count} failed",
        "sent": sent_count,
        "failed": failed_count,
    }


@router.get("/messages")
async def get_messages(request: Request, limit: int = 50):
    """Get recent WhatsApp conversation history (HR view)."""
    user = await get_current_user(request)
    query = {}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "employee":
        query["employee_id"] = user.get("employee_id")

    msgs = await db.whatsapp_messages.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return msgs


@router.get("/status")
async def get_status():
    """WhatsApp integration status."""
    return {
        "configured": IS_CONFIGURED,
        "phone_number_id": WA_PHONE_ID if IS_CONFIGURED else None,
        "webhook_url": "https://multi-org-hr.preview.emergentagent.com/api/whatsapp/webhook",
        "verify_token": WA_VERIFY_TKN,
        "test_send_url": "POST /api/whatsapp/send",
        "setup_guide": {
            "step1": "Go to developers.facebook.com → Your App → WhatsApp → Configuration",
            "step2": f"Set Callback URL: https://multi-org-hr.preview.emergentagent.com/api/whatsapp/webhook",
            "step3": f"Set Verify Token: {WA_VERIFY_TKN}",
            "step4": "Subscribe to: messages, message_status_updates",
            "step5": "Click Verify & Save",
        },
    }
