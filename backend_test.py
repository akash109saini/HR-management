import requests
import sys
from datetime import datetime
import json

class HRMSAPITester:
    def __init__(self, base_url="https://workforce-hub-355.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.current_user = None

    def run_test(self, name, method, endpoint, expected_status, data=None, cookies=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self, email, password, expect_first_login=False):
        """Test login and store session"""
        success, response = self.run_test(
            f"Login ({email})",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success:
            self.current_user = response
            print(f"   User: {response.get('name', 'Unknown')} - Role: {response.get('role', 'Unknown')}")
            print(f"   First Login: {response.get('first_login', False)}")
            if expect_first_login and not response.get('first_login'):
                print(f"   ⚠️  Expected first_login=True but got {response.get('first_login')}")
            elif not expect_first_login and response.get('first_login'):
                print(f"   ⚠️  Expected first_login=False but got {response.get('first_login')}")
            return True
        return False

    def test_change_password(self, current_password, new_password):
        """Test password change"""
        success, response = self.run_test(
            "Change Password",
            "POST",
            "auth/change-password",
            200,
            data={"current_password": current_password, "new_password": new_password}
        )
        return success

    def test_get_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success, response

    def test_dashboard(self):
        """Test dashboard endpoint"""
        success, response = self.run_test(
            "Get Dashboard",
            "GET",
            "dashboard",
            200
        )
        if success:
            role = response.get('role', 'unknown')
            print(f"   Dashboard Role: {role}")
            if role == 'super_admin':
                print(f"   Total Tenants: {response.get('total_tenants', 0)}")
                print(f"   Active Tenants: {response.get('active_tenants', 0)}")
            elif role == 'hr_manager':
                print(f"   Total Employees: {response.get('total_employees', 0)}")
                print(f"   Pending Leaves: {response.get('pending_leaves', 0)}")
            elif role == 'employee':
                print(f"   Leave Balance: {response.get('leave_balance', {})}")
                print(f"   Days Present This Month: {response.get('days_present_this_month', 0)}")
        return success

    def test_logout(self):
        """Test logout"""
        success, response = self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200
        )
        if success:
            self.current_user = None
        return success

    def test_tenant_endpoints(self):
        """Test tenant management endpoints (Super Admin only)"""
        if not self.current_user or self.current_user.get('role') != 'super_admin':
            print("⚠️  Skipping tenant tests - not super admin")
            return True

        # Get tenants
        success, response = self.run_test(
            "Get Tenants",
            "GET",
            "tenants",
            200
        )
        if success:
            tenants = response if isinstance(response, list) else response.get('tenants', [])
            print(f"   Found {len(tenants)} tenants")
        return success

    def test_employee_endpoints(self):
        """Test employee management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping employee tests - not HR manager")
            return True

        # Get employees
        success, response = self.run_test(
            "Get Employees",
            "GET",
            "employees",
            200
        )
        if success:
            employees = response if isinstance(response, list) else response.get('employees', [])
            print(f"   Found {len(employees)} employees")
        return success

    def test_attendance_endpoints(self):
        """Test attendance endpoints"""
        role = self.current_user.get('role') if self.current_user else None
        
        if role == 'hr_manager':
            # HR can view all attendance
            success, response = self.run_test(
                "Get Attendance Records (HR)",
                "GET",
                "attendance",
                200
            )
            if success:
                records = response if isinstance(response, list) else response.get('records', [])
                print(f"   Found {len(records)} attendance records")
        elif role == 'employee':
            # Employee can view their own attendance
            success, response = self.run_test(
                "Get My Attendance",
                "GET",
                "attendance/my",
                200
            )
            if success:
                records = response if isinstance(response, list) else response.get('records', [])
                print(f"   Found {len(records)} personal attendance records")
        else:
            print("⚠️  Skipping attendance tests - invalid role")
            return True
        
        return success

    def test_leave_endpoints(self):
        """Test leave management endpoints"""
        role = self.current_user.get('role') if self.current_user else None
        
        if role == 'hr_manager':
            # HR can view all leaves
            success, response = self.run_test(
                "Get Leave Requests (HR)",
                "GET",
                "leaves",
                200
            )
            if success:
                leaves = response if isinstance(response, list) else response.get('leaves', [])
                print(f"   Found {len(leaves)} leave requests")
        elif role == 'employee':
            # Employee can view their own leaves
            success, response = self.run_test(
                "Get My Leaves",
                "GET",
                "leaves/my",
                200
            )
            if success:
                leaves = response if isinstance(response, list) else response.get('leaves', [])
                print(f"   Found {len(leaves)} personal leave requests")
        else:
            print("⚠️  Skipping leave tests - invalid role")
            return True
        
        return success

def main():
    print("🚀 Starting HRMS API Testing...")
    tester = HRMSAPITester()
    
    # Test 1: Super Admin Login (should NOT require password change)
    print("\n" + "="*50)
    print("TESTING SUPER ADMIN FLOW")
    print("="*50)
    
    if not tester.test_login("admin@hrms.com", "admin123", expect_first_login=False):
        print("❌ Super Admin login failed, stopping tests")
        return 1
    
    # Test Super Admin dashboard
    tester.test_dashboard()
    
    # Test tenant management
    tester.test_tenant_endpoints()
    
    # Test logout
    tester.test_logout()
    
    # Test 2: HR Manager Login (should require password change)
    print("\n" + "="*50)
    print("TESTING HR MANAGER FLOW")
    print("="*50)
    
    if not tester.test_login("hr@acmecorp.com", "9876543210", expect_first_login=True):
        print("❌ HR Manager login failed, stopping tests")
        return 1
    
    # Test password change flow
    if not tester.test_change_password("9876543210", "NewPassword123!"):
        print("❌ Password change failed")
        return 1
    
    # Test dashboard after password change
    tester.test_dashboard()
    
    # Test HR-specific endpoints
    tester.test_employee_endpoints()
    tester.test_attendance_endpoints()
    tester.test_leave_endpoints()
    
    # Test logout
    tester.test_logout()
    
    # Test 3: Employee Login (should require password change)
    print("\n" + "="*50)
    print("TESTING EMPLOYEE FLOW")
    print("="*50)
    
    if not tester.test_login("john@acmecorp.com", "9123456780", expect_first_login=True):
        print("❌ Employee login failed, stopping tests")
        return 1
    
    # Test password change flow
    if not tester.test_change_password("9123456780", "NewPassword123!"):
        print("❌ Employee password change failed")
        return 1
    
    # Test employee dashboard
    tester.test_dashboard()
    
    # Test employee-specific endpoints
    tester.test_attendance_endpoints()
    tester.test_leave_endpoints()
    
    # Test logout
    tester.test_logout()
    
    # Test 4: Basic API health check
    print("\n" + "="*50)
    print("TESTING API HEALTH")
    print("="*50)
    
    tester.run_test("API Health Check", "GET", "", 200)
    
    # Print final results
    print(f"\n📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("🎉 Backend API testing completed successfully!")
        return 0
    else:
        print("⚠️  Backend API testing completed with issues")
        return 1

if __name__ == "__main__":
    sys.exit(main())