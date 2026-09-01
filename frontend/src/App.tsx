import { useState, useEffect } from 'react';
import Navbar, { CurrentUser } from './components/Navbar';
import StudentPortal from './components/StudentPortal';
import AdminPortal, { LogItem } from './components/AdminPortal';
import { generateDeviceFingerprint, getDeviceLocationCoords } from './player/security/fingerprint';
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import './App.css';

const AUTH_STORAGE_KEY = 'eduone_auth_user_v2';

export function App() {
  const apiBaseUrl = ((import.meta as any).env?.VITE_API_URL || 'https://fonixedu.southeastasia.cloudapp.azure.com/secure-api').replace(/\/+$/, '');

  // Route State: 'student' (/) vs 'admin' (/admin)
  const [currentRoute, setCurrentRoute] = useState<'student' | 'admin'>(() => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return path.includes('/admin') || hash.includes('/admin') || hash.includes('admin') ? 'admin' : 'student';
  });

  // Listen to browser popstate and URL hash changes
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.includes('/admin') || hash.includes('/admin') || hash.includes('admin')) {
        setCurrentRoute('admin');
      } else {
        setCurrentRoute('student');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateTo = (route: 'student' | 'admin') => {
    setCurrentRoute(route);
    if (route === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else {
      window.history.pushState({}, '', '/');
    }
  };

  // Auth User State
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem('fonixedu_auth_user_v2');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Embedded Auth Form States for Student
  const [studentAuthTab, setStudentAuthTab] = useState<'login' | 'signup'>('login');
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [studentAuthLoading, setStudentAuthLoading] = useState(false);
  const [studentAuthError, setStudentAuthError] = useState<string | null>(null);
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);

  // Embedded Auth Form States for Admin
  const [adminEmail, setAdminEmail] = useState('admin@eduone.com');
  const [adminPassword, setAdminPassword] = useState('Admin@Secure2026!');
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);

  // Global Security & Network Logs
  const [logs, setLogs] = useState<LogItem[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      type: 'security',
      message: 'EduOne DRM & Forensic Security Engine active.',
      details: 'AES-128 HLS Key Delivery • Dynamic HMAC Watermarking Ready',
    },
  ]);

  const addLog = (
    message: string,
    type: LogItem['type'] = 'info',
    details?: string,
  ) => {
    const item: LogItem = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      type,
      message,
      details,
    };
    setLogs((prev) => [item, ...prev.slice(0, 99)]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleAuthSuccess = (user: CurrentUser, msg: string) => {
    setCurrentUser(user);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // Ignore
    }
    addLog(
      msg,
      'success',
      `ID=${user.studentId || user.userId} • Email=${user.email} • Role=${user.role}`,
    );
  };

  const handleLogout = () => {
    const prevId = currentUser?.studentId || currentUser?.userId || 'User';
    setCurrentUser(null);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore
    }
    addLog(`Signed out session for ${prevId}`, 'info');
  };

  // Student Sign In Submit
  const handleStudentLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentAuthError(null);
    setStudentAuthLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      const coords = await getDeviceLocationCoords().catch(() => '');
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
          ...(coords ? { 'x-device-coords': coords } : {}),
        },
        body: JSON.stringify({
          identifier: studentIdentifier.trim(),
          password: studentPassword,
          requiredRole: 'STUDENT',
          deviceFingerprint: fingerprint,
          coords,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Invalid email, student ID, or password.');
      }

      handleAuthSuccess(
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
    } catch (err: any) {
      setStudentAuthError(err.message);
    } finally {
      setStudentAuthLoading(false);
    }
  };

  // Student Sign Up Submit
  const handleStudentSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentAuthError(null);
    setStudentAuthLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      const coords = await getDeviceLocationCoords().catch(() => '');
      const res = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
          ...(coords ? { 'x-device-coords': coords } : {}),
        },
        body: JSON.stringify({
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          deviceFingerprint: fingerprint,
          coords,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Registration failed.');
      }

      setCreatedStudentId(data.user.studentId);

      handleAuthSuccess(
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
    } catch (err: any) {
      setStudentAuthError(err.message);
    } finally {
      setStudentAuthLoading(false);
    }
  };

  // Admin Login Submit
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError(null);
    setAdminAuthLoading(true);

    try {
      const fingerprint = await generateDeviceFingerprint();
      const coords = await getDeviceLocationCoords().catch(() => '');
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
          ...(coords ? { 'x-device-coords': coords } : {}),
        },
        body: JSON.stringify({
          identifier: adminEmail.trim(),
          password: adminPassword,
          requiredRole: 'ADMIN',
          deviceFingerprint: fingerprint,
          coords,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Administrator authentication failed.');
      }

      handleAuthSuccess(
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
    } catch (err: any) {
      setAdminAuthError(err.message);
    } finally {
      setAdminAuthLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Clean Navbar */}
      <Navbar
        currentUser={currentUser}
        isAdminRoute={currentRoute === 'admin'}
        onNavigateRoute={navigateTo}
        onOpenAuthModal={() => {}}
        onLogout={handleLogout}
      />

      {/* Main View Router */}
      <main className="portal-content-body">
        {currentRoute === 'admin' ? (
          // ==================== ADMIN ROUTE (/admin) ====================
          currentUser && currentUser.role === 'ADMIN' ? (
            <AdminPortal
              currentUser={currentUser}
              apiBaseUrl={apiBaseUrl}
              logs={logs}
              onClearLogs={handleClearLogs}
              onLogEvent={addLog}
            />
          ) : (
            // Dedicated Admin Login Card
            <div className="single-auth-card">
              <div className="auth-card-header">
                <div className="avatar-circle admin" style={{ width: '40px', height: '40px', margin: '0 auto 12px auto' }}>
                  <ShieldAlert size={22} color="#ea580c" />
                </div>
                <h2>SecOps Administrator Login</h2>
                <p>Authorized personnel only. Access video packaging studio and forensic leak inspection.</p>
              </div>

              {adminAuthError && (
                <div className="auth-error-box">
                  <AlertCircle size={18} color="#dc2626" />
                  <span>{adminAuthError}</span>
                </div>
              )}

              <form onSubmit={handleAdminLoginSubmit} className="auth-form">
                <div className="form-group">
                  <label>Admin Email</label>
                  <div className="input-icon-wrapper">
                    <Mail size={16} className="input-icon" />
                    <input
                      type="text"
                      placeholder="admin@eduone.com"
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
                    setAdminEmail('admin@eduone.com');
                    setAdminPassword('Admin@Secure2026!');
                  }}
                >
                  <KeyRound size={14} color="#ea580c" />
                  <div>
                    <strong>Default Credentials:</strong> <code>admin@eduone.com</code> / <code>Admin@Secure2026!</code>
                    <div style={{ fontSize: '11px', color: '#ea580c', marginTop: '2px' }}>Click here to auto-fill</div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={adminAuthLoading}
                  className="primary-btn auth-submit-btn"
                  style={{ marginTop: '14px' }}
                >
                  {adminAuthLoading ? (
                    <>
                      <div className="button-spinner"></div>
                      <span>Verifying Administrator...</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={16} />
                      <span>Sign In to Admin Portal</span>
                    </>
                  )}
                </button>
              </form>

              <div className="auth-footer-prompt" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="inline-link-btn"
                  onClick={() => navigateTo('student')}
                >
                  ← Return to Student Portal
                </button>
              </div>
            </div>
          )
        ) : (
          // ==================== STUDENT ROUTE (/) ====================
          currentUser && currentUser.role === 'STUDENT' ? (
            <StudentPortal
              currentUser={currentUser}
              apiBaseUrl={apiBaseUrl}
              onLogEvent={addLog}
            />
          ) : (
            // Clean Embedded Student Authentication Card
            <div className="single-auth-card">
              {/* Tabs: Sign In vs Sign Up */}
              <div className="auth-tab-bar">
                <button
                  className={`auth-tab-item ${studentAuthTab === 'login' ? 'active' : ''}`}
                  onClick={() => {
                    setStudentAuthTab('login');
                    setStudentAuthError(null);
                  }}
                >
                  <LogIn size={15} />
                  <span>Student Sign In</span>
                </button>
                <button
                  className={`auth-tab-item ${studentAuthTab === 'signup' ? 'active' : ''}`}
                  onClick={() => {
                    setStudentAuthTab('signup');
                    setStudentAuthError(null);
                  }}
                >
                  <UserPlus size={15} />
                  <span>Create Account</span>
                </button>
              </div>

              {studentAuthError && (
                <div className="auth-error-box">
                  <AlertCircle size={18} color="#dc2626" />
                  <span>{studentAuthError}</span>
                </div>
              )}

              {createdStudentId && (
                <div className="auth-success-box">
                  <CheckCircle2 size={20} color="#047857" />
                  <div>
                    <strong>Welcome to EduOne!</strong>
                    <div style={{ marginTop: '2px', fontSize: '13px' }}>
                      Your assigned Student ID is: <code className="sid-highlight">{createdStudentId}</code>
                    </div>
                  </div>
                </div>
              )}

              {studentAuthTab === 'login' ? (
                <form onSubmit={handleStudentLoginSubmit} className="auth-form">
                  <p className="auth-form-desc">
                    Sign in with your email address or your 10-digit <strong>SID-XXXXXXXXXX</strong> to access your course lectures.
                  </p>

                  <div className="form-group">
                    <label>Email Address or Student ID (SID)</label>
                    <div className="input-icon-wrapper">
                      <Mail size={16} className="input-icon" />
                      <input
                        type="text"
                        placeholder="e.g. SID-4820194820 or student@eduone.com"
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

                  <button
                    type="submit"
                    disabled={studentAuthLoading}
                    className="primary-btn auth-submit-btn"
                  >
                    {studentAuthLoading ? (
                      <>
                        <div className="button-spinner"></div>
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <LogIn size={16} />
                        <span>Sign In</span>
                      </>
                    )}
                  </button>

                  <div className="auth-footer-prompt">
                    Need a new student account?{' '}
                    <button
                      type="button"
                      className="inline-link-btn"
                      onClick={() => {
                        setStudentAuthTab('signup');
                        setStudentAuthError(null);
                      }}
                    >
                      Sign Up & Get Student ID
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleStudentSignupSubmit} className="auth-form">
                  <div className="sid-info-banner">
                    <Sparkles size={16} color="#ea580c" />
                    <span>
                      A unique 10-digit <strong>Student ID (SID-XXXXXXXXXX)</strong> will be generated for cryptographic stream watermarking.
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
                        placeholder="e.g. student@eduone.com"
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

                  <button
                    type="submit"
                    disabled={studentAuthLoading}
                    className="primary-btn auth-submit-btn"
                  >
                    {studentAuthLoading ? (
                      <>
                        <div className="button-spinner"></div>
                        <span>Creating Account...</span>
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
                      onClick={() => {
                        setStudentAuthTab('login');
                        setStudentAuthError(null);
                      }}
                    >
                      Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        )}
      </main>

      {/* Subtle Footer */}
      <footer className="app-footer">
        <span>EduOne SecureStream Protected Video Delivery Engine</span>
        {currentRoute !== 'admin' && (
          <button
            className="footer-admin-link"
            onClick={() => navigateTo('admin')}
          >
            SecOps Admin Access (/admin)
          </button>
        )}
      </footer>
    </div>
  );
}

export default App;
