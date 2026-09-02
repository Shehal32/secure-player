using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace EduOneSecurePlayer
{
    static class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint pdwAffinity);

        const uint WDA_MONITOR = 0x00000001;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Form form = new Form();
            form.Text = "EduOne";
            form.Size = new Size(1340, 840);
            form.MinimumSize = new Size(900, 600);
            form.StartPosition = FormStartPosition.CenterScreen;
            form.BackColor = Color.FromArgb(15, 23, 42);

            try
            {
                form.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            // Apply OBS & Screenshot hardware blackout + Watchdog Heartbeat
            form.Shown += (s, e) => {
                uint result = SetWindowDisplayAffinity(form.Handle, WDA_MONITOR);
                Console.WriteLine("[SECURITY] SetWindowDisplayAffinity WDA_MONITOR applied: " + (result != 0));

                // Anti-Tampering Watchdog Thread (200ms Heartbeat)
                var watchdogThread = new System.Threading.Thread(() => {
                    while (true)
                    {
                        System.Threading.Thread.Sleep(200);
                        try
                        {
                            // 1. Verify Affinity Integrity (kills process if memory-unhooked)
                            uint currentAffinity;
                            if (GetWindowDisplayAffinity(form.Handle, out currentAffinity))
                            {
                                if (currentAffinity != WDA_MONITOR)
                                {
                                    Environment.Exit(1);
                                }
                            }

                            // 2. Detect Clone / Duplicate Display Mode
                            var screens = Screen.AllScreens;
                            if (screens.Length > 1)
                            {
                                for (int i = 0; i < screens.Length; i++)
                                {
                                    for (int j = i + 1; j < screens.Length; j++)
                                    {
                                        if (screens[i].Bounds == screens[j].Bounds)
                                        {
                                            // Cloned/Duplicate Display detected
                                            if (form.InvokeRequired)
                                            {
                                                form.Invoke(new Action(() => {
                                                    MessageBox.Show(form, "Duplicate / Cloned Display detected. Please switch Windows display settings to Single or Extended display mode to view lectures.", "Security Alert", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                                    Environment.Exit(1);
                                                }));
                                            }
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                });
                watchdogThread.IsBackground = true;
                watchdogThread.Start();
            };

            RegisterProtocols();

            // Strict Anti-Tampering & Remote Debugging Flag Filter
            foreach (string arg in args)
            {
                string lower = arg.ToLowerInvariant();
                if (lower.Contains("remote-debugging") || lower.Contains("inspect") || lower.Contains("enable-logging"))
                {
                    Environment.Exit(1);
                }
            }

            string deepLinkArg = "";
            foreach (string arg in args)
            {
                if (arg.StartsWith("eduone://", StringComparison.OrdinalIgnoreCase) ||
                    arg.StartsWith("fonixedu://", StringComparison.OrdinalIgnoreCase))
                {
                    deepLinkArg = arg;
                    break;
                }
            }

            WebView2 webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            form.Controls.Add(webView);

            string targetUrl = Environment.GetEnvironmentVariable("EDUONE_LIVE_URL") ?? "http://localhost:3000";

            webView.EnsureCoreWebView2Async().ContinueWith(task => {
                if (form.InvokeRequired)
                {
                    form.Invoke(new Action(() => {
                        try
                        {
                            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                            webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

                            string deepLinkJs = string.IsNullOrEmpty(deepLinkArg) 
                                ? "null" 
                                : "'" + deepLinkArg.Replace("'", "\\'") + "'";
                            
                            // Inject native desktop bridge with deepLink support
                            string initScript = @"
                                window.fonixDesktopAPI = {
                                    isDesktop: true,
                                    isWindows: true,
                                    hardwareFingerprint: 'desktop_hw_wv2:native_client',
                                    initialDeepLink: " + deepLinkJs + @",
                                    onDeepLink: function(cb) {
                                        if (" + deepLinkJs + @") {
                                            setTimeout(function() { cb(" + deepLinkJs + @"); }, 500);
                                        }
                                    }
                                };
                                window.eduOneDesktopAPI = window.fonixDesktopAPI;
                            ";
                            webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(initScript);
                            webView.CoreWebView2.Navigate(targetUrl);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("WebView2 Init Error: " + ex.Message);
                        }
                    }));
                }
            });

            Application.Run(form);
        }

        static void RegisterProtocols()
        {
            string[] protocols = { "eduone", "fonixedu" };
            string exePath = Application.ExecutablePath;

            foreach (string proto in protocols)
            {
                try
                {
                    using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + proto))
                    {
                        if (key != null)
                        {
                            key.SetValue("", "URL:" + proto + " Protocol");
                            key.SetValue("URL Protocol", "");
                            using (var iconKey = key.CreateSubKey("DefaultIcon"))
                            {
                                if (iconKey != null) iconKey.SetValue("", "\"" + exePath + "\",0");
                            }
                            using (var cmdKey = key.CreateSubKey(@"shell\open\command"))
                            {
                                if (cmdKey != null) cmdKey.SetValue("", "\"" + exePath + "\" \"%1\"");
                            }
                        }
                    }
                }
                catch { }
            }
        }
    }
}
