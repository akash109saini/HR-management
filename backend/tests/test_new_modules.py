"""
Backend tests for new modules added in iteration 8:
- Sentiment / Feedback (/api/ai/feedback, /api/ai/sentiment-dashboard, /api/ai/feedbacks)
- Demo Seeder (/api/demo/seed, /api/demo/status)
- Biometric eSSL/ZKTeco ADMS protocol (/api/iclock/*) + admin (/api/biometric/*)
- Predictive Attrition (/api/ai/attrition-risk/{employee_id})
- WhatsApp send regression (graceful send_failed)
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://under-run.preview.emergentagent.com").rstrip("/")

SUPER_ADMIN = {"email": "admin@hrms.com", "password": "admin123"}
HR_ACME = {"email": "hr@acmecorp.com", "password": "1Akash@@"}
EMP_JOHN = {"email": "john@acmecorp.com", "password": "SuperAdmin@123"}  # master pw


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def super_admin_token():
    return _login(SUPER_ADMIN)


@pytest.fixture(scope="session")
def hr_token():
    return _login(HR_ACME)


@pytest.fixture(scope="session")
def employee_token():
    return _login(EMP_JOHN)


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Demo Seeder ----------
class TestDemoSeeder:
    def test_seed_as_hr_forbidden(self, hr_token):
        r = requests.post(f"{BASE_URL}/api/demo/seed", headers=H(hr_token), timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_seed_as_super_admin(self, super_admin_token):
        r = requests.post(f"{BASE_URL}/api/demo/seed", headers=H(super_admin_token), timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        # Should contain counts of seeded items
        assert isinstance(data, dict)
        # Accept various key names
        keys = " ".join(data.keys()).lower()
        assert any(k in keys for k in ["feedback", "credential", "whatsapp", "announce", "seeded", "status"])

    def test_status_as_hr(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/demo/status", headers=H(hr_token), timeout=20)
        assert r.status_code in (200, 403)  # may be HR-allowed or super-only


# ---------- Sentiment ----------
class TestSentiment:
    def test_employee_feedback_submission(self, employee_token):
        payload = {
            "text": "TEST_FB I really enjoy working here and the team is supportive.",
            "category": "management",
            "rating": 4,
            "anonymous": True,
        }
        r = requests.post(f"{BASE_URL}/api/ai/feedback", headers=H(employee_token), json=payload, timeout=60)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
        d = r.json()
        # Sentiment analysis result expected (may be wrapped in 'feedback' key)
        inner = d.get("feedback", d)
        keys = list(inner.keys()) if isinstance(inner, dict) else []
        assert any(k in keys for k in ["sentiment", "score", "sentiment_score", "themes", "id", "_id"]), f"Got: {keys}"

    def test_employee_cannot_view_dashboard(self, employee_token):
        r = requests.get(f"{BASE_URL}/api/ai/sentiment-dashboard?days=30", headers=H(employee_token), timeout=20)
        assert r.status_code == 403, f"{r.status_code}: {r.text}"

    def test_hr_dashboard(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/ai/sentiment-dashboard?days=30", headers=H(hr_token), timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        for k in ["total_feedbacks", "average_score", "sentiment_distribution", "top_themes", "action_needed_count"]:
            assert k in d, f"Missing {k} in dashboard. Keys: {list(d.keys())}"

    def test_hr_feedbacks_list_hides_anonymous_name(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/ai/feedbacks", headers=H(hr_token), timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        items = r.json()
        if isinstance(items, dict):
            items = items.get("feedbacks") or items.get("items") or []
        for it in items:
            if it.get("anonymous") is True:
                # employee_name should be missing or anonymized
                assert not it.get("employee_name") or "anon" in str(it.get("employee_name", "")).lower(), \
                    f"Anonymous feedback leaks name: {it}"


# ---------- Biometric eSSL device protocol ----------
class TestBiometricDeviceProtocol:
    DEVICE_SN = "TEST-SN-9001"

    def test_cdata_get_returns_config(self):
        r = requests.get(
            f"{BASE_URL}/api/iclock/cdata",
            params={"SN": self.DEVICE_SN, "options": "all", "pushver": "2.4.2"},
            timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        assert "GET OPTION FROM:" in r.text, f"Body: {r.text[:200]}"

    def test_cdata_post_attlog(self):
        body = "EMP-ACME-002\t2026-05-16 09:01:23\t0\t1\t0\t"
        r = requests.post(
            f"{BASE_URL}/api/iclock/cdata",
            params={"SN": self.DEVICE_SN, "table": "ATTLOG"},
            data=body,
            headers={"Content-Type": "text/plain"},
            timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        assert "OK" in r.text.upper(), f"Body: {r.text}"


# ---------- Biometric admin ----------
class TestBiometricAdmin:
    def test_devices_list(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/biometric/devices", headers=H(hr_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        # Could be list or dict
        assert isinstance(d, (list, dict))

    def test_simulate_clock_in(self, hr_token):
        r = requests.post(
            f"{BASE_URL}/api/biometric/simulate",
            headers=H(hr_token),
            json={"user_pin": "EMP-ACME-002", "status": 0},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert isinstance(d, dict)

    def test_simulate_clock_out(self, hr_token):
        time.sleep(0.5)
        r = requests.post(
            f"{BASE_URL}/api/biometric/simulate",
            headers=H(hr_token),
            json={"user_pin": "EMP-ACME-002", "status": 1},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"

    def test_punches_list(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/biometric/punches", headers=H(hr_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"

    def test_punches_list_filtered(self, hr_token):
        r1 = requests.get(f"{BASE_URL}/api/biometric/punches?search=EMP-ACME-002", headers=H(hr_token), timeout=20)
        assert r1.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/biometric/punches?device_sn=SIMULATOR-001", headers=H(hr_token), timeout=20)
        assert r2.status_code == 200
        r3 = requests.get(f"{BASE_URL}/api/biometric/punches?status=check_in", headers=H(hr_token), timeout=20)
        assert r3.status_code == 200
        r4 = requests.get(f"{BASE_URL}/api/biometric/punches?date=2026-06-06", headers=H(hr_token), timeout=20)
        assert r4.status_code == 200

    def test_setup_guide(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/biometric/setup-guide", headers=H(hr_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        joined = str(d).lower()
        assert "iclock" in joined or "server" in joined

    def test_status(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/biometric/status", headers=H(hr_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        # Should report counts
        assert any(k in d for k in ["devices_total", "devices_online", "punches_today", "total_devices"])

    def test_register_and_delete_device(self, hr_token):
        sn = "TEST-SN-REG-001"
        r = requests.post(
            f"{BASE_URL}/api/biometric/devices",
            headers=H(hr_token),
            json={"serial_number": sn, "name": "TEST Reception Device"},
            timeout=20,
        )
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
        d = r.json()
        device_id = d.get("id") or d.get("_id") or d.get("device_id")
        if device_id:
            d2 = requests.delete(f"{BASE_URL}/api/biometric/devices/{device_id}", headers=H(hr_token), timeout=20)
            assert d2.status_code in (200, 204), f"{d2.status_code}: {d2.text}"


# ---------- Attrition ----------
class TestAttrition:
    def test_risk_for_employee(self, hr_token):
        r = requests.get(
            f"{BASE_URL}/api/ai/attrition-risk/EMP-ACME-002",
            headers=H(hr_token),
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        # Must contain key fields (accept either 'recommended_actions' or 'recommendations')
        for k in ["risk_score", "risk_level", "key_factors"]:
            assert k in d, f"Missing {k}. Got: {list(d.keys())}"
        assert "recommended_actions" in d or "recommendations" in d, f"Missing recommendations field. Got: {list(d.keys())}"
        assert 0 <= d["risk_score"] <= 100


# ---------- WhatsApp send regression (graceful failure) ----------
class TestWhatsAppRegression:
    def test_send_graceful(self, hr_token):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/send",
            headers=H(hr_token),
            json={"to": "+919999999999", "message": "TEST_WA"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert "status" in d, f"Got: {d}"
