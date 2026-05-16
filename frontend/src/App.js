import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';

// Pages
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SADashboard from './pages/SuperAdmin/Dashboard';
import TenantManagement from './pages/SuperAdmin/TenantManagement';
import SecuritySettings from './pages/SuperAdmin/SecuritySettings';
import AIAssistantPage from './pages/AIAssistantPage';
import BlockchainCredentialsPage from './pages/BlockchainCredentialsPage';
import WhatsAppAdminPage from './pages/WhatsAppAdminPage';
import SentimentDashboardPage from './pages/SentimentDashboardPage';
import DemoSeederPage from './pages/SuperAdmin/DemoSeederPage';
import BiometricDevicesPage from './pages/BiometricDevicesPage';
import AttritionDashboardPage from './pages/AttritionDashboardPage';
import TeamCalendarPage from './pages/TeamCalendarPage';
import HRDashboard from './pages/HR/Dashboard';
import EmployeeManagement from './pages/HR/EmployeeManagement';
import AttendanceMgmt from './pages/HR/AttendanceMgmt';
import LeaveMgmt from './pages/HR/LeaveMgmt';
import LeaveSettings from './pages/HR/LeaveSettings';
import PayrollPage from './pages/HR/PayrollPage';
import RecruitmentPage from './pages/HR/RecruitmentPage';
import PerformancePage from './pages/HR/PerformancePage';
import HRAnnouncements from './pages/HR/Announcements';
import DepartmentManagement from './pages/HR/DepartmentManagement';
import ShiftManagement from './pages/HR/ShiftManagement';
import DesignationManagement from './pages/HR/DesignationManagement';
import SalarySlabManagement from './pages/HR/SalarySlabManagement';
import HolidayManagement from './pages/HR/HolidayManagement';
import TerminationManagement from './pages/HR/TerminationManagement';
import ResignationManagement from './pages/HR/ResignationManagement';
import RolesUsersManagement from './pages/HR/RolesUsersManagement';
import OnboardingPage from './pages/HR/OnboardingPage';
import BillingPage from './pages/HR/BillingPage';
import AdvanceSalary from './pages/HR/AdvanceSalary';
import EmpDashboard from './pages/Employee/Dashboard';
import MyAttendance from './pages/Employee/MyAttendance';
import MyLeaves from './pages/Employee/MyLeaves';
import MyPayslips from './pages/Employee/MyPayslips';
import Announcements from './pages/Employee/Announcements';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.first_login) return <Navigate to="/change-password" replace />;
  return children;
}

function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case 'super_admin': return <SADashboard />;
    case 'hr_manager': return <HRDashboard />;
    case 'employee': return <EmpDashboard />;
    default: return <Navigate to="/login" replace />;
  }
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user && !user.first_login ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/change-password" element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />

      {/* Super Admin */}
      <Route path="/tenants" element={<ProtectedRoute><TenantManagement /></ProtectedRoute>} />
      <Route path="/security-settings" element={<ProtectedRoute><SecuritySettings /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistantPage /></ProtectedRoute>} />
      <Route path="/blockchain-credentials" element={<ProtectedRoute><BlockchainCredentialsPage /></ProtectedRoute>} />
      <Route path="/whatsapp-admin" element={<ProtectedRoute><WhatsAppAdminPage /></ProtectedRoute>} />
      <Route path="/sentiment-dashboard" element={<ProtectedRoute><SentimentDashboardPage /></ProtectedRoute>} />
      <Route path="/demo-seeder" element={<ProtectedRoute><DemoSeederPage /></ProtectedRoute>} />
      <Route path="/biometric-devices" element={<ProtectedRoute><BiometricDevicesPage /></ProtectedRoute>} />
      <Route path="/attrition-dashboard" element={<ProtectedRoute><AttritionDashboardPage /></ProtectedRoute>} />
      <Route path="/team-calendar" element={<ProtectedRoute><TeamCalendarPage /></ProtectedRoute>} />

      {/* HR Manager */}
      <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
      <Route path="/departments" element={<ProtectedRoute><DepartmentManagement /></ProtectedRoute>} />
      <Route path="/designations" element={<ProtectedRoute><DesignationManagement /></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute><ShiftManagement /></ProtectedRoute>} />
      <Route path="/salary-slabs" element={<ProtectedRoute><SalarySlabManagement /></ProtectedRoute>} />
      <Route path="/holidays" element={<ProtectedRoute><HolidayManagement /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><AttendanceMgmt /></ProtectedRoute>} />
      <Route path="/leave-management" element={<ProtectedRoute><LeaveMgmt /></ProtectedRoute>} />
      <Route path="/leave-settings" element={<ProtectedRoute><LeaveSettings /></ProtectedRoute>} />
      <Route path="/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
      <Route path="/recruitment" element={<ProtectedRoute><RecruitmentPage /></ProtectedRoute>} />
      <Route path="/performance" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />
      <Route path="/terminations" element={<ProtectedRoute><TerminationManagement /></ProtectedRoute>} />
      <Route path="/resignations" element={<ProtectedRoute><ResignationManagement /></ProtectedRoute>} />
      <Route path="/roles-users" element={<ProtectedRoute><RolesUsersManagement /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      <Route path="/advance-salary" element={<ProtectedRoute><AdvanceSalary /></ProtectedRoute>} />

      {/* Profile - accessible to all roles */}
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

      {/* Shared - Announcements (HR can manage, Employee can view) */}
      <Route path="/announcements" element={
        <ProtectedRoute>
          <AnnouncementRouter />
        </ProtectedRoute>
      } />

      {/* Employee */}
      <Route path="/my-attendance" element={<ProtectedRoute><MyAttendance /></ProtectedRoute>} />
      <Route path="/my-leaves" element={<ProtectedRoute><MyLeaves /></ProtectedRoute>} />
      <Route path="/my-payslips" element={<ProtectedRoute><MyPayslips /></ProtectedRoute>} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AnnouncementRouter() {
  const { user } = useAuth();
  if (user?.role === 'hr_manager' || user?.role === 'super_admin') return <HRAnnouncements />;
  return <Announcements />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
