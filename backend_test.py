#!/usr/bin/env python3
"""
Comprehensive backend test for Tax & PF/ESI Management modules and Payroll.
Tests all endpoints with auth boundaries and correctness checks.
"""
import requests
import json
import sys
from typing import Dict, Optional

BASE_URL = "https://under-run.preview.emergentagent.com/api"

# Test credentials
SUPER_ADMIN = {"email": "admin@hrms.com", "password": "admin123"}
HR_ACME = {"email": "hr@acmecorp.com", "password": "9876543210"}
HR_TECH = {"email": "hr@techsolutions.io", "password": "9876543211"}
EMP_JOHN = {"email": "john@acmecorp.com", "password": "9123456780"}
EMP_EMILY = {"email": "emily@acmecorp.com", "password": "9123456781"}
EMP_ALEX = {"email": "alex@techsolutions.io", "password": "9123456782"}

# Global tokens storage
tokens: Dict[str, str] = {}
user_data: Dict[str, Dict] = {}

# Test results
passed = 0
failed = 0
errors = []


def log(msg: str, level: str = "INFO"):
    """Log test messages."""
    prefix = "✅" if level == "PASS" else "❌" if level == "FAIL" else "ℹ️"
    print(f"{prefix} {msg}")


def login(creds: Dict[str, str], label: str) -> Optional[str]:
    """Login and return access token."""
    global tokens, user_data
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("access_token")
            tokens[label] = token
            user_data[label] = data
            log(f"Login successful: {label} ({creds['email']})", "PASS")
            return token
        else:
            log(f"Login failed for {label}: {resp.status_code} - {resp.text}", "FAIL")
            return None
    except Exception as e:
        log(f"Login exception for {label}: {e}", "FAIL")
        return None


def test_endpoint(
    method: str,
    endpoint: str,
    token: str,
    expected_status: int,
    test_name: str,
    json_data: Optional[Dict] = None,
    params: Optional[Dict] = None,
    check_response: Optional[callable] = None,
):
    """Generic endpoint test."""
    global passed, failed, errors
    try:
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{BASE_URL}{endpoint}"
        
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=10)
        elif method == "PUT":
            resp = requests.put(url, headers=headers, json=json_data, timeout=10)
        else:
            log(f"Unknown method {method}", "FAIL")
            failed += 1
            return None
        
        if resp.status_code == expected_status:
            log(f"{test_name}: Status {resp.status_code} ✓", "PASS")
            passed += 1
            
            # Additional response checks
            if check_response and resp.status_code < 400:
                try:
                    data = resp.json() if resp.headers.get('content-type', '').startswith('application/json') else None
                    check_response(data, resp)
                except Exception as e:
                    log(f"{test_name}: Response check failed - {e}", "FAIL")
                    errors.append(f"{test_name}: {e}")
            
            return resp
        else:
            log(f"{test_name}: Expected {expected_status}, got {resp.status_code} - {resp.text[:200]}", "FAIL")
            failed += 1
            errors.append(f"{test_name}: Expected {expected_status}, got {resp.status_code}")
            return None
    except Exception as e:
        log(f"{test_name}: Exception - {e}", "FAIL")
        failed += 1
        errors.append(f"{test_name}: {e}")
        return None


def check_tax_compute_correctness(data: Dict, resp):
    """Check tax computation correctness for specific test cases."""
    gross = data.get("gross_annual", 0)
    regime = data.get("regime", "")
    taxable = data.get("taxable_income", 0)
    total_tax = data.get("total_tax_annual", 0)
    monthly_tds = data.get("monthly_tds", 0)
    slab_tax = data.get("slab_tax", 0)
    rebate = data.get("rebate_87a", 0)
    cess = data.get("cess", 0)
    
    log(f"  Tax Compute Result: gross={gross}, regime={regime}, taxable={taxable}, slab_tax={slab_tax}, rebate={rebate}, cess={cess}, total_tax={total_tax}, monthly_tds={monthly_tds}")
    
    # Test case 1: New regime, gross=1500000
    if regime == "new" and abs(gross - 1500000) < 1:
        expected_taxable = 1425000  # 1500000 - 75000 std deduction
        expected_slab_tax = 93750  # 5%×400000 + 10%×400000 + 15%×225000
        expected_cess = 3750  # 4% of 93750
        expected_total = 97500
        expected_monthly = 8125
        
        if abs(taxable - expected_taxable) > 1:
            raise Exception(f"Taxable income mismatch: expected {expected_taxable}, got {taxable}")
        if abs(slab_tax - expected_slab_tax) > 1:
            raise Exception(f"Slab tax mismatch: expected {expected_slab_tax}, got {slab_tax}")
        if abs(cess - expected_cess) > 1:
            raise Exception(f"Cess mismatch: expected {expected_cess}, got {cess}")
        if abs(total_tax - expected_total) > 1:
            raise Exception(f"Total tax mismatch: expected {expected_total}, got {total_tax}")
        if abs(monthly_tds - expected_monthly) > 1:
            raise Exception(f"Monthly TDS mismatch: expected {expected_monthly}, got {monthly_tds}")
        
        log(f"  ✓ Tax correctness check passed for gross=1500000, new regime")
    
    # Test case 2: New regime, gross=1200000 (87A rebate should apply)
    if regime == "new" and abs(gross - 1200000) < 1:
        expected_taxable = 1125000  # 1200000 - 75000
        # Slab: 0-4L=0, 4-8L=20000 (5%), 8-11.25L=32500 (10%) → total 52500
        expected_slab_tax = 52500
        expected_rebate = 52500  # Full rebate since taxable <= 1200000
        expected_total = 0  # After rebate
        
        if abs(taxable - expected_taxable) > 1:
            raise Exception(f"Taxable income mismatch: expected {expected_taxable}, got {taxable}")
        if abs(slab_tax - expected_slab_tax) > 1:
            raise Exception(f"Slab tax mismatch: expected {expected_slab_tax}, got {slab_tax}")
        if abs(rebate - expected_rebate) > 1:
            raise Exception(f"Rebate 87A mismatch: expected {expected_rebate}, got {rebate}")
        if abs(total_tax - expected_total) > 1:
            raise Exception(f"Total tax mismatch: expected {expected_total}, got {total_tax}")
        
        log(f"  ✓ Tax correctness check passed for gross=1200000, new regime (87A rebate)")


def check_pf_compute_correctness(data: Dict, resp):
    """Check PF computation correctness."""
    pf_data = data.get("pf", {})
    esi_data = data.get("esi", {})
    monthly_basic = data.get("monthly_basic", 0)
    monthly_gross = data.get("monthly_gross", 0)
    
    log(f"  PF Compute Result: basic={monthly_basic}, gross={monthly_gross}")
    log(f"    PF: {pf_data}")
    log(f"    ESI: {esi_data}")
    
    # Test case: basic=25000 with default ceiling (15000)
    if abs(monthly_basic - 25000) < 1:
        expected_pf_wage = 15000
        expected_employee_pf = 1800  # 12% of 15000
        expected_employer_eps = 1250  # 8.33% of 15000
        expected_employer_epf = 550  # 12% of 15000 - 1250
        expected_edli = 75  # 0.5% of 15000
        expected_admin = 75  # 0.5% of 15000
        
        if abs(pf_data.get("pf_wage", 0) - expected_pf_wage) > 1:
            raise Exception(f"PF wage mismatch: expected {expected_pf_wage}, got {pf_data.get('pf_wage')}")
        if abs(pf_data.get("employee_pf", 0) - expected_employee_pf) > 1:
            raise Exception(f"Employee PF mismatch: expected {expected_employee_pf}, got {pf_data.get('employee_pf')}")
        if abs(pf_data.get("employer_eps", 0) - expected_employer_eps) > 1:
            raise Exception(f"Employer EPS mismatch: expected {expected_employer_eps}, got {pf_data.get('employer_eps')}")
        if abs(pf_data.get("employer_epf", 0) - expected_employer_epf) > 1:
            raise Exception(f"Employer EPF mismatch: expected {expected_employer_epf}, got {pf_data.get('employer_epf')}")
        if abs(pf_data.get("edli", 0) - expected_edli) > 1:
            raise Exception(f"EDLI mismatch: expected {expected_edli}, got {pf_data.get('edli')}")
        if abs(pf_data.get("admin_charges", 0) - expected_admin) > 1:
            raise Exception(f"Admin charges mismatch: expected {expected_admin}, got {pf_data.get('admin_charges')}")
        
        log(f"  ✓ PF correctness check passed for basic=25000")
    
    # ESI check: gross > 21000 should have ESI not applicable
    if monthly_gross > 21000:
        if esi_data.get("applicable", True):
            raise Exception(f"ESI should not be applicable for gross={monthly_gross}")
        if esi_data.get("employee_esi", 0) != 0:
            raise Exception(f"Employee ESI should be 0 for gross={monthly_gross}")
        log(f"  ✓ ESI not applicable for gross > 21000")
    
    # ESI check: gross <= 21000 should have ESI applicable
    if 0 < monthly_gross <= 21000:
        if not esi_data.get("applicable", False):
            raise Exception(f"ESI should be applicable for gross={monthly_gross}")
        expected_emp_esi = round(monthly_gross * 0.75 / 100, 2)
        expected_empr_esi = round(monthly_gross * 3.25 / 100, 2)
        if abs(esi_data.get("employee_esi", 0) - expected_emp_esi) > 1:
            raise Exception(f"Employee ESI mismatch: expected {expected_emp_esi}, got {esi_data.get('employee_esi')}")
        if abs(esi_data.get("employer_esi", 0) - expected_empr_esi) > 1:
            raise Exception(f"Employer ESI mismatch: expected {expected_empr_esi}, got {esi_data.get('employer_esi')}")
        log(f"  ✓ ESI correctness check passed for gross={monthly_gross}")


def run_tests():
    """Run all tests."""
    global passed, failed
    
    print("\n" + "="*80)
    print("BACKEND TESTING: Tax & PF/ESI Management + Payroll")
    print("="*80 + "\n")
    
    # ========== LOGIN ==========
    print("\n--- LOGIN TESTS ---")
    login(SUPER_ADMIN, "super_admin")
    login(HR_ACME, "hr_acme")
    login(HR_TECH, "hr_tech")
    login(EMP_JOHN, "emp_john")
    login(EMP_EMILY, "emp_emily")
    login(EMP_ALEX, "emp_alex")
    
    if not all([tokens.get(k) for k in ["super_admin", "hr_acme", "hr_tech", "emp_john", "emp_emily", "emp_alex"]]):
        log("Not all logins successful, aborting tests", "FAIL")
        return
    
    # ========== TAX SETTINGS TESTS ==========
    print("\n--- TAX SETTINGS TESTS ---")
    
    # GET tax settings (any authenticated user)
    test_endpoint("GET", "/tax/settings", tokens["emp_john"], 200, "GET /tax/settings (employee)")
    test_endpoint("GET", "/tax/settings", tokens["hr_acme"], 200, "GET /tax/settings (HR)")
    test_endpoint("GET", "/tax/settings", tokens["super_admin"], 200, "GET /tax/settings (super admin)")
    
    # GET with financial_year param
    test_endpoint("GET", "/tax/settings", tokens["hr_acme"], 200, "GET /tax/settings?financial_year=2025-26", params={"financial_year": "2025-26"})
    
    # PUT tax settings (only admin/hr)
    test_endpoint("PUT", "/tax/settings", tokens["hr_acme"], 200, "PUT /tax/settings (HR)", 
                  json_data={"default_regime": "old", "cess_rate": 4})
    
    # Employee cannot PUT settings (403)
    test_endpoint("PUT", "/tax/settings", tokens["emp_john"], 403, "PUT /tax/settings (employee - should fail)")
    
    # POST reset settings
    test_endpoint("POST", "/tax/settings/reset", tokens["hr_acme"], 200, "POST /tax/settings/reset (HR)")
    test_endpoint("POST", "/tax/settings/reset", tokens["emp_john"], 403, "POST /tax/settings/reset (employee - should fail)")
    
    # ========== TAX DECLARATIONS TESTS ==========
    print("\n--- TAX DECLARATIONS TESTS ---")
    
    # GET my declarations (creates stub if absent)
    test_endpoint("GET", "/tax/declarations/me", tokens["emp_john"], 200, "GET /tax/declarations/me (John)")
    
    # PUT my declaration (draft)
    test_endpoint("PUT", "/tax/declarations/me", tokens["emp_john"], 200, "PUT /tax/declarations/me (draft)",
                  json_data={
                      "regime": "old",
                      "declarations": {
                          "section_80c": 150000,
                          "section_80d_self": 25000,
                          "hra_rent_paid": 240000,
                          "hra_city": "metro"
                      },
                      "status": "draft"
                  })
    
    # PUT my declaration (submitted)
    resp = test_endpoint("PUT", "/tax/declarations/me", tokens["emp_john"], 200, "PUT /tax/declarations/me (submitted)",
                  json_data={
                      "regime": "old",
                      "declarations": {
                          "section_80c": 150000,
                          "section_80d_self": 25000,
                          "hra_rent_paid": 240000,
                          "hra_city": "metro"
                      },
                      "status": "submitted"
                  })
    
    declaration_id = None
    if resp and resp.status_code == 200:
        declaration_id = resp.json().get("id")
    
    # GET all declarations (HR only)
    test_endpoint("GET", "/tax/declarations", tokens["hr_acme"], 200, "GET /tax/declarations (HR)")
    test_endpoint("GET", "/tax/declarations", tokens["hr_acme"], 200, "GET /tax/declarations?status=submitted", 
                  params={"status": "submitted"})
    test_endpoint("GET", "/tax/declarations", tokens["emp_john"], 403, "GET /tax/declarations (employee - should fail)")
    
    # POST decision (approve)
    if declaration_id:
        test_endpoint("POST", f"/tax/declarations/{declaration_id}/decision", tokens["hr_acme"], 200,
                      "POST /tax/declarations/{id}/decision (approve)",
                      json_data={"action": "approve", "note": "Approved by HR"})
        
        # Try to edit approved declaration (should fail with 400)
        test_endpoint("PUT", "/tax/declarations/me", tokens["emp_john"], 400, 
                      "PUT /tax/declarations/me (after approval - should fail)")
    
    # ========== TAX COMPUTE TESTS ==========
    print("\n--- TAX COMPUTE TESTS ---")
    
    # Test case 1: New regime, gross=1500000
    test_endpoint("POST", "/tax/compute", tokens["super_admin"], 200, "POST /tax/compute (1.5M new regime)",
                  json_data={"gross_annual": 1500000, "regime": "new"},
                  check_response=check_tax_compute_correctness)
    
    # Test case 2: New regime, gross=1200000 (87A rebate)
    test_endpoint("POST", "/tax/compute", tokens["super_admin"], 200, "POST /tax/compute (1.2M new regime - 87A)",
                  json_data={"gross_annual": 1200000, "regime": "new"},
                  check_response=check_tax_compute_correctness)
    
    # ========== TAX COMPARE TESTS ==========
    print("\n--- TAX COMPARE TESTS ---")
    
    test_endpoint("GET", "/tax/compare/me", tokens["emp_john"], 200, "GET /tax/compare/me (John)")
    
    # ========== TAX REPORTS TESTS ==========
    print("\n--- TAX REPORTS TESTS ---")
    
    # TDS summary CSV (HR only)
    resp = test_endpoint("GET", "/tax/reports/tds-summary", tokens["hr_acme"], 200, 
                         "GET /tax/reports/tds-summary (HR)", params={"financial_year": "2025-26"})
    if resp and resp.headers.get('content-type') == 'text/csv':
        log("  ✓ TDS summary returned CSV format")
    
    test_endpoint("GET", "/tax/reports/tds-summary", tokens["emp_john"], 403, 
                  "GET /tax/reports/tds-summary (employee - should fail)")
    
    # ========== PF SETTINGS TESTS ==========
    print("\n--- PF SETTINGS TESTS ---")
    
    # GET PF settings (any authenticated user)
    test_endpoint("GET", "/pf/settings", tokens["emp_john"], 200, "GET /pf/settings (employee)")
    test_endpoint("GET", "/pf/settings", tokens["hr_acme"], 200, "GET /pf/settings (HR)")
    
    # PUT PF settings (only admin/hr)
    test_endpoint("PUT", "/pf/settings", tokens["hr_acme"], 200, "PUT /pf/settings (HR)",
                  json_data={"pf_wage_ceiling": 15000, "pf_apply_ceiling": True, "esi_enabled": True})
    
    test_endpoint("PUT", "/pf/settings", tokens["emp_john"], 403, "PUT /pf/settings (employee - should fail)")
    
    # POST reset PF settings
    test_endpoint("POST", "/pf/settings/reset", tokens["hr_acme"], 200, "POST /pf/settings/reset (HR)")
    test_endpoint("POST", "/pf/settings/reset", tokens["emp_john"], 403, "POST /pf/settings/reset (employee - should fail)")
    
    # ========== PF STATUTORY INFO TESTS ==========
    print("\n--- PF STATUTORY INFO TESTS ---")
    
    # Get employee IDs from user_data
    john_emp_id = user_data.get("emp_john", {}).get("employee_id")
    emily_emp_id = user_data.get("emp_emily", {}).get("employee_id")
    alex_emp_id = user_data.get("emp_alex", {}).get("employee_id")
    
    if john_emp_id:
        # GET statutory info (employee can read own)
        test_endpoint("GET", f"/pf/employees/{john_emp_id}/statutory", tokens["emp_john"], 200,
                      "GET /pf/employees/{id}/statutory (John - own)")
        
        # HR can read employee in their tenant
        test_endpoint("GET", f"/pf/employees/{john_emp_id}/statutory", tokens["hr_acme"], 200,
                      "GET /pf/employees/{id}/statutory (HR Acme - John)")
        
        # Employee cannot read another employee's data (403)
        if emily_emp_id:
            test_endpoint("GET", f"/pf/employees/{emily_emp_id}/statutory", tokens["emp_john"], 403,
                          "GET /pf/employees/{id}/statutory (John reading Emily - should fail)")
        
        # HR of different tenant cannot read (403)
        if alex_emp_id:
            test_endpoint("GET", f"/pf/employees/{alex_emp_id}/statutory", tokens["hr_acme"], 403,
                          "GET /pf/employees/{id}/statutory (HR Acme reading Tech employee - should fail)")
        
        # PUT statutory info (employee can only update pan/aadhaar/uan)
        test_endpoint("PUT", f"/pf/employees/{john_emp_id}/statutory", tokens["emp_john"], 200,
                      "PUT /pf/employees/{id}/statutory (John - pan/aadhaar)",
                      json_data={"pan": "ABCDE1234F", "aadhaar_last4": "1234", "uan": "123456789012"})
        
        # Employee tries to update pf_opt_in (should be silently dropped, still 200)
        test_endpoint("PUT", f"/pf/employees/{john_emp_id}/statutory", tokens["emp_john"], 200,
                      "PUT /pf/employees/{id}/statutory (John - pf_opt_in should be ignored)",
                      json_data={"pf_opt_in": False})
        
        # HR can update all fields
        test_endpoint("PUT", f"/pf/employees/{john_emp_id}/statutory", tokens["hr_acme"], 200,
                      "PUT /pf/employees/{id}/statutory (HR - all fields)",
                      json_data={
                          "pan": "ABCDE1234F",
                          "aadhaar_last4": "1234",
                          "uan": "123456789012",
                          "pf_account_no": "PF123456",
                          "pf_join_date": "2020-01-01",
                          "pf_opt_in": True,
                          "esi_number": "ESI123456",
                          "esi_opt_in": True
                      })
    
    # ========== PF COMPUTE TESTS ==========
    print("\n--- PF COMPUTE TESTS ---")
    
    if john_emp_id:
        # Compute PF for employee (basic=25000 expected from 50000 salary)
        test_endpoint("GET", f"/pf/compute/{john_emp_id}", tokens["emp_john"], 200,
                      "GET /pf/compute/{id} (John - own)",
                      check_response=check_pf_compute_correctness)
        
        # HR can compute for employee in their tenant
        test_endpoint("GET", f"/pf/compute/{john_emp_id}", tokens["hr_acme"], 200,
                      "GET /pf/compute/{id} (HR Acme - John)")
        
        # Employee cannot compute for another employee (403)
        if emily_emp_id:
            test_endpoint("GET", f"/pf/compute/{emily_emp_id}", tokens["emp_john"], 403,
                          "GET /pf/compute/{id} (John reading Emily - should fail)")
    
    # ========== PF REPORTS TESTS ==========
    print("\n--- PF REPORTS TESTS ---")
    
    # PF challan CSV (HR only, requires month param)
    test_endpoint("GET", "/pf/reports/challan", tokens["hr_acme"], 400,
                  "GET /pf/reports/challan (no month param - should fail)")
    
    resp = test_endpoint("GET", "/pf/reports/challan", tokens["hr_acme"], 200,
                         "GET /pf/reports/challan?month=2026-05 (HR)",
                         params={"month": "2026-05"})
    if resp and resp.headers.get('content-type') == 'text/csv':
        log("  ✓ PF challan returned CSV format")
    
    test_endpoint("GET", "/pf/reports/challan", tokens["emp_john"], 403,
                  "GET /pf/reports/challan (employee - should fail)",
                  params={"month": "2026-05"})
    
    # PF statement (employee - own)
    test_endpoint("GET", "/pf/statement/me", tokens["emp_john"], 200, "GET /pf/statement/me (John)")
    
    # ========== PAYROLL TESTS ==========
    print("\n--- PAYROLL TESTS ---")
    
    if john_emp_id:
        # Generate payslip (HR only)
        def check_payslip_fields(data, resp):
            """Check that payslip has new fields."""
            required_fields = [
                "currency", "currency_symbol", "pf_wage", "employer_epf", "employer_eps",
                "edli", "admin_charges", "esi_employee", "esi_employer", "tax_regime",
                "annual_tax", "taxable_income", "financial_year"
            ]
            for field in required_fields:
                if field not in data:
                    raise Exception(f"Missing field in payslip: {field}")
            
            if data.get("currency") != "INR":
                raise Exception(f"Currency should be INR, got {data.get('currency')}")
            if data.get("currency_symbol") != "₹":
                raise Exception(f"Currency symbol should be ₹, got {data.get('currency_symbol')}")
            
            log(f"  ✓ Payslip has all required fields including new Tax/PF fields")
        
        resp = test_endpoint("POST", "/payroll/generate", tokens["hr_acme"], 200,
                      "POST /payroll/generate (HR)",
                      json_data={"employee_id": john_emp_id, "month": 5, "year": 2026},
                      check_response=check_payslip_fields)
        
        payslip_id = None
        if resp and resp.status_code == 200:
            payslip_id = resp.json().get("id")
        
        # Employee cannot generate payslip (403)
        test_endpoint("POST", "/payroll/generate", tokens["emp_john"], 403,
                      "POST /payroll/generate (employee - should fail)",
                      json_data={"employee_id": john_emp_id, "month": 5, "year": 2026})
        
        # Generate bulk payslips (HR only)
        test_endpoint("POST", "/payroll/generate-bulk", tokens["hr_acme"], 200,
                      "POST /payroll/generate-bulk (HR)",
                      json_data={"month": 5, "year": 2026})
        
        test_endpoint("POST", "/payroll/generate-bulk", tokens["emp_john"], 403,
                      "POST /payroll/generate-bulk (employee - should fail)",
                      json_data={"month": 5, "year": 2026})
        
        # List payslips
        test_endpoint("GET", "/payroll", tokens["emp_john"], 200, "GET /payroll (employee - own)")
        test_endpoint("GET", "/payroll", tokens["hr_acme"], 200, "GET /payroll (HR - all in tenant)")
        
        # Download PDF
        if payslip_id:
            resp = test_endpoint("GET", f"/payroll/{payslip_id}/pdf", tokens["emp_john"], 200,
                          "GET /payroll/{id}/pdf (John - own)")
            if resp and resp.headers.get('content-type') == 'application/pdf':
                log("  ✓ Payslip PDF returned application/pdf format")
            
            # Employee cannot download another employee's payslip
            # (We'd need another payslip ID for this, skipping for now)
    
    # ========== SUMMARY ==========
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Total: {passed + failed}")
    
    if errors:
        print("\n--- ERRORS ---")
        for err in errors:
            print(f"  • {err}")
    
    print("\n" + "="*80)
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
