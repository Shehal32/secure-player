import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ShieldCheck,
  Settings,
  Check,
  Youtube,
} from 'lucide-react';
import { WatermarkOverlay } from './WatermarkOverlay';
import './SecurePlayer.css';

export interface YouTubeSecurePlayerProps {
  youtubeId: string;
  userId: string;
  email?: string;
  sessionId?: string;
  watermarkOpacity?: number;
  autoPlay?: boolean;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const YouTubeSecurePlayer: React.FC<YouTubeSecurePlayerProps> = ({
  youtubeId,
  userId,
  email,
  sessionId,
  watermarkOpacity = 0.2,
  autoPlay = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const iframeContainerId = useRef<string>(`yt-player-${Math.random().toString(36).substring(2, 9)}`);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeSettingsMenu, setActiveSettingsMenu] = useState<'main' | 'speed'>('main');

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Initialize YouTube IFrame API
  useEffect(() => {
    let isMounted = true;
    let timer: number | null = null;

    const loadYT = () => {
      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        const existingScript = document.getElementById('youtube-iframe-api');
        if (!existingScript) {
          const tag = document.createElement('script');
          tag.id = 'youtube-iframe-api';
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }

        const prevCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prevCallback) prevCallback();
          if (isMounted) initPlayer();
        };
      }
    };

    const initPlayer = () => {
      try {
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        playerRef.current = new window.YT.Player(iframeContainerId.current, {
          videoId: youtubeId,
          playerVars: {
            autoplay: autoPlay ? 1 : 0,
            controls: 0, // Hides native YouTube controls completely
            disablekb: 1, // Disables native keyboard controls
            fs: 0, // Disables native fullscreen button
            iv_load_policy: 3, // Hides annotations
            modestbranding: 1, // Removes YouTube branding
            rel: 0, // Prevents showing unrelated videos
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: any) => {
              if (!isMounted) return;
              const dur = event.target.getDuration() || 0;
              setDuration(dur);
              setIsBuffering(false);
              if (autoPlay) {
                event.target.playVideo();
                setIsPlaying(true);
              }
            },
            onStateChange: (event: any) => {
              if (!isMounted) return;
              // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
              if (event.data === 1) {
                setIsPlaying(true);
                setIsBuffering(false);
              } else if (event.data === 2) {
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (event.data === 3) {
                setIsBuffering(true);
              } else if (event.data === 0) {
                setIsPlaying(false);
                setIsBuffering(false);
              }
            },
          },
        });
      } catch (e) {
        console.error('[YOUTUBE-API] Failed to initialize player:', e);
      }
    };

    loadYT();

    // Time ticker for seekbar updates
    timer = window.setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        try {
          const curr = playerRef.current.getCurrentTime() || 0;
          const dur = playerRef.current.getDuration() || 0;
          setCurrentTime(curr);
          if (dur > 0 && duration === 0) setDuration(dur);
        } catch {
          // ignore transient errors during reload
        }
      }
    }, 400);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {}
      }
    };
  }, [youtubeId, autoPlay]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    } catch (e) {
      console.warn('Playback toggle error:', e);
    }
  }, [isPlaying]);

  // Handle Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSeconds = parseFloat(e.target.value);
    setCurrentTime(targetSeconds);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(targetSeconds, true);
    }
  };

  // Handle Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val === 0) {
      setIsMuted(true);
      if (playerRef.current) playerRef.current.mute();
    } else {
      setIsMuted(false);
      if (playerRef.current) {
        playerRef.current.unMute();
        playerRef.current.setVolume(Math.round(val * 100));
      }
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(Math.round((volume || 0.8) * 100));
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  // Handle Speed
  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
      playerRef.current.setPlaybackRate(speed);
    }
    setIsSettingsOpen(false);
    setActiveSettingsMenu('main');
  };

  // Handle Fullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Controls auto-hide on mouse inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying && !isSettingsOpen) {
        setShowControls(false);
      }
    }, 2800);
  };

  const handleMouseLeave = () => {
    if (isPlaying && !isSettingsOpen) {
      setShowControls(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`secure-player-container ${showControls ? 'show-controls' : 'hide-controls'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        backgroundColor: '#000',
        borderRadius: isFullscreen ? '0px' : '14px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* 1. Clean Native Aspect-Ratio YouTube IFrame Target */}
      <div
        id={iframeContainerId.current}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none', // Prevents clicking YouTube internal links or share popup
        }}
      />

      {/* 2. Top Shield Bar (Prevents clicking YouTube share/channel buttons) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          zIndex: 6,
          cursor: 'pointer',
        }}
        onClick={togglePlay}
      />

      {/* 3. Transparent Interaction Shield (Captures clicks for custom play/pause & toggles controls) */}
      <div
        onClick={togglePlay}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          cursor: 'pointer',
        }}
      />

      {/* 3. Floating Dynamic Forensic Watermark Overlay */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        <WatermarkOverlay
          userId={userId}
          email={email}
          sessionId={sessionId}
          opacity={watermarkOpacity}
        />
      </div>

      {/* 4. Security Status Badge (Top-Left) */}
      <div className="secure-player-badge" style={{ zIndex: 12 }}>
        <Youtube size={14} color="#ef4444" />
        <span>Hardware Blackout Active</span>
        <ShieldCheck size={14} color="#10b981" />
      </div>

      {/* 5. Center Play Button Overlay (when paused) */}
      {!isPlaying && !isBuffering && (
        <div className="secure-player-center-play" onClick={togglePlay} style={{ zIndex: 11 }}>
          <div className="center-play-button">
            <Play size={28} fill="white" color="white" />
          </div>
        </div>
      )}

      {/* 6. Buffering Spinner */}
      {isBuffering && (
        <div className="secure-player-buffering">
          <div className="spinner"></div>
        </div>
      )}

      {/* 7. Custom Clean Player Controls Bar (Bottom) */}
      <div className={`secure-player-controls ${showControls ? 'visible' : ''}`} style={{ zIndex: 15 }}>
        {/* Custom Seekbar */}
        <div className="progress-container">
          <div
            className="play-progress"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
          <input
            type="range"
            className="seek-slider"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
          />
        </div>

        {/* Controls Action Row */}
        <div className="controls-row">
          {/* Left Controls: Play/Pause, Volume, Timestamps */}
          <div className="controls-left">
            <button type="button" className="control-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
            </button>

            {/* Volume */}
            <div className="volume-group">
              <button type="button" className="control-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
              />
            </div>

            {/* Timestamps */}
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span className="time-separator">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Speed / Settings, Fullscreen */}
          <div className="controls-right" ref={settingsMenuRef} style={{ position: 'relative' }}>
            {/* Speed & Settings Menu Toggle */}
            <button
              type="button"
              className={`control-btn ${isSettingsOpen ? 'active' : ''}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="Playback Settings"
            >
              <Settings size={18} />
            </button>

            {/* Settings Popup Menu */}
            {isSettingsOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '42px',
                  right: '0px',
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '8px',
                  minWidth: '160px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                  zIndex: 30,
                  fontSize: '13px',
                  color: '#fff',
                }}
              >
                {activeSettingsMenu === 'main' ? (
                  <div>
                    <div
                      onClick={() => setActiveSettingsMenu('speed')}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>Speed</span>
                      <span style={{ color: '#f97316', fontWeight: 600 }}>{playbackRate}x ›</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      onClick={() => setActiveSettingsMenu('main')}
                      style={{
                        padding: '6px 10px',
                        marginBottom: '6px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '12px',
                      }}
                    >
                      ‹ Back to Settings
                    </div>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                      <div
                        key={spd}
                        onClick={() => handleSpeedChange(spd)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: playbackRate === spd ? 'rgba(249, 115, 22, 0.2)' : 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            playbackRate === spd ? 'rgba(249, 115, 22, 0.2)' : 'transparent')
                        }
                      >
                        <span>{spd === 1 ? '1x (Normal)' : `${spd}x`}</span>
                        {playbackRate === spd && <Check size={14} color="#f97316" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              type="button"
              className="control-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
