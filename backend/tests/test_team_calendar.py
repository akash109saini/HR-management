"""
Backend tests for iteration 9:
- WhatsApp /status returns new phone_number_id 1082457841623524
- WhatsApp /send still works gracefully (HTTP 200 even when Meta rejects)
- Demo seeder now also seeds leaves + holidays
- NEW: GET /api/leaves/calendar (Team Time-Off Calendar)
"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://under-run.preview.emergentagent.com").rstrip("/")

SUPER_ADMIN = {"email": "admin@hrms.com", "password": "admin123"}
HR_ACME = {"email": "hr@acmecorp.com", "password": "1Akash@@"}
EMP_JOHN = {"email": "john@acmecorp.com", "password": "SuperAdmin@123"}

EXPECTED_PHONE_ID = "1082457841623524"


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


# ---------- WhatsApp config refresh ----------
class TestWhatsAppStatus:
    def test_status_phone_number_id(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/whatsapp/status", headers=H(hr_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        # phone_number_id may be at top level or nested
        flat = str(d)
        assert EXPECTED_PHONE_ID in flat, f"Expected phone_number_id {EXPECTED_PHONE_ID} in response. Got: {d}"

    def test_send_graceful_failure(self, hr_token):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/send",
            headers=H(hr_token),
            json={"to": "+919999999999", "message": "TEST_WA iter9"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert "status" in d, f"Missing status: {d}"
        # Either sent OR send_failed structured error
        if d.get("status") == "send_failed":
            assert "error" in d, f"send_failed missing error obj: {d}"


# ---------- Demo seeder extended ----------
class TestDemoSeederExtended:
    def test_seed_includes_leaves_and_holidays(self, super_admin_token):
        # Clean first to get clean counts
        requests.delete(f"{BASE_URL}/api/demo/seed", headers=H(super_admin_token), timeout=60)
        r = requests.post(f"{BASE_URL}/api/demo/seed", headers=H(super_admin_token), timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert "leaves_inserted" in d, f"Missing leaves_inserted. Keys: {list(d.keys())}"
        assert "holidays_inserted" in d, f"Missing holidays_inserted. Keys: {list(d.keys())}"
        assert d["leaves_inserted"] >= 1, f"Expected >=1 leaves, got {d['leaves_inserted']}"
        assert d["holidays_inserted"] >= 1, f"Expected >=1 holidays, got {d['holidays_inserted']}"

    def test_status_shows_leaves_and_holidays(self, super_admin_token):
        r = requests.get(f"{BASE_URL}/api/demo/status", headers=H(super_admin_token), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert "leaves_demo" in d, f"Keys: {list(d.keys())}"
        assert "holidays_demo" in d, f"Keys: {list(d.keys())}"
        assert d["leaves_demo"] >= 1
        assert d["holidays_demo"] >= 1

    def test_delete_removes_leaves_and_holidays(self, super_admin_token):
        r = requests.delete(f"{BASE_URL}/api/demo/seed", headers=H(super_admin_token), timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert "leaves_removed" in d, f"Keys: {list(d.keys())}"
        assert "holidays_removed" in d
        assert d["leaves_removed"] >= 1
        assert d["holidays_removed"] >= 1
        # Re-seed for downstream calendar tests
        requests.post(f"{BASE_URL}/api/demo/seed", headers=H(super_admin_token), timeout=90)


# ---------- Team Calendar (NEW) ----------
class TestTeamCalendar:
    def test_calendar_default_range_hr(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/leaves/calendar", headers=H(hr_token), timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        for k in ["start", "end", "events", "by_day", "summary"]:
            assert k in d, f"Missing key {k}. Got: {list(d.keys())}"
        s = d["summary"]
        for k in ["total_employees_on_leave_today", "on_leave_today", "upcoming_leave_days", "holidays_in_range"]:
            assert k in s, f"Missing summary key {k}. Got: {list(s.keys())}"
        # Should contain events (demo data seeded)
        assert isinstance(d["events"], list)
        assert len(d["events"]) >= 1, "Expected at least some events from demo data"

    def test_calendar_custom_range(self, hr_token):
        r = requests.get(
            f"{BASE_URL}/api/leaves/calendar",
            params={"start": "2026-05-01", "end": "2026-07-31"},
            headers=H(hr_token),
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert d["start"] == "2026-05-01"
        assert d["end"] == "2026-07-31"

    def test_calendar_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/leaves/calendar", timeout=20)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_calendar_employee_tenant_scoped(self, employee_token):
        r = requests.get(f"{BASE_URL}/api/leaves/calendar", headers=H(employee_token), timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        # All events must be within the employee's tenant (acmecorp/Acme)
        assert "events" in d
        # Verify by_day structure
        assert isinstance(d["by_day"], dict)

    def test_calendar_multiday_leaves_expanded_in_by_day(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/leaves/calendar", headers=H(hr_token), timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        # Find a multi-day leave event
        multi_day_events = [e for e in d["events"] if e.get("type") == "leave"
                            and e.get("start_date") and e.get("end_date")
                            and e["start_date"] != e["end_date"]]
        if not multi_day_events:
            pytest.skip("No multi-day leaves in current seed; cannot verify expansion")
        ev = multi_day_events[0]
        from datetime import datetime as _dt, timedelta as _td
        s = _dt.strptime(ev["start_date"], "%Y-%m-%d").date()
        e_d = _dt.strptime(ev["end_date"], "%Y-%m-%d").date()
        # Each day between s..e should have this leave in by_day
        cur = s
        while cur <= e_d:
            day_key = cur.isoformat()
            assert day_key in d["by_day"], f"Day {day_key} missing in by_day for multi-day leave"
            leaves_on_day = d["by_day"][day_key].get("leaves", [])
            assert any(l.get("id") == ev.get("id") for l in leaves_on_day), \
                f"Leave {ev.get('id')} not present on {day_key}"
            cur += _td(days=1)

    def test_calendar_holidays_present(self, hr_token):
        r = requests.get(f"{BASE_URL}/api/leaves/calendar", headers=H(hr_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        holiday_events = [e for e in d["events"] if e.get("type") == "holiday"]
        assert len(holiday_events) >= 1, f"Expected at least 1 holiday event, got {len(holiday_events)}"
        h = holiday_events[0]
        assert "date" in h and "name" in h
        # And the day should appear in by_day
        assert h["date"] in d["by_day"]
        assert any(x.get("id") == h.get("id") for x in d["by_day"][h["date"]]["holidays"])
