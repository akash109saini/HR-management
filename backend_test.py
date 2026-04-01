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
                "attendance",
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
                "leaves",
                200
            )
            if success:
                leaves = response if isinstance(response, list) else response.get('leaves', [])
                print(f"   Found {len(leaves)} personal leave requests")
        else:
            print("⚠️  Skipping leave tests - invalid role")
            return True
        
        return success

    def test_department_endpoints(self):
        """Test department management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping department tests - not HR manager")
            return True

        # Get departments
        success, response = self.run_test(
            "Get Departments",
            "GET",
            "departments",
            200
        )
        if success:
            departments = response if isinstance(response, list) else response.get('departments', [])
            print(f"   Found {len(departments)} departments")
            
            # Test create department
            test_dept = {
                "name": f"Test Department {datetime.now().strftime('%H%M%S')}",
                "description": "Test department for API testing",
                "head": "Test Manager"
            }
            create_success, create_response = self.run_test(
                "Create Department",
                "POST",
                "departments",
                201,
                data=test_dept
            )
            
            if create_success:
                dept_id = create_response.get('id')
                print(f"   Created department with ID: {dept_id}")
                
                # Test update department
                update_data = {
                    "name": test_dept["name"] + " Updated",
                    "description": "Updated description",
                    "head": "Updated Manager"
                }
                update_success, _ = self.run_test(
                    "Update Department",
                    "PUT",
                    f"departments/{dept_id}",
                    200,
                    data=update_data
                )
                
                # Test delete department
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Department",
                        "DELETE",
                        f"departments/{dept_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_profile_endpoints(self):
        """Test profile management endpoints"""
        if not self.current_user:
            print("⚠️  Skipping profile tests - not logged in")
            return True

        # Get profile
        success, response = self.run_test(
            "Get Profile",
            "GET",
            "profile",
            200
        )
        if success:
            profile = response
            print(f"   Profile: {profile.get('name', 'Unknown')} - {profile.get('email', 'No email')}")
            
            # Test update profile (only name and mobile are typically editable)
            update_data = {
                "name": profile.get('name', 'Test User') + " Updated",
                "mobile": "9999999999"
            }
            update_success, _ = self.run_test(
                "Update Profile",
                "PUT",
                "profile",
                200,
                data=update_data
            )
            return update_success
        return success

    def test_export_endpoints(self):
        """Test CSV export endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping export tests - not HR manager")
            return True

        # Test employee export
        success1, _ = self.run_test(
            "Export Employees CSV",
            "GET",
            "export/employees",
            200
        )
        
        # Test attendance export
        success2, _ = self.run_test(
            "Export Attendance CSV",
            "GET",
            "export/attendance",
            200
        )
        
        # Test payroll export
        success3, _ = self.run_test(
            "Export Payroll CSV",
            "GET",
            "export/payroll",
            200
        )
        
        return success1 and success2 and success3

    def test_shifts_endpoints(self):
        """Test shift management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping shifts tests - not HR manager")
            return True

        # Get shifts
        success, response = self.run_test(
            "Get Shifts",
            "GET",
            "shifts",
            200
        )
        if success:
            shifts = response if isinstance(response, list) else response.get('shifts', [])
            print(f"   Found {len(shifts)} shifts")
            
            # Test create shift
            test_shift = {
                "name": f"Test Shift {datetime.now().strftime('%H%M%S')}",
                "start_time": "09:00",
                "end_time": "17:00",
                "description": "Test shift for API testing"
            }
            create_success, create_response = self.run_test(
                "Create Shift",
                "POST",
                "shifts",
                201,
                data=test_shift
            )
            
            if create_success:
                shift_id = create_response.get('id')
                print(f"   Created shift with ID: {shift_id}")
                
                # Test update shift
                update_data = {
                    "name": test_shift["name"] + " Updated",
                    "start_time": "08:00",
                    "end_time": "16:00",
                    "description": "Updated description"
                }
                update_success, _ = self.run_test(
                    "Update Shift",
                    "PUT",
                    f"shifts/{shift_id}",
                    200,
                    data=update_data
                )
                
                # Test delete shift
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Shift",
                        "DELETE",
                        f"shifts/{shift_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_designations_endpoints(self):
        """Test designation management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping designations tests - not HR manager")
            return True

        # Get designations
        success, response = self.run_test(
            "Get Designations",
            "GET",
            "designations",
            200
        )
        if success:
            designations = response if isinstance(response, list) else response.get('designations', [])
            print(f"   Found {len(designations)} designations")
            
            # Test create designation
            test_designation = {
                "name": f"Test Designation {datetime.now().strftime('%H%M%S')}",
                "description": "Test designation for API testing",
                "level": "Mid-Level"
            }
            create_success, create_response = self.run_test(
                "Create Designation",
                "POST",
                "designations",
                201,
                data=test_designation
            )
            
            if create_success:
                designation_id = create_response.get('id')
                print(f"   Created designation with ID: {designation_id}")
                
                # Test update designation
                update_data = {
                    "name": test_designation["name"] + " Updated",
                    "description": "Updated description",
                    "level": "Senior-Level"
                }
                update_success, _ = self.run_test(
                    "Update Designation",
                    "PUT",
                    f"designations/{designation_id}",
                    200,
                    data=update_data
                )
                
                # Test delete designation
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Designation",
                        "DELETE",
                        f"designations/{designation_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_salary_slabs_endpoints(self):
        """Test salary slab management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping salary slabs tests - not HR manager")
            return True

        # Get salary slabs
        success, response = self.run_test(
            "Get Salary Slabs",
            "GET",
            "salary-slabs",
            200
        )
        if success:
            slabs = response if isinstance(response, list) else response.get('salary_slabs', [])
            print(f"   Found {len(slabs)} salary slabs")
            
            # Test create salary slab
            test_slab = {
                "name": f"Test Slab {datetime.now().strftime('%H%M%S')}",
                "min_salary": 30000,
                "max_salary": 50000,
                "description": "Test salary slab for API testing"
            }
            create_success, create_response = self.run_test(
                "Create Salary Slab",
                "POST",
                "salary-slabs",
                201,
                data=test_slab
            )
            
            if create_success:
                slab_id = create_response.get('id')
                print(f"   Created salary slab with ID: {slab_id}")
                
                # Test update salary slab
                update_data = {
                    "name": test_slab["name"] + " Updated",
                    "min_salary": 35000,
                    "max_salary": 55000,
                    "description": "Updated description"
                }
                update_success, _ = self.run_test(
                    "Update Salary Slab",
                    "PUT",
                    f"salary-slabs/{slab_id}",
                    200,
                    data=update_data
                )
                
                # Test delete salary slab
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Salary Slab",
                        "DELETE",
                        f"salary-slabs/{slab_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_holidays_endpoints(self):
        """Test holiday management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping holidays tests - not HR manager")
            return True

        # Get holidays
        success, response = self.run_test(
            "Get Holidays",
            "GET",
            "holidays",
            200
        )
        if success:
            holidays = response if isinstance(response, list) else response.get('holidays', [])
            print(f"   Found {len(holidays)} holidays")
            
            # Test create holiday
            test_holiday = {
                "name": f"Test Holiday {datetime.now().strftime('%H%M%S')}",
                "date": "2024-12-25",
                "description": "Test holiday for API testing",
                "type": "public"
            }
            create_success, create_response = self.run_test(
                "Create Holiday",
                "POST",
                "holidays",
                201,
                data=test_holiday
            )
            
            if create_success:
                holiday_id = create_response.get('id')
                print(f"   Created holiday with ID: {holiday_id}")
                
                # Test update holiday
                update_data = {
                    "name": test_holiday["name"] + " Updated",
                    "date": "2024-12-26",
                    "description": "Updated description",
                    "type": "optional"
                }
                update_success, _ = self.run_test(
                    "Update Holiday",
                    "PUT",
                    f"holidays/{holiday_id}",
                    200,
                    data=update_data
                )
                
                # Test delete holiday
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Holiday",
                        "DELETE",
                        f"holidays/{holiday_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_terminations_endpoints(self):
        """Test termination management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping terminations tests - not HR manager")
            return True

        # Get terminations
        success, response = self.run_test(
            "Get Terminations",
            "GET",
            "terminations",
            200
        )
        if success:
            terminations = response if isinstance(response, list) else response.get('terminations', [])
            print(f"   Found {len(terminations)} terminations")
            
            # Test create termination
            test_termination = {
                "employee_id": "EMP001",
                "termination_type": "voluntary",
                "termination_date": "2024-12-31",
                "description": "Test termination for API testing",
                "reason": "Testing purposes"
            }
            create_success, create_response = self.run_test(
                "Create Termination",
                "POST",
                "terminations",
                201,
                data=test_termination
            )
            
            if create_success:
                termination_id = create_response.get('id')
                print(f"   Created termination with ID: {termination_id}")
                
                # Test update termination
                update_data = {
                    "employee_id": "EMP001",
                    "termination_type": "involuntary",
                    "termination_date": "2024-12-30",
                    "description": "Updated description",
                    "reason": "Updated reason"
                }
                update_success, _ = self.run_test(
                    "Update Termination",
                    "PUT",
                    f"terminations/{termination_id}",
                    200,
                    data=update_data
                )
                
                # Test delete termination
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Termination",
                        "DELETE",
                        f"terminations/{termination_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_resignations_endpoints(self):
        """Test resignation management endpoints (HR Manager only)"""
        if not self.current_user or self.current_user.get('role') != 'hr_manager':
            print("⚠️  Skipping resignations tests - not HR manager")
            return True

        # Get resignations
        success, response = self.run_test(
            "Get Resignations",
            "GET",
            "resignations",
            200
        )
        if success:
            resignations = response if isinstance(response, list) else response.get('resignations', [])
            print(f"   Found {len(resignations)} resignations")
            
            # Test create resignation
            test_resignation = {
                "employee_id": "EMP001",
                "resignation_date": "2024-12-31",
                "last_working_day": "2025-01-31",
                "reason": "Test resignation for API testing",
                "status": "pending"
            }
            create_success, create_response = self.run_test(
                "Create Resignation",
                "POST",
                "resignations",
                201,
                data=test_resignation
            )
            
            if create_success:
                resignation_id = create_response.get('id')
                print(f"   Created resignation with ID: {resignation_id}")
                
                # Test update resignation
                update_data = {
                    "employee_id": "EMP001",
                    "resignation_date": "2024-12-30",
                    "last_working_day": "2025-01-30",
                    "reason": "Updated reason",
                    "status": "approved"
                }
                update_success, _ = self.run_test(
                    "Update Resignation",
                    "PUT",
                    f"resignations/{resignation_id}",
                    200,
                    data=update_data
                )
                
                # Test delete resignation
                if update_success:
                    delete_success, _ = self.run_test(
                        "Delete Resignation",
                        "DELETE",
                        f"resignations/{resignation_id}",
                        200
                    )
                    return delete_success
                return update_success
            return create_success
        return success

    def test_notifications_endpoints(self):
        """Test notification endpoints"""
        if not self.current_user:
            print("⚠️  Skipping notifications tests - not logged in")
            return True

        # Get notifications
        success, response = self.run_test(
            "Get Notifications",
            "GET",
            "notifications",
            200
        )
        if success:
            notifications = response.get('notifications', []) if isinstance(response, dict) else []
            unread_count = response.get('unread_count', 0) if isinstance(response, dict) else 0
            print(f"   Found {len(notifications)} notifications ({unread_count} unread)")
            
            # Test mark all read
            mark_all_success, _ = self.run_test(
                "Mark All Notifications Read",
                "POST",
                "notifications/read-all",
                200
            )
            return mark_all_success
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
    
    # Test 2: HR Manager Login (should NOT require password change)
    print("\n" + "="*50)
    print("TESTING HR MANAGER FLOW")
    print("="*50)
    
    if not tester.test_login("hr@acmecorp.com", "1Akash@@", expect_first_login=False):
        print("❌ HR Manager login failed, stopping tests")
        return 1
    
    # Test dashboard after password change
    tester.test_dashboard()
    
    # Test HR-specific endpoints
    tester.test_employee_endpoints()
    tester.test_department_endpoints()
    tester.test_attendance_endpoints()
    tester.test_leave_endpoints()
    tester.test_export_endpoints()
    
    # Test new HR modules (6 new endpoints)
    tester.test_shifts_endpoints()
    tester.test_designations_endpoints()
    tester.test_salary_slabs_endpoints()
    tester.test_holidays_endpoints()
    tester.test_terminations_endpoints()
    tester.test_resignations_endpoints()
    tester.test_notifications_endpoints()
    
    tester.test_profile_endpoints()
    
    # Test logout
    tester.test_logout()
    
    # Test 3: Employee Login (should require password change)
    print("\n" + "="*50)
    print("TESTING EMPLOYEE FLOW")
    print("="*50)
    
    # Test Emily (as specified in test requirements)
    if not tester.test_login("emily@acmecorp.com", "9123456781", expect_first_login=True):
        print("❌ Employee (Emily) login failed, trying John...")
        # Fallback to John
        if not tester.test_login("john@acmecorp.com", "9123456780", expect_first_login=True):
            print("❌ Employee login failed, stopping tests")
            return 1
    
    # Test password change flow - use correct current password for Emily
    current_password = "9123456781" if "emily" in tester.current_user.get('email', '') else "9123456780"
    if not tester.test_change_password(current_password, "NewPassword123!"):
        print("❌ Employee password change failed")
        return 1
    
    # Test employee dashboard
    tester.test_dashboard()
    
    # Test employee-specific endpoints
    tester.test_attendance_endpoints()
    tester.test_leave_endpoints()
    tester.test_profile_endpoints()
    
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