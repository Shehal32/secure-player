import React from 'react';
import { WatermarkOverlay } from './WatermarkOverlay';
import { Youtube, ShieldCheck } from 'lucide-react';
import './SecurePlayer.css';

export interface YouTubeSecurePlayerProps {
  youtubeId: string;
  userId: string;
  email?: string;
  sessionId?: string;
  watermarkOpacity?: number;
}

export const YouTubeSecurePlayer: React.FC<YouTubeSecurePlayerProps> = ({
  youtubeId,
  userId,
  email,
  sessionId,
  watermarkOpacity = 0.22,
}) => {
  return (
    <div
      className="secure-player-container"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        backgroundColor: '#000000',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* YouTube Embedded IFrame */}
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&modestbranding=1&rel=0&enablejsapi=1`}
        title="Protected YouTube Player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
      />

      {/* Floating Dynamic Forensic Watermark Overlay (Pointer events none allows normal clicks on YouTube player) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        <WatermarkOverlay
          userId={userId}
          email={email}
          sessionId={sessionId}
          opacity={watermarkOpacity}
        />
      </div>

      {/* Security Status Pill */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 15,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(249, 115, 22, 0.4)',
          borderRadius: '20px',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: '#f8fafc',
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        <Youtube size={14} color="#ef4444" />
        <span>Hardware Protected YouTube Stream</span>
        <ShieldCheck size={13} color="#10b981" />
      </div>
    </div>
  );
};
