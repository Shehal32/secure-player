import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Check,
  ChevronRight,
} from 'lucide-react';
import { SecurePlayerProps, PlaybackState } from './types';
import { WatermarkOverlay } from './WatermarkOverlay';
import { generateDeviceFingerprint } from './security/fingerprint';
import { defaultScreenCaptureGuard } from './security/screen-capture';
import './SecurePlayer.css';

export const SecurePlayer: React.FC<SecurePlayerProps> = ({
  videoId,
  jwtToken,
  apiBaseUrl,
  autoPlay = true,
  userId,
  email,
  sessionId,
  watermarkText,
  watermarkOpacity = 0.16,
  onError,
  onReady,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  // Keep callback refs stable to avoid re-triggering HLS initialization effect
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  const [fingerprint, setFingerprint] = useState<string>('');
  const [isScreenMasked, setIsScreenMasked] = useState<boolean>(false);

  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    isMuted: false,
    isFullscreen: false,
    isBuffering: false,
    currentLevel: -1,
    levels: [],
  });

  const [showControls, setShowControls] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Playback Settings Menu State (Quality & Speed)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'quality' | 'speed'>('main');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedQualityId, setSelectedQualityId] = useState<number>(-1);
  const [selectedQualityLabel, setSelectedQualityLabel] = useState<string>('Auto');

  // Close settings popup on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showSettingsMenu]);

  const handleQualitySelect = (levelId: number) => {
    if (hlsRef.current) {
      const availableLevels = hlsRef.current.levels?.length || 0;
      if (levelId === -1) {
        hlsRef.current.currentLevel = -1; // Auto (ABR)
      } else if (levelId >= 0 && levelId < availableLevels) {
        hlsRef.current.currentLevel = levelId;
      } else if (availableLevels > 0) {
        hlsRef.current.currentLevel = 0;
      }
    }
    setState((prev) => ({ ...prev, currentLevel: levelId }));
    setShowSettingsMenu(false);
  };

  const handleSpeedSelect = (speed: number) => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
    setShowSettingsMenu(false);
  };

  // 1. Generate client-side device fingerprint on mount
  useEffect(() => {
    generateDeviceFingerprint().then((fp) => {
      setFingerprint(fp);
    });
  }, []);

  // 2. Initialize Screen Capture and Developer Tools guards
  useEffect(() => {
    // Anti-Debugging Trap: Pauses execution if DevTools is opened
    const devtoolsTrap = setInterval(() => {
      // eslint-disable-next-line no-debugger
      debugger;
    }, 2000);

    const unbind = defaultScreenCaptureGuard.startMonitoring((guardState) => {
      // If user switches away from the window or takes screenshot
      setIsScreenMasked(guardState.isCaptured);
    });

    // Disable Right-Click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Disable common DevTools keyboard shortcuts & enable F for Fullscreen
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Mac (Cmd+Opt+I)
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u')) ||
        (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i'))
      ) {
        e.preventDefault();
      }

      // F key shortcut for Fullscreen
      if (e.key === 'f' || e.key === 'F') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(devtoolsTrap);
      unbind();
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Construct the playlist URL using apiBaseUrl or relative path
  const base = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, '') : '';
  const queryParams = new URLSearchParams();
  if (jwtToken) queryParams.set('jwt', jwtToken);
  if (sessionId) queryParams.set('sessionId', sessionId);
  if (fingerprint) queryParams.set('fp', fingerprint);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const playlistUrl = `${base}/playlist/${encodeURIComponent(videoId)}${queryString}`;

  // Initialize HLS.js instance
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoId || !fingerprint) return;

    setErrorMessage(null);

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        fragLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
        autoStartLoad: true,
        xhrSetup: (xhr: any, url: string) => {
          // Do not send custom Auth headers to Azure Blob Storage (.ts media segments)
          // Azure Blob Storage uses SAS signatures in query params and rejects Bearer headers with HTTP 400
          const isStorageUrl =
            url.includes('blob.core.windows.net') ||
            url.includes('.ts?') ||
            url.endsWith('.ts');

          if (!isStorageUrl) {
            if (fingerprint) {
              xhr.setRequestHeader('x-device-fingerprint', fingerprint);
            }
            if (jwtToken) {
              xhr.setRequestHeader('Authorization', `Bearer ${jwtToken}`);
            }
            if (userId) {
              xhr.setRequestHeader('x-user-id', userId);
            }
          }
        },
      } as unknown as Partial<Hls['config']>);

      hlsRef.current = hls;

      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const parsedLevels = data.levels.map((lvl, idx) => ({
          id: idx,
          height: lvl.height,
          bitrate: lvl.bitrate,
          label: lvl.height ? `${lvl.height}p` : (data.levels.length === 1 ? '1080p Full HD' : `Stream ${idx + 1}`),
        }));

        setState((prev) => ({
          ...prev,
          levels: parsedLevels,
          currentLevel: hls.currentLevel,
        }));

        if (autoPlay) {
          video.play().catch(() => {
            // Autoplay with audio was blocked by browser; try muted autoplay
            video.muted = true;
            setState((prev) => ({ ...prev, isMuted: true }));
            video.play().catch(() => {
              setState((prev) => ({ ...prev, isPlaying: false }));
            });
          });
        }

        if (onReadyRef.current) {
          onReadyRef.current();
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setState((prev) => ({ ...prev, currentLevel: data.level }));
      });

      hls.on(Hls.Events.KEY_LOADED, () => {
        // Key securely loaded silently in memory
      });

      // Error handler with security status detection
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              const responseCode = data.response?.code;
              if (responseCode === 401) {
                setErrorMessage(
                  'Playback Stopped: Your account was signed in on another device (concurrent session limit reached).',
                );
              } else if (responseCode === 403) {
                setErrorMessage(
                  'Access Denied: Device fingerprint mismatch or unentitled playback attempt.',
                );
              } else if (retryCount < 2) {
                setRetryCount((prev) => prev + 1);
                hls.startLoad();
              } else {
                setErrorMessage('Stream connection error. Please refresh or verify your network.');
              }

              if (onErrorRef.current) onErrorRef.current({ type: data.type, details: data.details, fatal: data.fatal });
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setErrorMessage('Unrecoverable playback error occurred.');
              hls.destroy();
              if (onErrorRef.current) onErrorRef.current({ type: data.type, details: data.details, fatal: data.fatal });
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS for Safari / iOS
      video.src = playlistUrl;
      video.addEventListener('loadedmetadata', () => {
        if (autoPlay) video.play().catch(() => {});
        if (onReadyRef.current) onReadyRef.current();
      });
    } else {
      setErrorMessage('HLS playback is not supported in this browser.');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playlistUrl, videoId, jwtToken, fingerprint, sessionId, autoPlay]);

  // Video HTML5 event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setState((prev) => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration || prev.duration,
      }));
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setState((prev) => ({ ...prev, buffered: bufferedEnd }));
      }
    };

    const handlePlay = () => setState((prev) => ({ ...prev, isPlaying: true }));
    const handlePause = () => setState((prev) => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => setState((prev) => ({ ...prev, isBuffering: true }));
    const handlePlaying = () => setState((prev) => ({ ...prev, isBuffering: false }));

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
    };
  }, []);

  // UI Control handlers
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (state.isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [state.isPlaying]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const targetTime = parseFloat(e.target.value);
    video.currentTime = targetTime;
    setState((prev) => ({ ...prev, currentTime: targetTime }));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    video.muted = val === 0;
    setState((prev) => ({ ...prev, volume: val, isMuted: val === 0 }));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !state.isMuted;
    setState((prev) => ({ ...prev, isMuted: video.muted }));
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    // 1. iOS Safari (iPhone only supports fullscreen directly on HTMLVideoElement)
    if (video && (video as any).webkitSupportsFullscreen && typeof (video as any).webkitEnterFullscreen === 'function') {
      if ((video as any).webkitDisplayingFullscreen) {
        (video as any).webkitExitFullscreen?.();
      } else {
        (video as any).webkitEnterFullscreen();
      }
      return;
    }

    // 2. Standard Cross-Browser (Desktop, Android Chrome, iPadOS)
    const isFullscreenActive = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      (video as any)?.webkitDisplayingFullscreen
    );

    if (!isFullscreenActive) {
      const fsOptions: FullscreenOptions = { navigationUI: 'hide' };

      // Auto-rotate and lock to Landscape on mobile devices
      if ((screen.orientation as any)?.lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
      }

      if (container.requestFullscreen) {
        container.requestFullscreen(fsOptions).catch(() => {
          if (video && video.requestFullscreen) {
            video.requestFullscreen(fsOptions).catch(() => {});
          } else if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen(fsOptions).catch(() => {});
          }
        });
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      } else if (video && (video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
      } else if ((container as any).mozRequestFullScreen) {
        (container as any).mozRequestFullScreen();
      } else if ((container as any).msRequestFullscreen) {
        (container as any).msRequestFullscreen();
      }
    } else {
      // Unlock orientation on exiting fullscreen
      if ((screen.orientation as any)?.unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch {
          // Ignore
        }
      }

      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    const handleFullscreenChange = () => {
      const isFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (video as any)?.webkitDisplayingFullscreen
      );
      setState((prev) => ({ ...prev, isFullscreen: isFull }));
    };

    const handleIosEnterFullscreen = () => setState((prev) => ({ ...prev, isFullscreen: true }));
    const handleIosExitFullscreen = () => setState((prev) => ({ ...prev, isFullscreen: false }));

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    video?.addEventListener('webkitbeginfullscreen', handleIosEnterFullscreen);
    video?.addEventListener('webkitendfullscreen', handleIosExitFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      video?.removeEventListener('webkitbeginfullscreen', handleIosEnterFullscreen);
      video?.removeEventListener('webkitendfullscreen', handleIosExitFullscreen);
    };
  }, []);

  const triggerShowControls = useCallback(
    (durationMs = 3000) => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
      if (state.isPlaying) {
        controlsTimeoutRef.current = window.setTimeout(() => {
          setShowControls(false);
        }, durationMs);
      }
    },
    [state.isPlaying],
  );

  const handleUserInteraction = () => {
    triggerShowControls(3000);
  };

  const handleVideoTap = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.secure-player-controls')) {
      triggerShowControls(3500);
      return;
    }

    if (showControls && state.isPlaying) {
      setShowControls(false);
      if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    } else {
      triggerShowControls(3000);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      ref={containerRef}
      className={`secure-player-container ${className} ${showControls ? 'show-controls' : 'hide-controls'}`}
      onMouseMove={handleUserInteraction}
      onTouchStart={handleUserInteraction}
      onMouseLeave={() => state.isPlaying && setShowControls(false)}
      onClick={handleVideoTap}
      onContextMenu={(e) => e.preventDefault()} // Block right-click inspect/save
    >
      {/* Underlying Secure HTML5 Video Element */}
      <video
        ref={videoRef}
        className="secure-player-video"
        playsInline
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={true}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={toggleFullscreen}
      />

      {/* Dynamic Drifting Client-Side Canvas Watermark Overlay */}
      {userId && (
        <WatermarkOverlay
          videoRef={videoRef}
          userId={userId}
          email={email}
          sessionId={sessionId}
          opacity={watermarkOpacity}
        />
      )}

      {/* Static Custom Watermark Text Fallback if provided */}
      {watermarkText && (
        <div className="secure-player-watermark">
          <span>{watermarkText}</span>
        </div>
      )}

      {/* Screen Capture & Background Tab Blanking Overlay */}
      {isScreenMasked && (
        <div className="screen-capture-mask" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 35, color: '#f87171' }}>
          <ShieldAlert size={36} />
          <span style={{ fontSize: '13px', marginTop: '8px', fontWeight: 600, color: '#e2e8f0' }}>Playback Protected</span>
        </div>
      )}

      {/* Security Status Badge */}
      <div className="secure-player-badge">
        <ShieldCheck size={14} className="badge-icon" />
        <span>
          {typeof window !== 'undefined' &&
          (Boolean((window as any).eduOneDesktopAPI?.isDesktop) ||
            Boolean((window as any).fonixDesktopAPI?.isDesktop) ||
            Boolean(
              navigator.userAgent &&
                (navigator.userAgent.includes('EduOneDesktop') || navigator.userAgent.includes('FonixEduDesktop'))
            ))
            ? '🛡️ Hardware Blackout Active • OBS Blocked • AES-128'
            : 'AES-128 • Device Bound • Forensic A/B Protected'}
        </span>
      </div>

      {/* Big Center Play Button if paused */}
      {!state.isPlaying && !errorMessage && (
        <div className="secure-player-center-play" onClick={togglePlay}>
          <div className="center-play-button">
            <Play size={36} fill="white" color="white" />
          </div>
        </div>
      )}

      {/* Buffering Spinner */}
      {state.isBuffering && (
        <div className="secure-player-buffering">
          <div className="spinner"></div>
        </div>
      )}

      {/* Error Overlay with Clean Eviction Notice */}
      {errorMessage && (
        <div className="secure-player-error">
          <ShieldAlert size={42} className="error-icon" style={{ color: '#ef4444' }} />
          <div className="error-text">{errorMessage}</div>
          <button
            className="retry-button"
            onClick={() => {
              setRetryCount(0);
              setErrorMessage(null);
              if (hlsRef.current) hlsRef.current.startLoad();
            }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Overlay UI Controls */}
      <div className={`secure-player-controls ${showControls ? 'visible' : ''}`}>
        {/* Progress Bar & Seek Slider */}
        <div className="progress-container">
          <div
            className="buffer-bar"
            style={{
              width: `${state.duration ? (state.buffered / state.duration) * 100 : 0}%`,
            }}
          />
          <div
            className="play-progress"
            style={{
              width: `${state.duration ? (state.currentTime / state.duration) * 100 : 0}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={state.duration || 100}
            step={0.1}
            value={state.currentTime}
            onChange={handleSeek}
            className="seek-slider"
          />
        </div>

        <div className="controls-row">
          <div className="controls-left">
            <button className="control-btn" onClick={togglePlay} aria-label={state.isPlaying ? 'Pause' : 'Play'}>
              {state.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <div className="volume-control">
              <button className="control-btn" onClick={toggleMute} aria-label="Mute">
                {state.isMuted || state.volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.isMuted ? 0 : state.volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>

            <div className="time-display">
              <span>{formatTime(state.currentTime)}</span>
              <span className="time-separator">/</span>
              <span>{formatTime(state.duration)}</span>
            </div>
          </div>

          <div className="controls-right">
            {fingerprint && (
              <span className="player-device-tag" title={`Bound Fingerprint: ${fingerprint}`}>
                🔒 {fingerprint.slice(0, 8)}
              </span>
            )}

            {/* Quality & Playback Settings (⚙️) */}
            <div className="settings-wrapper" ref={settingsMenuRef}>
              <button
                className={`control-btn ${showSettingsMenu ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsMenu((prev) => !prev);
                  setSettingsTab('main');
                }}
                aria-label="Settings"
                title="Quality & Speed Settings"
              >
                <Settings size={20} className={showSettingsMenu ? 'spin-icon' : ''} />
              </button>

              {showSettingsMenu && (
                <div className="settings-menu" onClick={(e) => e.stopPropagation()}>
                  {/* Main Settings Menu */}
                  {settingsTab === 'main' && (
                    <div className="settings-panel">
                      <div className="settings-header">Playback Settings</div>
                      <div
                        className="settings-item"
                        onClick={() => setSettingsTab('quality')}
                      >
                        <span className="item-label">Quality</span>
                        <span className="item-value">
                          {selectedQualityLabel}
                          <ChevronRight size={14} />
                        </span>
                      </div>
                      <div
                        className="settings-item"
                        onClick={() => setSettingsTab('speed')}
                      >
                        <span className="item-label">Speed</span>
                        <span className="item-value">
                          {playbackSpeed === 1 ? '1x (Normal)' : `${playbackSpeed}x`}
                          <ChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Quality Submenu */}
                  {settingsTab === 'quality' && (
                    <div className="settings-panel">
                      <div
                        className="settings-header clickable"
                        onClick={() => setSettingsTab('main')}
                      >
                        ← Quality Options
                      </div>
                      <div
                        className={`settings-option ${selectedQualityId === -1 ? 'selected' : ''}`}
                        onClick={() => {
                          handleQualitySelect(-1);
                          setSelectedQualityId(-1);
                          setSelectedQualityLabel('Auto (Adaptive)');
                        }}
                      >
                        <span>Auto (Adaptive)</span>
                        {selectedQualityId === -1 && <Check size={14} />}
                      </div>
                      {(state.levels.length > 0
                        ? state.levels
                        : [{ id: 0, label: '1080p Full HD' }]
                      ).map((lvl) => (
                        <div
                          key={lvl.id}
                          className={`settings-option ${selectedQualityId === lvl.id ? 'selected' : ''}`}
                          onClick={() => {
                            handleQualitySelect(lvl.id);
                            setSelectedQualityId(lvl.id);
                            setSelectedQualityLabel(lvl.label);
                          }}
                        >
                          <span>{lvl.label}</span>
                          {selectedQualityId === lvl.id && <Check size={14} />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Speed Submenu */}
                  {settingsTab === 'speed' && (
                    <div className="settings-panel">
                      <div
                        className="settings-header clickable"
                        onClick={() => setSettingsTab('main')}
                      >
                        ← Playback Speed
                      </div>
                      {[0.75, 1, 1.25, 1.5, 1.75, 2].map((spd) => (
                        <div
                          key={spd}
                          className={`settings-option ${playbackSpeed === spd ? 'selected' : ''}`}
                          onClick={() => handleSpeedSelect(spd)}
                        >
                          <span>{spd === 1 ? '1x (Normal)' : `${spd}x`}</span>
                          {playbackSpeed === spd && <Check size={14} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="control-btn" onClick={toggleFullscreen} aria-label="Toggle Fullscreen">
              {state.isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurePlayer;
