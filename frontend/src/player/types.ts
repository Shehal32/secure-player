export interface SecurePlayerProps {
  videoId: string;
  jwtToken?: string;
  apiBaseUrl?: string; // e.g. "http://localhost:3001" or relative ""
  autoPlay?: boolean;
  userId?: string;
  email?: string;
  sessionId?: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  onError?: (error: Error | { type: string; details: string; fatal: boolean }) => void;
  onReady?: () => void;
  className?: string;
}

export interface PlaybackLevel {
  id: number;
  height?: number;
  bitrate?: number;
  label: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isBuffering: boolean;
  currentLevel: number;
  levels: PlaybackLevel[];
}
