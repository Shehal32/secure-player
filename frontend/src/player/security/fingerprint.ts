/**
 * Client-Side Device Fingerprinting Utility
 * Computes a deterministic SHA-256 hash of hardware and browser parameters
 * (Canvas geometry, WebGL renderer, Screen resolution, Color depth, Timezone, Concurrency).
 */

export async function generateDeviceFingerprint(): Promise<string> {
  try {
    const components: string[] = [];

    // 0. Native Hardware Fingerprint (If running inside Electron Desktop Client)
    const desktopHW = (window as any).fonixDesktopAPI?.hardwareFingerprint;
    if (desktopHW) {
      components.push(`desktop_hw:${desktopHW}`);
    }

    // 1. User Agent & Language
    components.push(navigator.userAgent || 'unknown_ua');
    components.push(navigator.language || 'unknown_lang');

    // 2. Screen & Display Metrics
    if (window.screen) {
      components.push(`${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`);
    }

    // 3. Timezone
    try {
      components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      components.push(new Date().getTimezoneOffset().toString());
    }

    // 4. Hardware Concurrency & Memory
    if ((navigator as any).hardwareConcurrency) {
      components.push(`cores:${(navigator as any).hardwareConcurrency}`);
    }

    // 5. Canvas Micro-Render Fingerprint
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('EduOne SecurePlayer FP 🔒', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('EduOne SecurePlayer FP 🔒', 4, 17);
        components.push(canvas.toDataURL());
      }
    } catch {
      // Canvas blocked by privacy extensions, fallback gracefully
      components.push('canvas_blocked');
    }

    // 6. WebGL Renderer Signature
    try {
      const glCanvas = document.createElement('canvas');
      const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          const vendor = (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          components.push(`${vendor}~${renderer}`);
        }
      }
    } catch {
      components.push('webgl_blocked');
    }

    // 7. Hash the concatenated component string with SHA-256
    // Hash all combined hardware components using SHA-256
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(components.join('###'));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return `fp_${hashHex.slice(0, 16)}`;
  } catch {
    // Fallback pseudo-fingerprint if Web Crypto API is unavailable
    return `fp_fallback_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Captures high-precision device geolocation (GPS / Wi-Fi triangulation)
 * Triggers native browser location permission prompt.
 */
export async function getDeviceLocationCoords(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return '';
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve(`${latitude.toFixed(4)},${longitude.toFixed(4)}`);
      },
      () => {
        resolve('');
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      },
    );
  });
}

export type DetectedOS = 'ios' | 'android' | 'mac' | 'windows' | 'other';

/**
 * Detects client OS for downloading and launching native secure desktop/mobile clients.
 */
export function detectUserOS(): DetectedOS {
  if (typeof window === 'undefined') return 'windows';
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';

  // 1. Check iOS (iPhone, iPad, iPod)
  if (/iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }

  // 2. Check Android
  if (/Android/i.test(ua) || /Android/i.test(platform)) {
    return 'android';
  }

  // 3. Check macOS Desktop
  if (/Mac/i.test(ua) || /Mac/i.test(platform)) {
    return 'mac';
  }

  // 4. Check Windows Desktop
  if (/Win/i.test(ua) || /Win/i.test(platform)) {
    return 'windows';
  }

  return 'other';
}
