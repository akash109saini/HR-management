import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Request, HTTPException, Header, Depends
from pydantic import BaseModel
from database import db

logger = logging.getLogger("realtime-biometric")
router = APIRouter(prefix="/api/realtime-biometric", tags=["realtime-biometric"])

# Fetch credentials token from environment (default to secure suggested credential)
BIOMETRIC_AUTH_TOKEN = os.environ.get("BIOMETRIC_AUTH_TOKEN", "realtime_t304f_auth_token_2026")

async def verify_token(x_biometric_token: Optional[str] = Header(None)):
    if not x_biometric_token or x_biometric_token != BIOMETRIC_AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing biometric auth token")

async def _resolve_employee(user_pin: str, tenant_id: Optional[str]) -> Optional[dict]:
    query: Dict[str, Any] = {
        "$or": [
            {"biometric_pin": user_pin},
            {"biometric_pin": str(user_pin)},
            {"employee_id": user_pin},
        ]
    }
    if tenant_id:
        query["tenant_id"] = tenant_id
    return await db.users.find_one(query, {"_id": 0, "password_hash": 0})

@router.post("/push", dependencies=[Depends(verify_token)])
async def receive_punches(payload: List[Dict[str, Any]]):
    """
    Receive real-time push logs from Realtime T304F+ device.
    Supports list of punch logs in standard JSON push format.
    """
    logger.info(f"Received realtime biometric push: {len(payload)} records")
    now_iso = datetime.now(timezone.utc).isoformat()
    inserted_count = 0

    for item in payload:
        # Flexible key extraction supporting multiple casing schemes
        device_sn = item.get("DeviceID") or item.get("device_id") or item.get("SN")
        user_pin = str(item.get("UserID") or item.get("user_id") or "")
        log_time = item.get("LogTime") or item.get("time") or item.get("timestamp")
        verify_mode = item.get("VerifyMode") or item.get("mode") or "unknown"
        status_raw = item.get("Status") or item.get("status") or "check_in"

        if not device_sn or not user_pin or not log_time:
            logger.warning(f"Skipping malformed record: {item}")
            continue

        # Look up device registration status
        device = await db.biometric_devices.find_one({"serial_number": device_sn})
        if not device:
            # Auto-register undiscovered device as pending
            device_id = str(uuid.uuid4())
            device = {
                "device_id": device_id,
                "serial_number": device_sn,
                "name": f"Realtime Device {device_sn}",
                "tenant_id": None,
                "status": "pending",
                "online": True,
                "first_seen": now_iso,
                "last_ping": now_iso,
            }
            await db.biometric_devices.insert_one(device)
            logger.info(f"Discovered new Realtime Biometrics device: SN={device_sn}")

        tenant_id = device.get("tenant_id")
        employee = await _resolve_employee(user_pin, tenant_id) if tenant_id else None

        # Standardize verification and status modes
        status = "check_out" if "out" in str(status_raw).lower() else "check_in"
        verify_clean = str(verify_mode).lower().strip()

        punch_doc = {
            "punch_id": str(uuid.uuid4()),
            "device_sn": device_sn,
            "device_name": device.get("name"),
            "tenant_id": tenant_id,
            "user_pin": user_pin,
            "employee_id": employee.get("employee_id") if employee else None,
            "employee_name": employee.get("name") if employee else None,
            "timestamp": log_time,
            "status": status,
            "verify_mode": verify_clean,
            "source": "realtime_push",
            "matched": bool(employee),
            "received_at": now_iso,
        }

        await db.biometric_punches.insert_one(punch_doc)
        inserted_count += 1

        # Synchronize into attendance logs if employee is matched
        if employee:
            date_str = log_time[:10]  # Expects YYYY-MM-DD
            base_attendance = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": employee["employee_id"],
                "user_name": employee.get("name"),
                "date": date_str,
            }
            field = "clock_in" if status == "check_in" else "clock_out"
            await db.attendance.update_one(
                {"user_id": employee["employee_id"], "date": date_str},
                {
                    "$setOnInsert": base_attendance,
                    "$set": {
                        field: log_time,
                        "source": "biometric",
                        "device_sn": device_sn
                    }
                },
                upsert=True
            )

    return {"status": "success", "processed_records": inserted_count}
