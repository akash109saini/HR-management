"""
Comprehensive backend tests for WhatsApp + Blockchain Credentials modules.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://under-run.preview.emergentagent.com").rstrip("/")
WA_VERIFY_TOKEN = "hrms_whatsapp_verify_token_2026"
EXPECTED_WALLET = "0xb5aB7975a1C4aEB9f589fB0794d1ef7ed142Ff39"


# ─── Fixtures ─────────────────────────────────────────────────────────────────
def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


@pytest.fixture(scope="module")
def hr_token():
    r = _login("hr@acmecorp.com", "1Akash@@")
    assert r.status_code == 200, f"HR login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def employee_token():
    # Try master password first (always works) per problem statement
    r = _login("john@acmecorp.com", "SuperAdmin@123")
    assert r.status_code == 200, f"Employee login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture
def hr_headers(hr_token):
    return {"Authorization": f"Bearer {hr_token}"}


@pytest.fixture
def emp_headers(employee_token):
    return {"Authorization": f"Bearer {employee_token}"}


# ═══════════ WHATSAPP TESTS ═══════════════════════════════════════════════════
class TestWhatsAppStatus:
    def test_status_public(self):
        r = requests.get(f"{BASE_URL}/api/whatsapp/status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "configured" in d
        assert "webhook_url" in d
        assert d.get("verify_token") == WA_VERIFY_TOKEN


class TestWhatsAppWebhookVerify:
    def test_webhook_verify_success(self):
        r = requests.get(
            f"{BASE_URL}/api/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": WA_VERIFY_TOKEN,
                "hub.challenge": "12345abc",
            },
            timeout=15,
        )
        assert r.status_code == 200
        assert r.text.strip() == "12345abc"

    def test_webhook_verify_wrong_token(self):
        r = requests.get(
            f"{BASE_URL}/api/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "WRONG_TOKEN",
                "hub.challenge": "x",
            },
            timeout=15,
        )
        assert r.status_code == 403


class TestWhatsAppWebhookReceive:
    def _wa_payload(self, from_number, body):
        return {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "ENTRY",
                "changes": [{
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": "TEST"},
                        "messages": [{
                            "from": from_number,
                            "id": "wamid.TEST123",
                            "timestamp": "1700000000",
                            "type": "text",
                            "text": {"body": body},
                        }],
                    },
                    "field": "messages",
                }],
            }],
        }

    def test_webhook_known_user_leave_balance(self):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/webhook",
            json=self._wa_payload("9123456780", "leave balance"),
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("status") in ["replied", "error"]
        if d.get("status") == "replied":
            assert d.get("send_status") in ["sent", "send_failed"]

    def test_webhook_known_user_profile(self):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/webhook",
            json=self._wa_payload("9123456780", "my profile"),
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json().get("status") in ["replied", "error"]

    def test_webhook_known_user_hello(self):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/webhook",
            json=self._wa_payload("9123456780", "hello"),
            timeout=20,
        )
        assert r.status_code == 200

    def test_webhook_unknown_user(self):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/webhook",
            json=self._wa_payload("9999999999", "hi"),
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json().get("status") == "unknown_user"


class TestWhatsAppSend:
    def test_send_no_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/send",
            json={"to": "9123456780", "message": "test"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_send_as_employee_forbidden(self, emp_headers):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/send",
            json={"to": "9123456780", "message": "test"},
            headers=emp_headers,
            timeout=15,
        )
        assert r.status_code == 403

    def test_send_as_hr_returns_200_with_error(self, hr_headers):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/send",
            json={"to": "9123456780", "message": "test from pytest"},
            headers=hr_headers,
            timeout=30,
        )
        # Must NOT 500
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert d.get("status") in ["send_failed", "sent", "mock"]


class TestWhatsAppMessages:
    def test_list_messages_as_hr(self, hr_headers):
        r = requests.get(f"{BASE_URL}/api/whatsapp/messages", headers=hr_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for m in data:
            assert "_id" not in m


# ═══════════ BLOCKCHAIN TESTS ═════════════════════════════════════════════════
class TestBlockchainStatus:
    def test_status_public(self):
        r = requests.get(f"{BASE_URL}/api/blockchain/status", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("configured") is True
        assert d.get("chain_id") == 11155111
        assert d.get("wallet_address", "").lower() == EXPECTED_WALLET.lower()
        assert "balance_eth" in d
        assert isinstance(d.get("faucets"), list) and len(d["faucets"]) >= 1


# Shared state across tests in this class
_state = {}


class TestBlockchainCredentialsIssue:
    def test_issue_no_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/issue",
            json={
                "employee_id": "EMP-ACME-002",
                "credential_type": "degree",
                "title": "Test",
                "issuer_name": "Test U",
                "issue_date": "2024-01-01",
            },
            timeout=20,
        )
        assert r.status_code == 401

    def test_issue_as_employee_forbidden(self, emp_headers):
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/issue",
            headers=emp_headers,
            json={
                "employee_id": "EMP-ACME-002",
                "credential_type": "degree",
                "title": "Test",
                "issuer_name": "Test U",
                "issue_date": "2024-01-01",
            },
            timeout=20,
        )
        assert r.status_code == 403

    def test_issue_as_hr_success(self, hr_headers):
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/issue",
            headers=hr_headers,
            json={
                "employee_id": "EMP-ACME-002",
                "credential_type": "degree",
                "title": "Test Degree (Pytest)",
                "issuer_name": "Pytest U",
                "issue_date": "2024-01-01",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        d = r.json()
        assert "credential_uid" in d
        assert d["hash"].startswith("0x") and len(d["hash"]) == 66
        assert d["signature"]
        assert d["issuer_address"].lower() == EXPECTED_WALLET.lower()
        _state["uid"] = d["credential_uid"]
        _state["hash"] = d["hash"]
        _state["signature"] = d["signature"]
        _state["issuer"] = d["issuer_address"]


class TestBlockchainCredentialsGetAndVerify:
    def test_get_credential(self, hr_headers):
        uid = _state.get("uid")
        if not uid:
            pytest.skip("No credential issued")
        r = requests.get(f"{BASE_URL}/api/blockchain/credentials/{uid}", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("credential_uid") == uid
        assert d.get("hash") == _state["hash"]
        assert d.get("signature") == _state["signature"]
        assert "payload" in d
        assert d.get("etherscan_issuer_url", "").startswith("https://sepolia.etherscan.io/address/")
        _state["payload"] = d["payload"]

    def test_verify_correct(self):
        if not _state.get("payload"):
            pytest.skip("No payload")
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/verify",
            json={"payload": _state["payload"], "signature": _state["signature"]},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("valid") is True
        assert d.get("signature_valid") is True
        assert d.get("recovered_address", "").lower() == _state["issuer"].lower()
        assert d.get("expected_issuer", "").lower() == _state["issuer"].lower()

    def test_verify_tampered(self):
        if not _state.get("payload"):
            pytest.skip("No payload")
        tampered = dict(_state["payload"])
        tampered["title"] = "TAMPERED TITLE"
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/verify",
            json={"payload": tampered, "signature": _state["signature"]},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("valid") is False
        assert d.get("signature_valid") is False
        assert d.get("recovered_address", "").lower() != _state["issuer"].lower()


class TestBlockchainAnchor:
    def test_anchor_insufficient_funds(self, hr_headers):
        uid = _state.get("uid")
        if not uid:
            pytest.skip("No credential issued")
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/{uid}/anchor",
            headers=hr_headers,
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400 insufficient balance, got {r.status_code}: {r.text[:300]}"
        assert "insufficient" in r.text.lower() or "balance" in r.text.lower()


class TestBlockchainRevoke:
    def test_revoke_as_hr(self, hr_headers):
        # Issue a fresh one
        r = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/issue",
            headers=hr_headers,
            json={
                "employee_id": "EMP-ACME-002",
                "credential_type": "certification",
                "title": "Revoke Test",
                "issuer_name": "Pytest",
                "issue_date": "2024-01-01",
            },
            timeout=30,
        )
        assert r.status_code == 200
        cred = r.json()
        uid = cred["credential_uid"]

        # Revoke
        rv = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/{uid}/revoke",
            headers=hr_headers,
            timeout=20,
        )
        assert rv.status_code == 200

        # Get -> should show revoked
        gr = requests.get(f"{BASE_URL}/api/blockchain/credentials/{uid}", timeout=20)
        assert gr.status_code == 200
        assert gr.json().get("revoked") is True
        payload = gr.json().get("payload")

        # Verify -> valid:false, signature_valid:true
        vr = requests.post(
            f"{BASE_URL}/api/blockchain/credentials/verify",
            json={"payload": payload, "signature": cred["signature"]},
            timeout=20,
        )
        assert vr.status_code == 200
        d = vr.json()
        assert d.get("signature_valid") is True
        assert d.get("valid") is False
        assert d.get("revoked") is True


class TestBlockchainList:
    def test_list_as_hr(self, hr_headers):
        r = requests.get(f"{BASE_URL}/api/blockchain/credentials", headers=hr_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        for c in r.json():
            assert "_id" not in c

    def test_list_as_employee_only_own(self, emp_headers):
        r = requests.get(f"{BASE_URL}/api/blockchain/credentials", headers=emp_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # All credentials should belong to this employee (EMP-ACME-002)
        for c in data:
            assert c.get("employee_id") == "EMP-ACME-002"


# ═══════════ REGRESSION ═══════════════════════════════════════════════════════
class TestMasterPasswordRegression:
    def test_master_password_login(self):
        r = _login("john@acmecorp.com", "SuperAdmin@123")
        assert r.status_code == 200
        assert "access_token" in r.json()
