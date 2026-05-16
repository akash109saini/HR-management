import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, Building2, Users, Clock, CalendarDays, DollarSign,
  Briefcase, Star, Megaphone, LogOut, Sun, Moon, ChevronLeft, ChevronRight, Menu, X,
  Building, UserCircle, FileDown, Timer, Award, Layers, Calendar, UserX, UserMinus,
  Shield, ClipboardCheck, CreditCard, Settings2, PiggyBank, KeyRound, Sparkles
} from 'lucide-react';
import { Button } from '../components/ui/button';

const navConfig = {
  super_admin: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Tenants', path: '/tenants', icon: Building2 },
    { label: 'Advance Salary', path: '/advance-salary', icon: PiggyBank },
    { label: 'Security', path: '/security-settings', icon: KeyRound },
    { label: 'Profile', path: '/profile', icon: UserCircle },
  ],
  hr_manager: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Employees', path: '/employees', icon: Users },
    { label: 'Departments', path: '/departments', icon: Building },
    { label: 'Designations', path: '/designations', icon: Award },
    { label: 'Shifts', path: '/shifts', icon: Timer },
    { label: 'Salary Slabs', path: '/salary-slabs', icon: Layers },
    { label: 'Attendance', path: '/attendance', icon: Clock },
    { label: 'Leave Mgmt', path: '/leave-management', icon: CalendarDays },
    { label: 'Leave Settings', path: '/leave-settings', icon: Settings2 },
    { label: 'Holidays', path: '/holidays', icon: Calendar },
    { label: 'Payroll', path: '/payroll', icon: DollarSign },
    { label: 'Advance Salary', path: '/advance-salary', icon: PiggyBank },
    { label: 'Recruitment', path: '/recruitment', icon: Briefcase },
    { label: 'Performance', path: '/performance', icon: Star },
    { label: 'Onboarding', path: '/onboarding', icon: ClipboardCheck },
    { label: 'Terminations', path: '/terminations', icon: UserX },
    { label: 'Resignations', path: '/resignations', icon: UserMinus },
    { label: 'Roles & Users', path: '/roles-users', icon: Shield },
    { label: 'Announcements', path: '/announcements', icon: Megaphone },
    { label: 'AI Assistant', path: '/ai-assistant', icon: Sparkles },
    { label: 'Billing', path: '/billing', icon: CreditCard },
    { label: 'Profile', path: '/profile', icon: UserCircle },
  ],
  employee: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Attendance', path: '/my-attendance', icon: Clock },
    { label: 'Leaves', path: '/my-leaves', icon: CalendarDays },
    { label: 'Payslips', path: '/my-payslips', icon: DollarSign },
    { label: 'AI Assistant', path: '/ai-assistant', icon: Sparkles },
    { label: 'Announcements', path: '/announcements', icon: Megaphone },
    { label: 'Profile', path: '/profile', icon: UserCircle },
  ],
};

export default function Sidebar({ collapsed, setCollapsed }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role || 'employee';
  const items = navConfig[role] || [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const renderSidebarContent = (prefix = '') => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground font-bold text-sm font-['Outfit']">HR</span>
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight font-['Outfit'] text-foreground">
            WorkForce
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`
            }
            data-testid={`${prefix}nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <item.icon size={18} className="flex-shrink-0" />
            {(!collapsed || prefix === 'mobile-') && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start gap-3 text-muted-foreground"
          data-testid={`${prefix}theme-toggle-btn`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {(!collapsed || prefix === 'mobile-') && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-destructive hover:text-destructive"
          data-testid={`${prefix}logout-btn`}
        >
          <LogOut size={18} />
          {(!collapsed || prefix === 'mobile-') && <span>Logout</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-card border border-border"
        onClick={() => setMobileOpen(!mobileOpen)}
        data-testid="mobile-menu-btn"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-64 bg-card border-r border-border z-50 transform transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {renderSidebarContent('mobile-')}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen bg-card border-r border-border transition-all duration-300 relative z-30 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {renderSidebarContent('')}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -right-3 z-40 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
          data-testid="collapse-sidebar-btn"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>
    </>
  );
}
