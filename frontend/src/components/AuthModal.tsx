import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  UserPlus,
  LogIn,
  Lock,
  Mail,
  User,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { CurrentUser } from './Navbar';
import { generateDeviceFingerprint } from '../player/security/fingerprint';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'student-login' | 'student-signup' | 'admin-login';
  apiBaseUrl: string;
  onAuthSuccess: (user: CurrentUser, msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'student-login',
  apiBaseUrl,
  onAuthSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'student-login' | 'student-signup' | 'admin-login'>(initialTab);

  // Student Sign In State
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [studentPassword, setStudentPassword] = useState('');

  // Student Sign Up State
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // Admin Sign In State
  const [adminEmail, setAdminEmail] = useState('admin@fonixedu.com');
  const [adminPassword, setAdminPassword] = useState('Admin@Secure2026!');

  // Status & Error
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
    setErrorMessage(null);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  // Student Login Handler
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
        },
        body: JSON.stringify({
          identifier: studentIdentifier.trim(),
          password: studentPassword,
          requiredRole: 'STUDENT',
          deviceFingerprint: fingerprint,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Login failed. Please check your credentials.');
      }

      onAuthSuccess(
        {
          userId: data.user.id,
          studentId: data.user.studentId,
          name: data.user.name,
          email: data.user.email,
          role: 'STUDENT',
          sessionId: data.sessionId,
          token: data.token,
        },
        `Logged in successfully as Student ${data.user.studentId || data.user.id}`,
      );
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Student Registration Handler
  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      const res = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
        },
        body: JSON.stringify({
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          deviceFingerprint: fingerprint,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Registration failed.');
      }

      setCreatedStudentId(data.user.studentId);

      onAuthSuccess(
        {
          userId: data.user.id,
          studentId: data.user.studentId,
          name: data.user.name,
          email: data.user.email,
          role: 'STUDENT',
          sessionId: data.sessionId,
          token: data.token,
        },
        `Account created! Welcome, Student ${data.user.studentId}`,
      );

      // Brief delay to let user see their newly generated SID
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Admin Login Handler
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
        },
        body: JSON.stringify({
          identifier: adminEmail.trim(),
          password: adminPassword,
          requiredRole: 'ADMIN',
          deviceFingerprint: fingerprint,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Admin login failed.');
      }

      onAuthSuccess(
        {
          userId: data.user.id,
          studentId: null,
          name: data.user.name,
          email: data.user.email,
          role: 'ADMIN',
          sessionId: data.sessionId,
          token: data.token,
        },
        `SecOps Administrator authenticated (${data.user.email})`,
      );
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card auth-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <Lock size={20} className="modal-sparkle" />
            <h3>FonixEdu Security Authentication</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-bar">
          <button
            className={`auth-tab-item ${activeTab === 'student-login' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('student-login');
              setErrorMessage(null);
            }}
          >
            <LogIn size={15} />
            <span>Student Sign In</span>
          </button>
          <button
            className={`auth-tab-item ${activeTab === 'student-signup' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('student-signup');
              setErrorMessage(null);
            }}
          >
            <UserPlus size={15} />
            <span>Student Sign Up</span>
          </button>
          <button
            className={`auth-tab-item ${activeTab === 'admin-login' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('admin-login');
              setErrorMessage(null);
            }}
          >
            <ShieldAlert size={15} />
            <span>Admin Portal</span>
          </button>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="auth-error-box">
            <AlertCircle size={18} color="#ef4444" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Alert with newly created Student ID */}
        {createdStudentId && (
          <div className="auth-success-box">
            <CheckCircle2 size={20} color="#10b981" />
            <div>
              <strong>Account Created Successfully!</strong>
              <div style={{ marginTop: '2px', fontSize: '13px' }}>
                Your assigned Student ID is: <code className="sid-highlight">{createdStudentId}</code>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Student Login Form */}
        {activeTab === 'student-login' && (
          <form onSubmit={handleStudentLogin} className="auth-form">
            <p className="auth-form-desc">
              Sign in with your registered email address or your assigned <strong>SID-XXXXXXXXXX</strong>.
            </p>

            <div className="form-group">
              <label>Email Address or Student ID (SID)</label>
              <div className="input-icon-wrapper">
                <Mail size={16} className="input-icon" />
                <input
                  type="text"
                  placeholder="e.g. SID-1029384756 or student@fonixedu.com"
                  value={studentIdentifier}
                  onChange={(e) => setStudentIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-icon-wrapper">
                <Lock size={16} className="input-icon" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="primary-btn auth-submit-btn">
              {isLoading ? (
                <>
                  <div className="button-spinner"></div>
                  <span>Authenticating Student...</span>
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Sign In to Student Portal</span>
                </>
              )}
            </button>

            <div className="auth-footer-prompt">
              Don't have a Student ID yet?{' '}
              <button
                type="button"
                className="inline-link-btn"
                onClick={() => setActiveTab('student-signup')}
              >
                Create an account
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Student Sign Up Form */}
        {activeTab === 'student-signup' && (
          <form onSubmit={handleStudentRegister} className="auth-form">
            <div className="sid-info-banner">
              <Sparkles size={16} color="#38bdf8" />
              <span>
                A unique 10-digit <strong>Student ID (SID-XXXXXXXXXX)</strong> will be generated for cryptographic stream watermarking upon registration.
              </span>
            </div>

            <div className="form-group">
              <label>Full Name</label>
              <div className="input-icon-wrapper">
                <User size={16} className="input-icon" />
                <input
                  type="text"
                  placeholder="e.g. Shehal Herath"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <div className="input-icon-wrapper">
                <Mail size={16} className="input-icon" />
                <input
                  type="email"
                  placeholder="e.g. student@fonixedu.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password (min 6 characters)</label>
              <div className="input-icon-wrapper">
                <Lock size={16} className="input-icon" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="primary-btn auth-submit-btn">
              {isLoading ? (
                <>
                  <div className="button-spinner"></div>
                  <span>Generating Student ID & Account...</span>
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  <span>Register & Generate Student ID</span>
                </>
              )}
            </button>

            <div className="auth-footer-prompt">
              Already have an account?{' '}
              <button
                type="button"
                className="inline-link-btn"
                onClick={() => setActiveTab('student-login')}
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Admin Portal Login Form */}
        {activeTab === 'admin-login' && (
          <form onSubmit={handleAdminLogin} className="auth-form">
            <p className="auth-form-desc">
              SecOps Administrator credentials required to package HLS video streams, run forensic leak scans, and inspect system audit logs.
            </p>

            <div className="form-group">
              <label>Admin Email</label>
              <div className="input-icon-wrapper">
                <Mail size={16} className="input-icon" />
                <input
                  type="text"
                  placeholder="admin@fonixedu.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Admin Password</label>
              <div className="input-icon-wrapper">
                <Lock size={16} className="input-icon" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Default Admin Quick-Fill Helper */}
            <div
              className="default-creds-helper"
              onClick={() => {
                setAdminEmail('admin@fonixedu.com');
                setAdminPassword('Admin@Secure2026!');
              }}
            >
              <KeyRound size={14} color="#38bdf8" />
              <div>
                <strong>Default Admin Account:</strong> <code>admin@fonixedu.com</code> / <code>Admin@Secure2026!</code>
                <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>Click to auto-fill credentials</div>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="primary-btn auth-submit-btn" style={{ marginTop: '16px' }}>
              {isLoading ? (
                <>
                  <div className="button-spinner"></div>
                  <span>Verifying Admin Rights...</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={16} />
                  <span>Sign In as Administrator</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
export default AuthModal;
