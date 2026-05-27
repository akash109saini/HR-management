"""
eSSL / ZKTeco Biometric Integration — ADMS Push Protocol
====================================================
- /api/iclock/cdata       (GET handshake, POST ATTLOG/OPERLOG/USER push)
- /api/iclock/getrequest  (device polls for pending commands)
- /api/iclock/devicecmd   (device acknowledges command result)
- /api/biometric/devices  (CRUD device registry — HR/Admin)
- /api/biometric/punches  (list punch logs)
- /api/biometric/simulate (push a synthetic punch — for testing)
- /api/biometric/queue-command (HR enqueues device command)

Device config on eSSL MB160:
  Menu → Comm. Setting → Cloud Server / ADMS
  Server: <REACT_APP_BACKEND_URL host>     Port: 443
  Server Path: /api/iclock                 Enable Domain Name: ON
  Encrypt: OFF                             HTTPS: ON
  Device ID (SN) shown on device.
"""
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from database import db
from auth_utils import get_current_user
import uuid
import logging
import re

logger = logging.getLogger("biometric")

# Two routers: one for device-facing /iclock paths (no /api prefix in device config but
# we still use /api on our side; eSSL devices send the full path the operator types),
# the other for HR-facing /api/biometric paths.
iclock_router = APIRouter(prefix="/api/iclock", tags=["biometric-iclock"])
admin_router  = APIRouter(prefix="/api/biometric", tags=["biometric-admin"])


# ─── Helpers ──────────────────────────────────────────────────────────────────
async def _find_device(sn: str) -> Optional[dict]:
    return await db.biometric_devices.find_one({"serial_number": sn})


async def _resolve_employee(user_pin: str, tenant_id: Optional[str]) -> Optional[dict]:
    """Map device user PIN → HRMS user. We try multiple fields."""
    normalized_pin = user_pin.lstrip("0") if user_pin.isdigit() else user_pin
    if not normalized_pin:
        normalized_pin = "0"

    or_conditions = [
        {"biometric_pin": user_pin},
        {"biometric_pin": str(user_pin)},
        {"employee_id": user_pin},
    ]

    if normalized_pin != user_pin:
        or_conditions.extend([
            {"biometric_pin": normalized_pin},
            {"biometric_pin": str(normalized_pin)},
            {"employee_id": normalized_pin},
        ])

    query: Dict[str, Any] = {"$or": or_conditions}
    if tenant_id:
        query["tenant_id"] = tenant_id
    return await db.users.find_one(query, {"_id": 0, "password_hash": 0})


def _parse_attlog_line(line: str) -> Optional[dict]:
    """Parse a single ATTLOG row: PIN<TAB>TIMESTAMP<TAB>STATUS<TAB>VERIFY<TAB>WORKCODE<TAB>RESERVED"""
    if not line.strip():
        return None
    parts = re.split(r"[\t,]+", line.strip())
    if len(parts) < 2:
        return None
    try:
        return {
            "pin": parts[0].strip(),
            "timestamp": parts[1].strip(),
            "status": int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0,
            "verify_mode": int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 1,
            "workcode": parts[4].strip() if len(parts) > 4 else "",
        }
    except Exception:
        return None


STATUS_LABELS = {0: "check_in", 1: "check_out", 2: "break_out", 3: "break_in", 4: "overtime_in", 5: "overtime_out"}
VERIFY_LABELS = {0: "password", 1: "fingerprint", 2: "card", 15: "face", 4: "fingerprint"}


# ─── Device-facing endpoints (eSSL Push protocol) ─────────────────────────────

@iclock_router.get("/cdata", response_class=PlainTextResponse)
async def iclock_handshake(
    request: Request,
    SN: Optional[str] = Query(None),
    options: Optional[str] = Query(None),
    pushver: Optional[str] = Query(None),
    PushOptionsFlag: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
):
    """
    Device handshake. eSSL device pings this URL on boot:
      GET /iclock/cdata?SN=ABC123&options=all&pushver=2.4.2&PushOptionsFlag=1
    Response must be a plain-text config block starting with 'GET OPTION FROM:' …
    """
    if not SN:
        raise HTTPException(status_code=400, detail="SN required")

    device = await _find_device(SN)
    now = datetime.now(timezone.utc).isoformat()
    if device:
        await db.biometric_devices.update_one(
            {"serial_number": SN},
            {"$set": {"last_ping": now, "online": True, "firmware_pushver": pushver}},
        )
    else:
        # Auto-register an unknown device as 'pending' so HR can claim it
        await db.biometric_devices.insert_one({
            "device_id": str(uuid.uuid4()),
            "serial_number": SN,
            "name": f"Device {SN}",
            "tenant_id": None,
            "status": "pending",
            "online": True,
            "first_seen": now,
            "last_ping": now,
            "firmware_pushver": pushver,
        })
        logger.info(f"New biometric device discovered: SN={SN}")

    # Config block — tells device to push attendance every 15s and accept server commands
    response = (
        f"GET OPTION FROM: {SN}\n"
        f"ATTLOGStamp=9999\n"
        f"OPERLOGStamp=9999\n"
        f"ATTPHOTOStamp=None\n"
        f"ErrorDelay=30\n"
        f"Delay=15\n"
        f"TransTimes=00:00;14:05\n"
        f"TransInterval=1\n"
        f"TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP UserPic\n"
        f"TimeZone=8\n"
        f"Realtime=1\n"
        f"Encrypt=None\n"
    )
    return PlainTextResponse(response, status_code=200)


@iclock_router.post("/cdata", response_class=PlainTextResponse)
async def iclock_push(
    request: Request,
    SN: Optional[str] = Query(None),
    table: Optional[str] = Query(None),
    Stamp: Optional[str] = Query(None),
):
    """
    Device pushes ATTLOG (punches), OPERLOG (operations), USER, FINGER data.
    Body is plain-text, lines separated by \\n, fields by tab/comma.
    """
    body = (await request.body()).decode("utf-8", errors="ignore")
    logger.info(f"iclock cdata POST SN={SN} table={table} bytes={len(body)}")

    device = await _find_device(SN) if SN else None
    if not device:
        return PlainTextResponse("OK", status_code=200)

    tenant_id = device.get("tenant_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Store raw push for debugging
    await db.biometric_raw_pushes.insert_one({
        "sn": SN, "table": table, "stamp": Stamp,
        "body": body[:4000], "received_at": now_iso,
    })

    inserted = 0
    if table and table.upper() in ("ATTLOG", ""):
        for line in body.splitlines():
            row = _parse_attlog_line(line)
            if not row:
                continue
            employee = await _resolve_employee(row["pin"], tenant_id) if tenant_id else None
            punch = {
                "punch_id": str(uuid.uuid4()),
                "device_sn": SN,
                "device_name": device.get("name"),
                "tenant_id": tenant_id,
                "user_pin": row["pin"],
                "employee_id": (employee or {}).get("employee_id"),
                "employee_name": (employee or {}).get("name"),
                "timestamp": row["timestamp"],
                "status_code": row["status"],
                "status": STATUS_LABELS.get(row["status"], f"code_{row['status']}"),
                "verify_mode_code": row["verify_mode"],
                "verify_mode": VERIFY_LABELS.get(row["verify_mode"], f"mode_{row['verify_mode']}"),
                "workcode": row.get("workcode", ""),
                "source": "device_push",
                "matched": bool(employee),
                "received_at": now_iso,
            }
            await db.biometric_punches.insert_one(punch)
            inserted += 1

            # Sync to attendance collection — single document per (user, date)
            # Use existing schema: user_id, user_name, clock_in, clock_out
            if employee and row["status"] in (0, 1):
                date_str = row["timestamp"][:10]
                base_on_insert = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "user_id": employee["employee_id"],
                    "user_name": employee.get("name"),
                    "date": date_str,
                }
                field = "clock_in" if row["status"] == 0 else "clock_out"
                await db.attendance.update_one(
                    {"user_id": employee["employee_id"], "date": date_str},
                    {"$setOnInsert": base_on_insert,
                     "$set": {field: row["timestamp"], "source": "biometric", "device_sn": SN}},
                    upsert=True,
                )

    # eSSL expects "OK: N" (count) as ack
    return PlainTextResponse(f"OK: {inserted}", status_code=200)


@iclock_router.get("/getrequest", response_class=PlainTextResponse)
async def iclock_getrequest(SN: Optional[str] = Query(None)):
    """Device polls server for next pending command."""
    if not SN:
        return PlainTextResponse("OK", status_code=200)
    device = await _find_device(SN)
    if device:
        await db.biometric_devices.update_one(
            {"serial_number": SN}, {"$set": {"last_ping": datetime.now(timezone.utc).isoformat(), "online": True}}
        )
    cmd = await db.biometric_commands.find_one_and_update(
        {"device_sn": SN, "status": "pending"},
        {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not cmd:
        return PlainTextResponse("OK", status_code=200)
    return PlainTextResponse(f"C:{cmd.get('command_id', '0')}:{cmd['payload']}", status_code=200)


@iclock_router.post("/devicecmd", response_class=PlainTextResponse)
async def iclock_devicecmd(request: Request, SN: Optional[str] = Query(None)):
    """Device acknowledges command result."""
    body = (await request.body()).decode("utf-8", errors="ignore")
    logger.info(f"devicecmd ack from {SN}: {body[:200]}")
    return PlainTextResponse("OK", status_code=200)


# ─── HR / Admin endpoints ─────────────────────────────────────────────────────

class DeviceCreate(BaseModel):
    serial_number: str
    name: str
    location: Optional[str] = ""

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    tenant_id: Optional[str] = None
    status: Optional[str] = None  # pending | active | disabled

class SimulatePunch(BaseModel):
    device_sn: Optional[str] = None
    user_pin: str
    status: int = 0  # 0=in,1=out
    verify_mode: int = 1  # 1=fp,2=card,15=face
    timestamp: Optional[str] = None

class QueueCommand(BaseModel):
    device_sn: str
    command: str  # e.g. "CLEAR LOG" | "INFO" | "DATA DELETE USERINFO PIN=123"


@admin_router.get("/devices")
async def list_devices(request: Request):
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        docs = await db.biometric_devices.find({}, {"_id": 0}).to_list(200)
    else:
        if user["role"] != "hr_manager":
            raise HTTPException(status_code=403, detail="Not authorized")
        # HR sees their tenant's devices + unclaimed pending devices (to allow claiming)
        docs = await db.biometric_devices.find(
            {"$or": [
                {"tenant_id": user.get("tenant_id")},
                {"tenant_id": None, "status": "pending"},
            ]},
            {"_id": 0},
        ).to_list(200)
    # Mark online if last ping within 90s
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
    for d in docs:
        d["online"] = bool(d.get("last_ping") and d["last_ping"] >= cutoff)
    return docs


@admin_router.post("/devices")
async def create_device(body: DeviceCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    existing = await _find_device(body.serial_number)
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        await db.biometric_devices.update_one(
            {"serial_number": body.serial_number},
            {"$set": {
                "name": body.name, "location": body.location,
                "tenant_id": user.get("tenant_id") or existing.get("tenant_id"),
                "status": "active",
                "claimed_at": now_iso,
            }},
        )
        return await db.biometric_devices.find_one({"serial_number": body.serial_number}, {"_id": 0})
    doc = {
        "device_id": str(uuid.uuid4()),
        "serial_number": body.serial_number,
        "name": body.name,
        "location": body.location,
        "tenant_id": user.get("tenant_id"),
        "status": "active",
        "online": False,
        "first_seen": now_iso,
        "last_ping": None,
        "claimed_at": now_iso,
    }
    await db.biometric_devices.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@admin_router.patch("/devices/{device_id}")
async def update_device(device_id: str, body: DeviceUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    res = await db.biometric_devices.update_one({"device_id": device_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return await db.biometric_devices.find_one({"device_id": device_id}, {"_id": 0})


@admin_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    r = await db.biometric_devices.delete_one({"device_id": device_id})
    return {"deleted": r.deleted_count}


@admin_router.get("/punches")
async def list_punches(request: Request, limit: int = 100, device_sn: Optional[str] = None):
    user = await get_current_user(request)
    query: Dict[str, Any] = {}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "employee":
        query["employee_id"] = user.get("employee_id")
    if device_sn:
        query["device_sn"] = device_sn
    docs = await db.biometric_punches.find(query, {"_id": 0}).sort("received_at", -1).limit(limit).to_list(limit)
    return docs


@admin_router.post("/simulate")
async def simulate_punch(body: SimulatePunch, request: Request):
    """Push a synthetic punch — useful before the physical device is wired."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Pick or create a virtual device
    sn = body.device_sn or "SIMULATOR-001"
    device = await _find_device(sn)
    now_iso = datetime.now(timezone.utc).isoformat()
    if not device:
        device = {
            "device_id": str(uuid.uuid4()),
            "serial_number": sn,
            "name": "Simulator Device",
            "location": "Virtual",
            "tenant_id": user.get("tenant_id"),
            "status": "active",
            "online": True,
            "first_seen": now_iso,
            "last_ping": now_iso,
            "is_simulator": True,
        }
        await db.biometric_devices.insert_one(device)

    timestamp = body.timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    employee = await _resolve_employee(body.user_pin, user.get("tenant_id"))
    punch = {
        "punch_id": str(uuid.uuid4()),
        "device_sn": sn,
        "device_name": device.get("name"),
        "tenant_id": user.get("tenant_id"),
        "user_pin": body.user_pin,
        "employee_id": (employee or {}).get("employee_id"),
        "employee_name": (employee or {}).get("name"),
        "timestamp": timestamp,
        "status_code": body.status,
        "status": STATUS_LABELS.get(body.status, "check_in"),
        "verify_mode_code": body.verify_mode,
        "verify_mode": VERIFY_LABELS.get(body.verify_mode, "fingerprint"),
        "source": "simulator",
        "matched": bool(employee),
        "received_at": now_iso,
    }
    await db.biometric_punches.insert_one(punch)

    # Mirror into attendance using existing schema (user_id/clock_in/clock_out)
    if employee and body.status in (0, 1):
        date_str = timestamp[:10]
        base_on_insert = {
            "id": str(uuid.uuid4()),
            "tenant_id": user.get("tenant_id"),
            "user_id": employee["employee_id"],
            "user_name": employee.get("name"),
            "date": date_str,
        }
        field = "clock_in" if body.status == 0 else "clock_out"
        await db.attendance.update_one(
            {"user_id": employee["employee_id"], "date": date_str},
            {"$setOnInsert": base_on_insert,
             "$set": {field: timestamp, "source": "biometric_sim", "device_sn": sn}},
            upsert=True,
        )

    return {"message": "Punch simulated", "punch": {k: v for k, v in punch.items() if k != "_id"}}


@admin_router.post("/queue-command")
async def queue_command(body: QueueCommand, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    cmd = {
        "command_id": str(uuid.uuid4()),
        "device_sn": body.device_sn,
        "payload": body.command,
        "status": "pending",
        "queued_by": user["email"],
        "queued_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.biometric_commands.insert_one(cmd)
    return {k: v for k, v in cmd.items() if k != "_id"}


@admin_router.get("/setup-guide")
async def setup_guide(request: Request):
    """Returns the exact eSSL MB160 menu config the operator should enter."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    import os
    backend_url = os.environ.get("FRONTEND_URL", "").replace("3000", "")  # best-effort
    # Use the public backend URL hint from request
    host = request.headers.get("host", "your-backend-host")
    scheme = request.url.scheme
    return {
        "model": "eSSL MB160 (and other ADMS-capable eSSL/ZKTeco devices)",
        "menu_path": "Menu → Comm. → Cloud Server / ADMS",
        "config": {
            "Server Address (Domain)": host,
            "Server Port": "443" if scheme == "https" else "80",
            "Enable Proxy / HTTPS": "ON" if scheme == "https" else "OFF",
            "Server Path": "/api/iclock",
            "Heartbeat (sec)": "15",
            "Realtime Push": "ON",
            "Device ID / Comm Key": "(leave default)",
        },
        "webhook_endpoints": {
            "handshake": f"{scheme}://{host}/api/iclock/cdata",
            "push_attendance": f"{scheme}://{host}/api/iclock/cdata?table=ATTLOG",
            "get_commands": f"{scheme}://{host}/api/iclock/getrequest",
            "ack_commands": f"{scheme}://{host}/api/iclock/devicecmd",
        },
        "next_steps": [
            "1. Connect the eSSL MB160 to the internet (Ethernet or WiFi).",
            "2. On the device: Menu → Comm. Setting → Cloud Server Setting (or ADMS)",
            "3. Enter the Server Address and Path shown above.",
            "4. Save & reboot the device. It will appear under Biometric Devices as 'pending'.",
            "5. Open Biometric Devices page → claim the device (set Name + Location → Activate).",
            "6. Map each device PIN to an employee (Employee profile → Biometric PIN).",
            "7. Test by punching on the device — it should appear under 'Live Punches' within ~15s.",
        ],
    }


@admin_router.get("/status")
async def biometric_status(request: Request):
    user = await get_current_user(request)
    query: Dict[str, Any] = {}
    if user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    devices_total = await db.biometric_devices.count_documents(query)
    punches_today = await db.biometric_punches.count_documents({
        **query,
        "received_at": {"$gte": datetime.now(timezone.utc).strftime("%Y-%m-%d")},
    })
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
    online = await db.biometric_devices.count_documents({**query, "last_ping": {"$gte": cutoff}})
    return {
        "devices_total": devices_total,
        "devices_online": online,
        "punches_today": punches_today,
    }
