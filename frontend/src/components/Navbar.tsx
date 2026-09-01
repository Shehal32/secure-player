import React from 'react';
import { ShieldCheck, ShieldAlert, User, LogOut, LogIn, ArrowLeft } from 'lucide-react';

export interface CurrentUser {
  userId: string;
  studentId?: string | null;
  name: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  sessionId: string;
  token?: string;
}

interface NavbarProps {
  currentUser: CurrentUser | null;
  isAdminRoute: boolean;
  onNavigateRoute: (route: 'student' | 'admin') => void;
  onOpenAuthModal: (initialTab?: 'student-login' | 'student-signup' | 'admin-login') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  isAdminRoute,
  onNavigateRoute,
  onOpenAuthModal,
  onLogout,
}) => {
  return (
    <header className="app-header">
      {/* Brand Logo & Context */}
      <div className="brand">
        <div className="brand-icon-wrapper">
          {isAdminRoute ? (
            <ShieldAlert size={28} className="brand-icon admin" />
          ) : (
            <ShieldCheck size={28} className="brand-icon" />
          )}
        </div>
        <div>
          <h1>{isAdminRoute ? 'EduOne SecOps Admin' : 'EduOne Learning Portal'}</h1>
          <span className="brand-subtitle">
            {isAdminRoute
              ? 'Forensic Watermarking & Stream Security Console'
              : 'Secure Video On Demand • AES-128 Protected'}
          </span>
        </div>
      </div>

      {/* Header Actions */}
      <div className="header-actions">
        {isAdminRoute ? (
          // Admin Route Header Controls
          <>
            <button
              className="secondary-btn"
              onClick={() => onNavigateRoute('student')}
              style={{ fontSize: '12px', padding: '8px 14px' }}
            >
              <ArrowLeft size={14} />
              <span>Student Portal</span>
            </button>

            {currentUser && currentUser.role === 'ADMIN' && (
              <div className="user-profile-badge">
                <div className="avatar-circle admin">
                  <ShieldAlert size={15} color="#ea580c" />
                </div>
                <div className="user-text-info">
                  <span className="user-name">SecOps Admin</span>
                  <span className="user-role-tag">{currentUser.email}</span>
                </div>
                <button
                  className="logout-action-btn"
                  onClick={onLogout}
                  title="Sign Out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </>
        ) : (
          // Student Route Header Controls
          <>
            {currentUser && currentUser.role === 'STUDENT' ? (
              <div className="user-profile-badge">
                <div className="avatar-circle">
                  <User size={15} color="#ea580c" />
                </div>
                <div className="user-text-info">
                  <span className="user-name">
                    {currentUser.studentId || currentUser.userId}
                  </span>
                  <span className="user-role-tag">
                    {currentUser.name || 'Student'}
                  </span>
                </div>
                <button
                  className="logout-action-btn"
                  onClick={onLogout}
                  title="Sign Out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button
                className="primary-btn"
                onClick={() => onOpenAuthModal('student-login')}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                <LogIn size={15} />
                <span>Student Sign In</span>
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;
