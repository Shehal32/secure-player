#![windows_subsystem = "windows"]

use std::env;
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    platform::windows::WindowExtWindows,
    window::WindowBuilder,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetWindowDisplayAffinity, SetWindowDisplayAffinity, WDA_MONITOR};
use winreg::enums::*;
use winreg::RegKey;
use wry::WebViewBuilder;

fn register_protocols(exe_path: &str) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let protocols = ["eduone", "fonixedu"];

    for proto in &protocols {
        if let Ok((key, _)) = hkcu.create_subkey(format!(r"Software\Classes\{}", proto)) {
            let _ = key.set_value("", &format!("URL:{} Protocol", proto));
            let _ = key.set_value("URL Protocol", &"");

            if let Ok((icon_key, _)) = key.create_subkey("DefaultIcon") {
                let _ = icon_key.set_value("", &format!("\"{}\",0", exe_path));
            }

            if let Ok((cmd_key, _)) = key.create_subkey(r"shell\open\command") {
                let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path));
            }
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Collect command-line args for deep links
    let args: Vec<String> = env::args().collect();
    let current_exe = env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    if !current_exe.is_empty() {
        register_protocols(&current_exe);
    }

    // Strict Anti-Tampering & Remote Debugging Flag Filter
    for arg in &args[1..] {
        let lower = arg.to_lowercase();
        if lower.contains("remote-debugging") || 
           lower.contains("inspect") || 
           lower.contains("enable-logging") ||
           lower.contains("custom-devtools") {
            eprintln!("[SECURITY ALERT] Unauthorized debugging attempt blocked. Terminating process.");
            std::process::exit(1);
        }
    }

    let mut deep_link = String::new();
    for arg in &args[1..] {
        if arg.starts_with("eduone://") || arg.starts_with("fonixedu://") {
            deep_link = arg.clone();
            break;
        }
    }

    let target_url = env::var("EDUONE_LIVE_URL")
        .unwrap_or_else(|_| "http://localhost:3000".to_string());

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("EduOne")
        .with_inner_size(LogicalSize::new(1340.0, 840.0))
        .with_min_inner_size(LogicalSize::new(900.0, 600.0))
        .build(&event_loop)?;

    // 1. Direct Win32 Kernel Hardware Blackout (SetWindowDisplayAffinity WDA_MONITOR)
    // Makes the entire application window pitch black to OBS, Snipping Tool, Zoom, Discord
    let hwnd = window.hwnd();
    unsafe {
        let _ = SetWindowDisplayAffinity(HWND(hwnd as _), WDA_MONITOR);
    }

    // 2. High-Frequency Affinity Watchdog Thread (200ms Heartbeat)
    // If an attacker uses DLL injection or Cheat Engine to reset display affinity to WDA_NONE,
    // this watchdog terminates the process within 0.2 seconds.
    let hwnd_raw = hwnd as isize;
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            unsafe {
                let mut current_affinity: u32 = 0;
                if GetWindowDisplayAffinity(HWND(hwnd_raw as _), &mut current_affinity).is_ok() {
                    if current_affinity != WDA_MONITOR.0 {
                        eprintln!("[SECURITY TAMPER] Display affinity altered from WDA_MONITOR! Self-terminating.");
                        std::process::exit(1);
                    }
                }
            }
        }
    });

    // 3. Prepare JavaScript Native Bridge Injection
    let deep_link_js = if deep_link.is_empty() {
        "null".to_string()
    } else {
        format!("'{}'", deep_link.replace('\'', "\\'"))
    };

    let init_script = format!(
        r#"
        (function() {{
            // 1. Native Desktop Bridge Setup
            window.fonixDesktopAPI = {{
                isDesktop: true,
                isWindows: true,
                isRustClient: true,
                hardwareFingerprint: 'desktop_hw_rust:native_client',
                initialDeepLink: {deep_link_js},
                onDeepLink: function(cb) {{
                    if ({deep_link_js}) {{
                        setTimeout(function() {{ cb({deep_link_js}); }}, 500);
                    }}
                }}
            }};
            window.eduOneDesktopAPI = window.fonixDesktopAPI;

            // 2. Disable Right-Click Context Menu
            document.addEventListener('contextmenu', function(e) {{
                e.preventDefault();
                e.stopImmediatePropagation();
                return false;
            }}, true);

            // 3. Disable DevTools & Save/Print/Inspect Keyboard Shortcuts
            window.addEventListener('keydown', function(e) {{
                if (
                    e.key === 'F12' ||
                    (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
                    (e.ctrlKey && ['u', 'U', 's', 'S', 'p', 'P', 'r', 'R'].includes(e.key))
                ) {{
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }}
            }}, true);

            // 4. Disable Drag and Drop extraction
            document.addEventListener('dragstart', function(e) {{
                e.preventDefault();
                return false;
            }}, true);

            console.log('[EDUONE-RUST] Hardened Lockdown Active: Right-click & Inspection disabled.');
        }})();
        "#
    );

    // 3. Build Chromium WebView2 using Wry
    let _webview = WebViewBuilder::new()
        .with_devtools(cfg!(debug_assertions))
        .with_initialization_script(&init_script)
        .with_url(&target_url)
        .build(&window)?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Event::WindowEvent { event: WindowEvent::CloseRequested, .. } = event {
            *control_flow = ControlFlow::Exit;
        }
    });
}
