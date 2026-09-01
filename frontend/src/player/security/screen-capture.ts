/**
 * Screen Capture Protection Architecture & Interface
 *
 * NOTE ON WEB LIMITATIONS:
 * The standard Web Platform Sandbox does NOT provide an OS-level API to prevent
 * external screen recording software (e.g. OBS, QuickTime, Discord screen share).
 * The web implementation provides detection hooks via:
 * 1. Document visibilityState change (switching away or alt-tabbing).
 * 2. Window blur & focus events.
 * 3. PrintScreen & DevTools shortcut interception.
 *
 * FUTURE REACT NATIVE / NATIVE IMPLEMENTATION EXTENSION POINT:
 * When wrapped in a React Native / Capacitor mobile application, this interface
 * must be implemented using:
 * - Android: WindowManager.LayoutParams.FLAG_SECURE (hardware OS-level black screenshot).
 * - iOS: UIScreen.isCaptured & UIScreen.capturedDidChangeNotification (blanking overlay).
 */

export interface ScreenCaptureState {
  isCaptured: boolean;
  isFocused: boolean;
  isDevtoolsOpen: boolean;
}

export type ScreenCaptureListener = (state: ScreenCaptureState) => void;

export interface ScreenCaptureGuard {
  /**
   * Initializes screen capture and visibility monitoring.
   */
  startMonitoring(listener: ScreenCaptureListener): () => void;

  /**
   * Returns current screen capture status.
   */
  isCaptureActive(): boolean;
}

/**
 * Web Platform Screen Capture Guard implementation.
 * Listens to document visibility, blur, and keyboard shortcut events.
 */
export class WebScreenCaptureGuard implements ScreenCaptureGuard {
  private listener: ScreenCaptureListener | null = null;
  private isFocused = true;

  startMonitoring(listener: ScreenCaptureListener): () => void {
    this.listener = listener;

    const handleVisibilityChange = () => {
      this.notify();
    };

    const handleBlur = () => {
      this.isFocused = false;
      this.notify();
    };

    const handleFocus = () => {
      this.isFocused = true;
      this.notify();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Intercept PrintScreen
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('🔒 Protected Content - FonixEdu');
        }
        this.notify();
      }

      // Intercept Ctrl+S, Ctrl+P, F12, Ctrl+Shift+I
      if (
        (e.ctrlKey && (e.key === 's' || e.key === 'p' || e.key === 'u')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        e.key === 'F12'
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
      this.listener = null;
    };
  }

  isCaptureActive(): boolean {
    return document.visibilityState === 'hidden' || !this.isFocused;
  }

  private notify() {
    if (this.listener) {
      this.listener({
        // Mask the screen if hidden OR if it loses focus (which catches OS overlays like Win+G)
        isCaptured: document.visibilityState === 'hidden' || !this.isFocused,
        isFocused: this.isFocused,
        isDevtoolsOpen: false,
      });
    }
  }
}

export const defaultScreenCaptureGuard = new WebScreenCaptureGuard();
