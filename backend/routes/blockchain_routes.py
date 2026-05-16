"""
Blockchain Credentials Module
- Issue: SHA-256 hash + EIP-191 sign with company wallet (no gas required)
- Verify: Recover signer & compare to issuer address
- Optional Anchor: Send 0-value Sepolia tx with hash in calldata (requires test ETH)
- Sepolia Balance check, Etherscan link helpers
"""
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import hashlib
import json
import os
import uuid
import logging

from web3 import Web3
from eth_account.messages import encode_defunct

from database import db
from auth_utils import get_current_user

logger = logging.getLogger("blockchain")
router = APIRouter(prefix="/api/blockchain", tags=["blockchain"])

# ─── Configuration ────────────────────────────────────────────────────────────
ALCHEMY_URL    = os.environ.get("ALCHEMY_URL", "")
ETH_ADDR       = os.environ.get("ETH_WALLET_ADDRESS", "")
ETH_PK         = os.environ.get("ETH_PRIVATE_KEY", "")
SEPOLIA_CHAIN  = 11155111
MIN_ANCHOR_ETH = 0.001
IS_CONFIGURED  = bool(ALCHEMY_URL and ETH_ADDR and ETH_PK)

w3: Optional[Web3] = None
if IS_CONFIGURED:
    try:
        w3 = Web3(Web3.HTTPProvider(ALCHEMY_URL, request_kwargs={"timeout": 15}))
    except Exception as e:
        logger.warning(f"Web3 init failed: {e}")
        w3 = None


# ─── Crypto helpers ───────────────────────────────────────────────────────────
def compute_credential_hash(payload: Dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return "0x" + digest


def sign_hash(hash_hex: str) -> str:
    if not IS_CONFIGURED:
        raise HTTPException(status_code=503, detail="Blockchain not configured")
    msg = encode_defunct(text=hash_hex)
    # eth_account works without an active web3 connection
    from eth_account import Account
    signed = Account.sign_message(msg, private_key=ETH_PK)
    return signed.signature.hex()


def recover_signer(hash_hex: str, signature_hex: str) -> str:
    from eth_account import Account
    msg = encode_defunct(text=hash_hex)
    return Account.recover_message(msg, signature=signature_hex)


def issuer_checksum() -> str:
    return Web3.to_checksum_address(ETH_ADDR)


# ─── Sepolia helpers ──────────────────────────────────────────────────────────
def get_balance_eth() -> float:
    if not (IS_CONFIGURED and w3):
        return 0.0
    try:
        bal_wei = w3.eth.get_balance(issuer_checksum())
        return float(w3.from_wei(bal_wei, "ether"))
    except Exception as e:
        logger.warning(f"Balance check failed: {e}")
        return 0.0


def anchor_on_sepolia(hash_hex: str) -> str:
    if not (IS_CONFIGURED and w3):
        raise HTTPException(status_code=503, detail="Blockchain not configured")
    balance = get_balance_eth()
    if balance < MIN_ANCHOR_ETH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient Sepolia balance ({balance:.6f} ETH). "
                f"Fund {ETH_ADDR} via https://sepoliafaucet.com or "
                "https://www.alchemy.com/faucets/ethereum-sepolia (min 0.001 ETH needed)."
            ),
        )

    sender = issuer_checksum()
    clean = hash_hex[2:] if hash_hex.startswith("0x") else hash_hex
    data_bytes = bytes.fromhex(clean)

    try:
        nonce = w3.eth.get_transaction_count(sender)
        gas_price = w3.eth.gas_price
        tx = {
            "from": sender,
            "to": sender,
            "value": 0,
            "data": data_bytes,
            "gas": 60000,
            "gasPrice": gas_price,
            "nonce": nonce,
            "chainId": SEPOLIA_CHAIN,
        }
        signed = w3.eth.account.sign_transaction(tx, private_key=ETH_PK)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        tx_hash = w3.eth.send_raw_transaction(raw)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt.status != 1:
            raise HTTPException(status_code=500, detail="Anchoring transaction reverted")
        return tx_hash.hex()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Anchor failed: {e}")
        raise HTTPException(status_code=500, detail=f"Anchor failed: {str(e)[:200]}")


# ─── Pydantic models ──────────────────────────────────────────────────────────
class CredentialIssueRequest(BaseModel):
    employee_id: str
    credential_type: str = Field(..., description="degree | certification | employment_letter | award")
    title: str
    issuer_name: str
    issue_date: str
    credential_id: Optional[str] = None
    description: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


class CredentialVerifyRequest(BaseModel):
    payload: Dict[str, Any]
    signature: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def status():
    bal = get_balance_eth()
    return {
        "configured": IS_CONFIGURED,
        "connected": bool(w3 and w3.is_connected()) if w3 else False,
        "network": "Ethereum Sepolia Testnet",
        "chain_id": SEPOLIA_CHAIN,
        "wallet_address": ETH_ADDR or None,
        "balance_eth": bal,
        "balance_status": "ok" if bal >= MIN_ANCHOR_ETH else "low (anchoring disabled)",
        "min_anchor_eth": MIN_ANCHOR_ETH,
        "explorer_address": f"https://sepolia.etherscan.io/address/{ETH_ADDR}" if ETH_ADDR else None,
        "faucets": [
            "https://sepoliafaucet.com",
            "https://www.alchemy.com/faucets/ethereum-sepolia",
            "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
        ],
    }


@router.post("/credentials/issue")
async def issue_credential(body: CredentialIssueRequest, request: Request):
    """Issue a signed credential. Requires HR Manager or Super Admin."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Only HR / Admin can issue credentials")

    if not IS_CONFIGURED:
        raise HTTPException(status_code=503, detail="Blockchain not configured")

    # Verify employee exists in tenant
    emp = await db.users.find_one({
        "employee_id": body.employee_id,
        "tenant_id": user.get("tenant_id"),
    })
    if not emp and user["role"] != "super_admin":
        raise HTTPException(status_code=404, detail="Employee not found in your tenant")

    cred_uid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    payload = {
        "credential_uid": cred_uid,
        "employee_id": body.employee_id,
        "employee_name": (emp or {}).get("name", ""),
        "credential_type": body.credential_type,
        "title": body.title,
        "issuer_name": body.issuer_name,
        "issue_date": body.issue_date,
        "credential_id": body.credential_id or "",
        "description": body.description or "",
        "issued_at": now_iso,
        "issued_by": user["email"],
        "tenant_id": user.get("tenant_id", ""),
        "extra": body.extra or {},
    }

    hash_hex = compute_credential_hash(payload)
    signature_hex = sign_hash(hash_hex)
    issuer_addr = issuer_checksum()

    doc = {
        "credential_uid": cred_uid,
        "employee_id": body.employee_id,
        "tenant_id": user.get("tenant_id"),
        "credential_type": body.credential_type,
        "title": body.title,
        "payload": payload,
        "hash": hash_hex,
        "signature": signature_hex,
        "issuer_address": issuer_addr,
        "issued_by": user["email"],
        "onchain_tx_hash": None,
        "onchain_anchored": False,
        "revoked": False,
        "created_at": now_iso,
    }
    await db.credentials.insert_one(doc)

    return {
        "credential_uid": cred_uid,
        "hash": hash_hex,
        "signature": signature_hex,
        "issuer_address": issuer_addr,
        "issued_at": now_iso,
        "verify_url": f"/api/blockchain/credentials/{cred_uid}",
    }


@router.post("/credentials/verify")
async def verify_credential(body: CredentialVerifyRequest):
    """Public verification — anyone with payload + signature can verify."""
    if not IS_CONFIGURED:
        raise HTTPException(status_code=503, detail="Blockchain not configured")

    recomputed = compute_credential_hash(body.payload)
    try:
        recovered = recover_signer(recomputed, body.signature)
    except Exception as e:
        return {
            "valid": False,
            "reason": f"Signature decoding failed: {str(e)[:100]}",
            "recomputed_hash": recomputed,
        }

    expected = issuer_checksum()
    recovered_cs = Web3.to_checksum_address(recovered)
    valid = recovered_cs == expected

    # Look up on-chain anchor if present in our DB
    db_doc = await db.credentials.find_one(
        {"hash": recomputed},
        {"_id": 0, "onchain_tx_hash": 1, "onchain_anchored": 1, "revoked": 1, "credential_uid": 1, "issued_by": 1}
    )

    return {
        "valid": valid and not (db_doc or {}).get("revoked", False),
        "signature_valid": valid,
        "recovered_address": recovered_cs,
        "expected_issuer": expected,
        "recomputed_hash": recomputed,
        "onchain_anchored": (db_doc or {}).get("onchain_anchored", False),
        "onchain_tx_hash": (db_doc or {}).get("onchain_tx_hash"),
        "revoked": (db_doc or {}).get("revoked", False),
        "credential_uid": (db_doc or {}).get("credential_uid"),
        "etherscan_tx_url": (
            f"https://sepolia.etherscan.io/tx/{(db_doc or {}).get('onchain_tx_hash')}"
            if (db_doc or {}).get("onchain_tx_hash") else None
        ),
    }


@router.get("/credentials/{credential_uid}")
async def get_credential(credential_uid: str):
    """Public detail view — used for verify-by-UID flow / QR codes."""
    doc = await db.credentials.find_one({"credential_uid": credential_uid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Credential not found")
    return {
        **doc,
        "etherscan_tx_url": (
            f"https://sepolia.etherscan.io/tx/{doc.get('onchain_tx_hash')}"
            if doc.get("onchain_tx_hash") else None
        ),
        "etherscan_issuer_url": f"https://sepolia.etherscan.io/address/{doc.get('issuer_address')}",
    }


@router.get("/credentials")
async def list_credentials(request: Request, employee_id: Optional[str] = None, limit: int = 100):
    """List credentials. HR sees tenant; Employees see only their own."""
    user = await get_current_user(request)
    query: Dict[str, Any] = {}
    if user["role"] == "super_admin":
        if employee_id:
            query["employee_id"] = employee_id
    elif user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
        if employee_id:
            query["employee_id"] = employee_id
    else:  # employee
        query["employee_id"] = user.get("employee_id")

    docs = await db.credentials.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return docs


@router.post("/credentials/{credential_uid}/anchor")
async def anchor_credential(credential_uid: str, request: Request):
    """Anchor a credential's hash on the Sepolia blockchain (requires test ETH)."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = await db.credentials.find_one({"credential_uid": credential_uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Credential not found")
    if user["role"] == "hr_manager" and doc.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Cross-tenant access denied")
    if doc.get("onchain_anchored"):
        return {
            "message": "Already anchored",
            "tx_hash": doc.get("onchain_tx_hash"),
            "etherscan_url": f"https://sepolia.etherscan.io/tx/{doc.get('onchain_tx_hash')}",
        }

    tx_hash = anchor_on_sepolia(doc["hash"])
    await db.credentials.update_one(
        {"credential_uid": credential_uid},
        {"$set": {
            "onchain_tx_hash": tx_hash,
            "onchain_anchored": True,
            "anchored_at": datetime.now(timezone.utc).isoformat(),
            "anchored_by": user["email"],
        }},
    )
    return {
        "message": "Anchored on Sepolia",
        "tx_hash": tx_hash,
        "etherscan_url": f"https://sepolia.etherscan.io/tx/{tx_hash}",
    }


@router.post("/credentials/{credential_uid}/revoke")
async def revoke_credential(credential_uid: str, request: Request):
    """Mark a credential as revoked (off-chain flag)."""
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    doc = await db.credentials.find_one({"credential_uid": credential_uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Credential not found")
    if user["role"] == "hr_manager" and doc.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Cross-tenant access denied")
    await db.credentials.update_one(
        {"credential_uid": credential_uid},
        {"$set": {
            "revoked": True,
            "revoked_at": datetime.now(timezone.utc).isoformat(),
            "revoked_by": user["email"],
        }},
    )
    return {"message": "Credential revoked", "credential_uid": credential_uid}


@router.get("/balance")
async def balance():
    return {
        "address": ETH_ADDR,
        "balance_eth": get_balance_eth(),
        "explorer_url": f"https://sepolia.etherscan.io/address/{ETH_ADDR}" if ETH_ADDR else None,
    }
