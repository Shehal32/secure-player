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

        const uint WDA_MONITOR = 0x00000001;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Form form = new Form();
            form.Text = "EduOne Secure Player — Lightweight WebView2";
            form.Size = new Size(1340, 840);
            form.MinimumSize = new Size(900, 600);
            form.StartPosition = FormStartPosition.CenterScreen;
            form.BackColor = Color.FromArgb(15, 23, 42);

            // Apply OBS & Screenshot hardware blackout
            form.Shown += (s, e) => {
                uint result = SetWindowDisplayAffinity(form.Handle, WDA_MONITOR);
                Console.WriteLine("[SECURITY] SetWindowDisplayAffinity WDA_MONITOR applied: " + (result != 0));
            };

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
                            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
                            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                            
                            // Inject native desktop bridge
                            string initScript = @"
                                window.fonixDesktopAPI = {
                                    isDesktop: true,
                                    isWindows: true,
                                    hardwareFingerprint: 'desktop_hw_wv2:native_client',
                                    onDeepLink: function(cb) {}
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
    }
}
