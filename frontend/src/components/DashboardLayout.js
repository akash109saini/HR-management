import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();

  const roleLabel = {
    super_admin: 'Super Admin',
    hr_manager: 'HR Manager',
    employee: 'Employee',
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="relative flex-shrink-0">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card/70 backdrop-blur-xl flex-shrink-0">
          <div className="md:hidden w-10" /> {/* spacer for mobile menu button */}
          <div className="hidden md:block">
            <span className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">
              {roleLabel[user?.role] || 'Dashboard'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground leading-none" data-testid="user-name-display">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
            </div>
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
