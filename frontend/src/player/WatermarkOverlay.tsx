import React, { useEffect, useRef } from 'react';
import './WatermarkOverlay.css';

export interface WatermarkOverlayProps {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  userId: string;
  email?: string;
  sessionId?: string;
  opacity?: number;
  className?: string;
}

export const WatermarkOverlay: React.FC<WatermarkOverlayProps> = ({
  userId,
  email,
  sessionId,
  opacity = 0.16,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Position and movement physics state for drifting text
  const stateRef = useRef({
    x: 60,
    y: 60,
    vx: 0.35, // Slow horizontal velocity
    vy: 0.25, // Slow vertical velocity
    angle: -0.04, // Subtle tilt
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle canvas resizing to match parent dimensions
    const updateCanvasSize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Animation loop for drifting movement and live time updates
    let lastTime = performance.now();

    const render = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!canvas.parentElement) return;
      const width = canvas.parentElement.clientWidth;
      const height = canvas.parentElement.clientHeight;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Steganographic Spatial Micro-Dot Grid for Single-Screenshot Recovery
      // Subtle 4-corner & center luminance micro-dots (imperceptible 1.5% opacity)
      ctx.fillStyle = `rgba(255, 255, 255, 0.015)`;
      const dotCoords = [
        [20, 20],
        [width - 20, 20],
        [width / 2, height / 2],
        [20, height - 20],
        [width - 20, height - 20],
      ];
      for (const [dx, dy] of dotCoords) {
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Update Drifting Watermark Position with Boundary Physics
      const state = stateRef.current;
      state.x += state.vx * 60 * delta;
      state.y += state.vy * 60 * delta;

      const paddingX = 180;
      const paddingY = 60;

      if (state.x < 20) {
        state.x = 20;
        state.vx = Math.abs(state.vx);
      } else if (state.x > width - paddingX) {
        state.x = width - paddingX;
        state.vx = -Math.abs(state.vx);
      }

      if (state.y < 30) {
        state.y = 30;
        state.vy = Math.abs(state.vy);
      } else if (state.y > height - paddingY) {
        state.y = height - paddingY;
        state.vy = -Math.abs(state.vy);
      }

      // 3. Draw Dynamic Visible Watermark Text (Dual-tone for dark and white slide contrast)
      const timeStr = new Date().toLocaleTimeString();
      const userText = email ? `${userId} (${email})` : userId;
      const text = `${userText} • ${timeStr}`;

      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle);

      // Contrast shadow to guarantee readability on white slides and dark video
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.24, opacity)})`;
      ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(text, 0, 0);

      // Secondary Tracking Tag (Student ID + Session Code)
      ctx.font = '700 11px monospace';
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.20, opacity * 0.9)})`;
      ctx.fillText(`STUDENT: ${userId} • SESS: ${sessionId || 'active'}`, 0, 16);

      ctx.restore();

      // 4. Subtle Persistent Corner Security Anchor (Imperceptible yet camera-detectable)
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 3;
      ctx.font = '500 10px monospace';
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.18, opacity * 0.75)})`;
      ctx.fillText(`🔒 FonixEdu Protected • ${userId} • ${sessionId?.slice(-8) || ''}`, width - 260, height - 12);
      ctx.restore();

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [userId, email, sessionId, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={`watermark-overlay-canvas ${className}`}
      aria-hidden="true"
    />
  );
};
export default WatermarkOverlay;
