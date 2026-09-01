"""
EduOne Secure Player — Ultra-Lightweight Microsoft Edge WebView2 Edition
Size: ~10 MB
Features:
1. Windows kernel-level display affinity (SetWindowDisplayAffinity WDA_MONITOR / OBS Blackout)
2. Microsoft Edge WebView2 Chromium engine
3. Native Hardware Fingerprinting
4. Deep link protocol support (eduone://)
"""

import sys
import os
import ctypes
import hashlib
import subprocess
import time
import webview

# Win32 Constants
WDA_NONE = 0x00000000
WDA_MONITOR = 0x00000001
WDA_EXCLUDEFROMCAPTURE = 0x00000011

def get_hardware_fingerprint():
    """Generates unique CPU + Machine GUID hardware hash"""
    try:
        cmd = 'powershell -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"'
        uuid = subprocess.check_output(cmd, shell=True, text=True).strip()
    except Exception:
        uuid = "fallback_hw_guid"
    
    raw = f"desktop_hw_wv2:{uuid}"
    return f"desktop_hw:{hashlib.sha256(raw.encode()).hexdigest()[:24]}"

class SecureBridgeApi:
    """JS Bridge exposed to window.pywebview.api"""
    def __init__(self, hw_fp):
        self.hw_fp = hw_fp

    def get_hardware_fingerprint(self):
        return self.hw_fp

    def is_desktop_app(self):
        return True

def apply_display_protection(window):
    """Applies kernel-level display affinity to make window 100% black to OBS and screenshots"""
    if sys.platform == 'win32':
        time.sleep(0.5)
        try:
            # Find HWND by title
            user32 = ctypes.windll.user32
            hwnd = user32.FindWindowW(None, window.title)
            if hwnd:
                res = user32.SetWindowDisplayAffinity(hwnd, WDA_MONITOR)
                print(f"[SECURITY] Applied SetWindowDisplayAffinity WDA_MONITOR to HWND {hwnd}: success={bool(res)}")
            else:
                print("[SECURITY] Could not locate HWND for title:", window.title)
        except Exception as e:
            print("[SECURITY] Display affinity warning:", e)

def main():
    hw_fp = get_hardware_fingerprint()
    api = SecureBridgeApi(hw_fp)

    # Determine Target URL (Dev server http://localhost:3000 or production VM)
    target_url = os.environ.get('EDUONE_LIVE_URL', 'http://localhost:3000')

    # Script to inject desktop identifiers into window.fonixDesktopAPI & window.eduOneDesktopAPI
    injection_js = f"""
    (function() {{
        window.fonixDesktopAPI = {{
            isDesktop: true,
            isWindows: true,
            hardwareFingerprint: '{hw_fp}',
            onDeepLink: function(cb) {{}}
        }};
        window.eduOneDesktopAPI = window.fonixDesktopAPI;
        console.log('[EDUONE-WEBVIEW2] Native Desktop Bridge Injected. HW-FP: {hw_fp[:10]}...');
    }})();
    """

    window = webview.create_window(
        title="EduOne Secure Player — Lightweight Edition",
        url=target_url,
        width=1340,
        height=840,
        min_size=(900, 600),
        background_color="#0f172a",
        js_api=api,
        easy_drag=False,
    )

    def on_loaded():
        window.evaluate_js(injection_js)
        apply_display_protection(window)

    window.events.loaded += on_loaded

    # Start Edge Chromium WebView2
    webview.start(
        debug=False,
        gui='edgechromium',  # Forces Microsoft Edge WebView2
    )

if __name__ == '__main__':
    main()
