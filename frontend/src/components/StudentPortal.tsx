import React, { useState, useEffect } from 'react';
import {
  Play,
  ShieldCheck,
  Lock,
  BookOpen,
  AlertCircle,
  GraduationCap,
  Laptop,
  Smartphone,
  Download,
  ExternalLink,
} from 'lucide-react';
import { CurrentUser } from './Navbar';
import SecurePlayer from '../player/SecurePlayer';
import { YouTubeSecurePlayer } from '../player/YouTubeSecurePlayer';
import { generateDeviceFingerprint, getDeviceLocationCoords, detectUserOS } from '../player/security/fingerprint';
import { DownloadModal } from './DownloadModal';

export interface VideoItem {
  id: string;
  title: string;
  blobPrefix?: string;
  keyCount?: number;
  createdAt?: string;
  sourceType?: 'hls' | 'youtube';
  youtubeId?: string;
}

interface StudentPortalProps {
  currentUser: CurrentUser;
  apiBaseUrl: string;
  onLogEvent?: (msg: string, type: 'info' | 'security' | 'network' | 'success' | 'error', details?: string) => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  currentUser,
  apiBaseUrl,
  onLogEvent,
}) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const isDesktop =
    typeof window !== 'undefined' &&
    (Boolean((window as any).eduOneDesktopAPI?.isDesktop) ||
      Boolean((window as any).fonixDesktopAPI?.isDesktop) ||
      Boolean(
        navigator.userAgent &&
          (navigator.userAgent.includes('EduOneDesktop') || navigator.userAgent.includes('FonixEduDesktop'))
      ));

  const userOS = detectUserOS();
  const isMac = userOS === 'mac';
  const isIOS = userOS === 'ios';
  const isAndroid = userOS === 'android';
  const isMobile = isIOS || isAndroid;

  let appName = 'EduOne Windows App';
  let launchBtnText = 'Launch in Windows App';

  if (isMac) {
    appName = 'EduOne macOS App';
    launchBtnText = 'Launch in macOS App';
  } else if (isIOS) {
    appName = 'EduOne iOS App';
    launchBtnText = 'Open in iOS App';
  } else if (isAndroid) {
    appName = 'EduOne Android App';
    launchBtnText = 'Open in Android App';
  }

  const isWindows = !isMac && !isIOS && !isAndroid;

  const handleLaunchWindowsApp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedVideo) return;

    const deepLink = `eduone://play?videoId=${encodeURIComponent(selectedVideo.id)}&token=${encodeURIComponent(jwtToken || currentUser.token || '')}&userId=${encodeURIComponent(currentUser.userId)}&email=${encodeURIComponent(currentUser.email)}&studentId=${encodeURIComponent(currentUser.studentId || '')}&name=${encodeURIComponent(currentUser.name || '')}&sessionId=${encodeURIComponent(currentUser.sessionId || '')}`;

    let hasBlurred = false;
    const onBlur = () => {
      hasBlurred = true;
      try {
        localStorage.setItem('eduone_app_installed', 'true');
      } catch {}
    };
    window.addEventListener('blur', onBlur, { once: true });

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = deepLink;
    document.body.appendChild(iframe);

    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      try {
        document.body.removeChild(iframe);
      } catch {}

      const wasInstalled = localStorage.getItem('eduone_app_installed') === 'true';
      if (!hasBlurred && !wasInstalled) {
        const dl = document.createElement('a');
        dl.href = '/EduOne.exe';
        dl.download = 'EduOne.exe';
        document.body.appendChild(dl);
        dl.click();
        document.body.removeChild(dl);
        alert(
          'EduOne Desktop App was not detected on your PC.\n\nWe have started downloading the portable client (EduOne.exe • 570 KB).\n\nPlease click EduOne.exe in your downloads bar to launch your lecture with hardware screen blackout protection!'
        );
      }
    }, 1800);
  };

  useEffect(() => {
    const handleDeepLinkVideo = (url: string) => {
      if (!url) return;
      const match = url.match(/videoId=([^&]+)/);
      if (match && match[1]) {
        const vId = decodeURIComponent(match[1]);
        const target = videos.find((v) => v.id === vId);
        if (target) {
          setSelectedVideo(target);
        } else {
          setSelectedVideo({
            id: vId,
            title: `Lecture (${vId})`,
          });
        }
      }
    };

    if ((window as any).eduOneDesktopAPI?.onDeepLink) {
      (window as any).eduOneDesktopAPI.onDeepLink((url: string) => {
        handleDeepLinkVideo(url);
      });
    }

    if ((window as any).eduOneDeepLink) {
      handleDeepLinkVideo((window as any).eduOneDeepLink);
    }
  }, [videos]);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/upload/videos`);
        if (res.ok) {
          const data = await res.json();
          setVideos(data.videos);
          if (data.videos && data.videos.length > 0 && !selectedVideo) {
            setSelectedVideo(data.videos[0]);
          }
        }
      } catch {
        // Fallback demo videos
      }
    };

    fetchVideos();
  }, [apiBaseUrl]);

  useEffect(() => {
    generateDeviceFingerprint().then((fp) => setFingerprint(fp));
  }, []);

  useEffect(() => {
    if (!selectedVideo) {
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
          throw new Error(errData.message || 'Failed to authorize lecture access.');
        }

        const data = await res.json();
        if (isMounted) {
          setJwtToken(data.token);
          if (onLogEvent) {
            onLogEvent(`Security token issued for ${selectedVideo.id}`, 'security', `Session: ${currentUser.sessionId}`);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setTokenError(err.message || 'Error authorizing video stream.');
          if (onLogEvent) {
            onLogEvent(`Token rejected for ${selectedVideo.id}`, 'error', err.message);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingToken(false);
        }
      }
    };

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [selectedVideo, currentUser, apiBaseUrl, fingerprint, onLogEvent]);

  const isSelectedYoutube = Boolean(
    selectedVideo?.sourceType === 'youtube' ||
    selectedVideo?.blobPrefix?.startsWith('youtube:') ||
    selectedVideo?.id?.startsWith('yt_')
  );
  const selectedYoutubeId = selectedVideo?.youtubeId ||
    (selectedVideo?.blobPrefix?.startsWith('youtube:') ? selectedVideo.blobPrefix.replace('youtube:', '') : selectedVideo?.id?.startsWith('yt_') ? selectedVideo.id.replace('yt_', '') : null);

  return (
    <div className="student-portal-container">
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

      <div className="student-grid">
        <div className="student-main-content">
          <div className="player-card">
            {videos.length === 0 ? (
              <div className="player-placeholder" style={{ padding: '60px 24px' }}>
                <BookOpen size={48} className="placeholder-icon" style={{ color: '#f97316', marginBottom: '16px' }} />
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-primary)' }}>
                  No Lectures Available
                </h3>
                <p style={{ margin: 0, maxWidth: '420px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  There are currently no published lectures in your course catalog.
                </p>
              </div>
            ) : !isDesktop ? (
              <div className="player-placeholder desktop-lock-placeholder">
                <div className="lock-icon-box">
                  {isMobile ? <Smartphone size={32} /> : <Laptop size={32} />}
                </div>
                <h3 className="lock-title">
                  {appName} Required
                </h3>
                <p className="lock-description">
                  {isMobile
                    ? `To prevent unauthorized screen recording and enforce mobile DRM protection, video playback is exclusively permitted through the official ${appName}.`
                    : `To prevent screen recording and protect educational material, video playback is exclusively permitted through the official ${appName} with hardware screen protection.`}
                </p>

                <div className="lock-actions-group">
                  {selectedVideo && (
                    isWindows ? (
                      <button
                        type="button"
                        onClick={handleLaunchWindowsApp}
                        className="primary-btn lock-action-btn launch"
                        style={{ padding: '12px 28px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <ExternalLink size={18} />
                        <span>Launch in Windows App</span>
                      </button>
                    ) : (
                      <>
                        <a
                          href={`eduone://play?videoId=${encodeURIComponent(selectedVideo.id)}&token=${encodeURIComponent(jwtToken || currentUser.token || '')}&userId=${encodeURIComponent(currentUser.userId)}&email=${encodeURIComponent(currentUser.email)}&studentId=${encodeURIComponent(currentUser.studentId || '')}&name=${encodeURIComponent(currentUser.name || '')}&sessionId=${encodeURIComponent(currentUser.sessionId || '')}`}
                          className="primary-btn lock-action-btn launch"
                        >
                          <ExternalLink size={16} />
                          <span>{launchBtnText}</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => setIsDownloadModalOpen(true)}
                          className="secondary-btn lock-action-btn download"
                          style={{
                            background: 'rgba(249, 115, 22, 0.12)',
                            borderColor: 'rgba(249, 115, 22, 0.45)',
                            color: '#f97316',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Download size={16} />
                          <span>Download App (Select Edition)</span>
                        </button>
                      </>
                    )
                  )}
                </div>

                <div className="lock-security-badge">
                  <ShieldCheck size={14} color="#059669" />
                  <span>
                    {isMobile
                      ? 'Mobile DRM Active • Screen Capture Blocked • Safe Stream'
                      : 'Hardware Blackout Active • OBS Blocked • Zero Install Portable'}
                  </span>
                </div>
              </div>
            ) : selectedVideo && isSelectedYoutube && selectedYoutubeId ? (
              <YouTubeSecurePlayer
                youtubeId={selectedYoutubeId}
                userId={currentUser.studentId || currentUser.userId}
                email={currentUser.email}
                sessionId={currentUser.sessionId}
                watermarkOpacity={0.22}
              />
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
                    <p>Choose a lesson from your course catalog on the right to begin watching.</p>
                  </>
                )}
              </div>
            )}

            {selectedVideo && (
              <div className="video-meta-bar">
                <div className="video-title-group">
                  <h3>{selectedVideo.title}</h3>
                  <span className="video-id-tag">Lecture: {selectedVideo.id}</span>
                </div>
                <div className="security-status-pills">
                  <div className="sec-pill">
                    <Lock size={12} color="#ea580c" />
                    <span>{isSelectedYoutube ? 'Hardware Blackout Protected' : 'AES-128 Protected'}</span>
                  </div>
                  <div className="sec-pill">
                    <ShieldCheck size={12} color="#ea580c" />
                    <span>Forensic Watermarked</span>
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
                      onClick={() => {
                        setSelectedVideo(vid);
                      }}
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

      <DownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
      />
    </div>
  );
};

export default StudentPortal;
