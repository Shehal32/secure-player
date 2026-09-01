import React, { useState, useEffect } from 'react';
import {
  Play,
  ShieldCheck,
  Lock,
  BookOpen,
  AlertCircle,
  GraduationCap,
  Laptop,
  Download,
  ExternalLink,
} from 'lucide-react';
import { CurrentUser } from './Navbar';
import SecurePlayer from '../player/SecurePlayer';
import { generateDeviceFingerprint, getDeviceLocationCoords, detectUserOS } from '../player/security/fingerprint';

export interface VideoItem {
  id: string;
  title: string;
  blobPrefix?: string;
  keyCount?: number;
  createdAt?: string;
}

interface StudentPortalProps {
  currentUser: CurrentUser;
  apiBaseUrl: string;
  onLogEvent?: (msg: string, type: 'info' | 'security' | 'network' | 'success' | 'error', details?: string) => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  currentUser,
  apiBaseUrl,
}) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');

  const isDesktop =
    typeof window !== 'undefined' &&
    (Boolean((window as any).fonixDesktopAPI?.isDesktop) ||
      Boolean(navigator.userAgent && navigator.userAgent.includes('FonixEduDesktop')));

  const userOS = detectUserOS();
  const isMac = userOS === 'mac';
  const appName = isMac ? 'FonixEdu macOS App' : 'FonixEdu Windows App';
  const downloadUrl = isMac ? '/FonixEdu-SecurePlayer.dmg' : '/FonixEdu-SecurePlayer-Setup.exe';
  const downloadFileName = isMac ? 'FonixEdu-SecurePlayer.dmg' : 'FonixEdu-SecurePlayer-Setup.exe';
  const downloadBtnText = isMac ? 'Download Mac App (.dmg)' : 'Download Portable (.exe)';
  const launchBtnText = isMac ? 'Launch in macOS App' : 'Launch in Windows App';

  // Deep link listener if running inside Electron
  useEffect(() => {
    if ((window as any).fonixDesktopAPI?.onDeepLink) {
      (window as any).fonixDesktopAPI.onDeepLink((url: string) => {
        const match = url.match(/videoId=([^&]+)/);
        if (match && match[1]) {
          const target = videos.find((v) => v.id === match[1]);
          if (target) setSelectedVideo(target);
        }
      });
    }
  }, [videos]);

  // Compute device fingerprint on mount
  useEffect(() => {
    generateDeviceFingerprint().then(setFingerprint);
  }, []);

  // Fetch list of available videos from backend
  const fetchVideos = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/upload/videos`);
      if (res.ok) {
        const data = await res.json();
        if (data.videos && Array.isArray(data.videos)) {
          setVideos(data.videos);
          if (data.videos.length > 0) {
            setSelectedVideo((prev) => (prev && data.videos.some((v: any) => v.id === prev.id) ? prev : data.videos[0]));
          } else {
            setSelectedVideo(null);
            setJwtToken(null);
          }
          return;
        }
      }
    } catch {
      // Ignore network errors
    }
    setVideos([]);
    setSelectedVideo(null);
    setJwtToken(null);
  };

  useEffect(() => {
    fetchVideos();
  }, [apiBaseUrl]);

  // Request stream token when video or student changes
  useEffect(() => {
    if (!selectedVideo || !fingerprint) {
      setJwtToken(null);
      return;
    }

    let isMounted = true;
    const fetchToken = async () => {
      setIsLoadingToken(true);
      setTokenError(null);
      try {
        const coords = await getDeviceLocationCoords().catch(() => '');
        const res = await fetch(`${apiBaseUrl}/auth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-device-fingerprint': fingerprint,
            ...(coords ? { 'x-device-coords': coords } : {}),
          },
          body: JSON.stringify({
            userId: currentUser.userId,
            email: currentUser.email,
            videoId: selectedVideo.id,
            sessionId: currentUser.sessionId,
            deviceFingerprint: fingerprint,
            coords,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Unable to start lecture session`);
        }

        const data = await res.json();
        if (isMounted) {
          setJwtToken(data.token);
        }
      } catch (err: any) {
        if (isMounted) {
          setTokenError(err.message || 'Unable to load stream session');
        }
      } finally {
        if (isMounted) setIsLoadingToken(false);
      }
    };

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [currentUser.userId, currentUser.email, currentUser.sessionId, selectedVideo?.id, fingerprint, apiBaseUrl]);

  return (
    <div className="student-portal-container">
      {/* Student Welcome Banner */}
      <div className="student-welcome-banner">
        <div className="welcome-left">
          <div className="enrolled-badge">
            <GraduationCap size={14} color="#059669" />
            <span>Enrolled Student Portal</span>
          </div>
          <h2>Welcome, {currentUser.name || 'Student'}</h2>
          <p>
            Access your encrypted course lectures below. All video content is personalized and protected with AES-128 stream encryption.
          </p>
        </div>
        <div className="welcome-right">
          <div className="session-info-card">
            <span className="session-label">ASSIGNED STUDENT ID</span>
            <code className="session-id">{currentUser.studentId || currentUser.userId}</code>
            <span className="session-email">{currentUser.email}</span>
          </div>
        </div>
      </div>

      {/* Main Learning Grid: Video Player + Course Catalog */}
      <div className="student-grid">
        {/* Left Column: Secure Video Player */}
        <div className="student-main-content">
          <div className="player-card">
            {videos.length === 0 ? (
              <div className="player-placeholder" style={{ padding: '60px 24px' }}>
                <BookOpen size={48} className="placeholder-icon" style={{ color: '#f97316', marginBottom: '16px' }} />
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-primary)' }}>
                  No Lectures Available
                </h3>
                <p style={{ margin: 0, maxWidth: '420px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  There are currently no published lectures in your course catalog. Please check back later or contact your instructor.
                </p>
              </div>
            ) : !isDesktop ? (
              <div
                className="player-placeholder"
                style={{
                  padding: '50px 30px',
                  background: 'radial-gradient(circle at center, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 1))',
                  textAlign: 'center',
                  minHeight: '440px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '16px',
                    background: 'rgba(249, 115, 22, 0.15)',
                    border: '1px solid rgba(249, 115, 22, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f97316',
                    marginBottom: '20px',
                  }}
                >
                  <Laptop size={36} />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px 0', color: '#f8fafc' }}>
                  {appName} Required
                </h3>
                <p style={{ maxWidth: '480px', margin: '0 0 24px 0', color: '#94a3b8', fontSize: '13.5px', lineHeight: 1.6 }}>
                  To prevent screen recording and protect educational material, video playback is exclusively permitted through the official <strong>{appName}</strong> with hardware screen protection.
                </p>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {selectedVideo && (
                    <a
                      href={`fonixedu://play?videoId=${selectedVideo.id}`}
                      className="primary-btn"
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #ea580c, #f97316)',
                        boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                      }}
                    >
                      <ExternalLink size={16} />
                      <span>{launchBtnText}</span>
                    </a>
                  )}
                  <a
                    href={downloadUrl}
                    download={downloadFileName}
                    className="secondary-btn"
                    style={{
                      padding: '12px 22px',
                      fontSize: '14px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <Download size={16} />
                    <span>{downloadBtnText}</span>
                  </a>
                </div>

                <div style={{ marginTop: '24px', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} color="#059669" />
                  <span>Hardware Blackout Active • OBS Blocked • Zero Install Portable</span>
                </div>
              </div>
            ) : selectedVideo && jwtToken ? (
              <SecurePlayer
                videoId={selectedVideo.id}
                jwtToken={jwtToken}
                userId={currentUser.studentId || currentUser.userId}
                email={currentUser.email}
                sessionId={currentUser.sessionId}
                apiBaseUrl={apiBaseUrl}
                watermarkOpacity={0.16}
                autoPlay={false}
              />
            ) : (
              <div className="player-placeholder">
                {isLoadingToken ? (
                  <>
                    <div className="button-spinner" style={{ width: '28px', height: '28px', borderTopColor: '#f97316' }}></div>
                    <h3 style={{ marginTop: '16px', color: 'var(--text-primary)' }}>Preparing Protected Stream...</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Securing key exchange and loading lecture content.</p>
                  </>
                ) : tokenError ? (
                  <>
                    <AlertCircle size={36} color="#ef4444" />
                    <h3 style={{ color: '#dc2626', marginTop: '16px' }}>Lecture Unavailable</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>{tokenError}</p>
                  </>
                ) : (
                  <>
                    <BookOpen size={36} className="placeholder-icon" />
                    <h3>Select a Lecture to Begin</h3>
                    <p>Choose a lesson from your course catalog on the right to start watching.</p>
                  </>
                )}
              </div>
            )}

            {/* Video Meta Bar */}
            {selectedVideo && videos.length > 0 && (
              <div className="video-meta-bar">
                <div className="video-title-group">
                  <h3>{selectedVideo.title}</h3>
                  <span className="video-id-tag">Lecture: {selectedVideo.id}</span>
                </div>
                <div className="security-status-pills">
                  <div className="sec-pill">
                    <Lock size={12} color="#ea580c" />
                    <span>AES-128 Protected</span>
                  </div>
                  <div className="sec-pill">
                    <ShieldCheck size={12} color="#ea580c" />
                    <span>Encrypted Delivery</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Clean Student Protection Notice */}
          <div className="student-notice-card">
            <ShieldCheck size={20} className="notice-icon" />
            <div>
              <h4>Educational Content Protection Notice</h4>
              <p>
                All course lectures and learning materials are cryptographically protected and licensed exclusively for your student account ({currentUser.studentId || currentUser.userId}).
                Unauthorized recording, distribution, or sharing is strictly prohibited.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Course Lectures Catalog */}
        <aside className="student-sidebar">
          <div className="catalog-card">
            <div className="catalog-header">
              <BookOpen size={18} className="catalog-icon" />
              <h3>Course Lectures ({videos.length})</h3>
            </div>

            <div className="lessons-list">
              {videos.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '24px 16px', textAlign: 'center' }}>
                  No published lectures available.
                </div>
              ) : (
                videos.map((vid, idx) => {
                  const isSelected = selectedVideo?.id === vid.id;
                  return (
                    <div
                      key={vid.id}
                      className={`lesson-item ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedVideo(vid)}
                    >
                      <div className="lesson-number">
                        {isSelected ? <Play size={14} fill="#ea580c" color="#ea580c" /> : idx + 1}
                      </div>
                      <div className="lesson-details">
                        <span className="lesson-title">{vid.title}</span>
                        <div className="lesson-meta-row">
                          <span className="lesson-badge">Lesson {idx + 1}</span>
                          <span className="lesson-id">{vid.id}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default StudentPortal;
