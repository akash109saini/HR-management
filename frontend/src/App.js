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
import HRDashboard from './pages/HR/Dashboard';
import EmployeeManagement from './pages/HR/EmployeeManagement';
import AttendanceMgmt from './pages/HR/AttendanceMgmt';
import LeaveMgmt from './pages/HR/LeaveMgmt';
import PayrollPage from './pages/HR/PayrollPage';
import RecruitmentPage from './pages/HR/RecruitmentPage';
import PerformancePage from './pages/HR/PerformancePage';
import HRAnnouncements from './pages/HR/Announcements';
import EmpDashboard from './pages/Employee/Dashboard';
import MyAttendance from './pages/Employee/MyAttendance';
import MyLeaves from './pages/Employee/MyLeaves';
import MyPayslips from './pages/Employee/MyPayslips';
import Announcements from './pages/Employee/Announcements';

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

      {/* HR Manager */}
      <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><AttendanceMgmt /></ProtectedRoute>} />
      <Route path="/leave-management" element={<ProtectedRoute><LeaveMgmt /></ProtectedRoute>} />
      <Route path="/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
      <Route path="/recruitment" element={<ProtectedRoute><RecruitmentPage /></ProtectedRoute>} />
      <Route path="/performance" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />

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
