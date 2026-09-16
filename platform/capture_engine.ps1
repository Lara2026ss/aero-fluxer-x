param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("desktop", "app", "window")]
    [string]$Mode,

    [Parameter(Mandatory=$false)]
    [string]$Query = "",

    [Parameter(Mandatory=$false)]
    [switch]$IsHwnd,

    [Parameter(Mandatory=$true)]
    [string]$OutFile
)

$ErrorActionPreference = "Stop"

if (-not ([System.Management.Automation.PSTypeName]'FluxerCaptureEngine'.Type)) {
    Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;

public class FluxerCaptureEngine {
    public delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumDesktopWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBmp, uint nFlags);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, uint dwRop);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public const uint PW_RENDERFULLCONTENT = 0x00000002;
    public const int SW_SHOWNOACTIVATE = 4;
    public const int SW_MINIMIZE = 6;
    public const int SW_RESTORE = 9;
    public const uint SRCCOPY_CAPTURE = 0x00CC0020 | 0x40000000;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static string CaptureDesktop(string outFile) {
        string result = "";
        Thread worker = new Thread(() => {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);

            int x = GetSystemMetrics(76); // SM_XVIRTUALSCREEN
            int y = GetSystemMetrics(77); // SM_YVIRTUALSCREEN
            int w = GetSystemMetrics(78); // SM_CXVIRTUALSCREEN
            int h = GetSystemMetrics(79); // SM_CYVIRTUALSCREEN

            if (w <= 0 || h <= 0) {
                w = GetSystemMetrics(0);
                h = GetSystemMetrics(1);
                x = 0;
                y = 0;
            }

            IntPtr hDeskDc = GetDC(IntPtr.Zero);
            IntPtr hMemDc = CreateCompatibleDC(hDeskDc);
            IntPtr hBmp = CreateCompatibleBitmap(hDeskDc, w, h);
            IntPtr hOld = SelectObject(hMemDc, hBmp);

            bool ok = BitBlt(hMemDc, 0, 0, w, h, hDeskDc, x, y, SRCCOPY_CAPTURE);

            SelectObject(hMemDc, hOld);
            DeleteDC(hMemDc);
            ReleaseDC(IntPtr.Zero, hDeskDc);
            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);

            if (ok) {
                using (Bitmap bmp = Image.FromHbitmap(hBmp)) {
                    bmp.Save(outFile, ImageFormat.Png);
                }
                result = "OK:" + w + "x" + h + ":Desktop:0:Desktop";
            } else {
                result = "ERROR:BitBlt failed (" + Marshal.GetLastWin32Error() + ")";
            }
            DeleteObject(hBmp);
        });

        worker.SetApartmentState(ApartmentState.STA);
        worker.Start();
        worker.Join(8000);
        return result;
    }

    public static string CaptureWindow(string query, bool isExplicitHwnd, string outFile) {
        string result = "";
        IntPtr prevForeground = GetForegroundWindow();

        Thread worker = new Thread(() => {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);

            IntPtr targetHwnd = IntPtr.Zero;
            string matchedTitle = "";
            long bestArea = 0;
            bool wasMinimized = false;

            if (isExplicitHwnd) {
                long val;
                string clean = query.Replace("0x", "").Trim();
                if (long.TryParse(clean, System.Globalization.NumberStyles.HexNumber, null, out val) && val > 0) {
                    targetHwnd = (IntPtr)val;
                } else if (long.TryParse(clean, out val) && val > 0) {
                    targetHwnd = (IntPtr)val;
                }
            }

            if (targetHwnd == IntPtr.Zero && hDesk != IntPtr.Zero) {
                EnumDesktopWindows(hDesk, (wnd, l) => {
                    uint pid = 0;
                    GetWindowThreadProcessId(wnd, out pid);
                    StringBuilder sb = new StringBuilder(256);
                    GetWindowText(wnd, sb, 256);
                    string t = sb.ToString();

                    string procName = "";
                    if (pid > 0) {
                        try {
                            var p = System.Diagnostics.Process.GetProcessById((int)pid);
                            procName = p.ProcessName;
                        } catch {}
                    }

                    bool match = false;
                    if (!string.IsNullOrEmpty(t) && t.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0) {
                        match = true;
                    }

                    if (!match && !string.IsNullOrEmpty(procName) && procName.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0) {
                        match = true;
                    }

                    // Reconocimiento inteligente de sinónimos DAW / FL Studio
                    if (!match && (query.Equals("FL64", StringComparison.OrdinalIgnoreCase) || query.Equals("FL Studio", StringComparison.OrdinalIgnoreCase) || query.Equals("flstudio", StringComparison.OrdinalIgnoreCase))) {
                        if (procName.StartsWith("FL", StringComparison.OrdinalIgnoreCase) || t.StartsWith("FL Studio", StringComparison.OrdinalIgnoreCase)) {
                            match = true;
                        }
                    }

                    if (match) {
                        RECT r;
                        GetWindowRect(wnd, out r);
                        bool isMin = (r.Left <= -30000 || r.Top <= -30000 || IsIconic(wnd));

                        if (isMin && !string.IsNullOrEmpty(t)) {
                            targetHwnd = wnd;
                            matchedTitle = t;
                            wasMinimized = true;
                            return false; // Detener enumeración, ventana principal encontrada
                        }

                        long curW = r.Right - r.Left;
                        long curH = r.Bottom - r.Top;
                        long area = curW * curH;
                        if (curW > 80 && curH > 80 && area > bestArea) {
                            targetHwnd = wnd;
                            bestArea = area;
                            matchedTitle = string.IsNullOrEmpty(t) ? ("HWND_" + wnd.ToString()) : t;
                        }
                    }
                    return true;
                }, IntPtr.Zero);
            }

            if (targetHwnd == IntPtr.Zero) {
                if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
                result = "ERROR:Window not found for query: " + query;
                return;
            }

            RECT rect;
            GetWindowRect(targetHwnd, out rect);
            if (rect.Left <= -30000 || rect.Top <= -30000 || IsIconic(targetHwnd)) {
                wasMinimized = true;
                ShowWindow(targetHwnd, SW_SHOWNOACTIVATE);
                Thread.Sleep(120);
                GetWindowRect(targetHwnd, out rect);
                if (rect.Left <= -30000 || rect.Top <= -30000) {
                    ShowWindow(targetHwnd, SW_RESTORE);
                    Thread.Sleep(120);
                    GetWindowRect(targetHwnd, out rect);
                }
            }

            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;

            if (width <= 0 || height <= 0) {
                if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
                result = "ERROR:Invalid dimensions (" + width + "x" + height + ")";
                return;
            }

            bool captured = false;
            string methodUsed = "WGC_PrintWindow";

            using (Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(bmp)) {
                    IntPtr hdc = g.GetHdc();
                    try {
                        captured = PrintWindow(targetHwnd, hdc, PW_RENDERFULLCONTENT);
                        if (!captured) {
                            captured = PrintWindow(targetHwnd, hdc, 0);
                            methodUsed = "PrintWindow_Standard";
                        }
                    } finally {
                        g.ReleaseHdc(hdc);
                    }
                }

                if (!captured) {
                    // Fallback: Screen crop BitBlt de la región visible
                    IntPtr hDeskDc = GetDC(IntPtr.Zero);
                    IntPtr hMemDc = CreateCompatibleDC(hDeskDc);
                    IntPtr hBmp = CreateCompatibleBitmap(hDeskDc, width, height);
                    IntPtr hOld = SelectObject(hMemDc, hBmp);

                    bool bltOk = BitBlt(hMemDc, 0, 0, width, height, hDeskDc, rect.Left, rect.Top, SRCCOPY_CAPTURE);

                    SelectObject(hMemDc, hOld);
                    DeleteDC(hMemDc);
                    ReleaseDC(IntPtr.Zero, hDeskDc);

                    if (bltOk) {
                        using (Bitmap screenCrop = Image.FromHbitmap(hBmp)) {
                            screenCrop.Save(outFile, ImageFormat.Png);
                        }
                        captured = true;
                        methodUsed = "ScreenCrop_BitBlt";
                    }
                    DeleteObject(hBmp);
                } else {
                    bmp.Save(outFile, ImageFormat.Png);
                }
            }

            if (wasMinimized) {
                ShowWindow(targetHwnd, SW_MINIMIZE);
            }

            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);

            if (captured) {
                result = "OK:" + width + "x" + height + ":" + methodUsed + ":" + targetHwnd + ":" + matchedTitle;
            } else {
                result = "ERROR:Capture failed for window handle " + targetHwnd;
            }
        });

        worker.SetApartmentState(ApartmentState.STA);
        worker.Start();
        worker.Join(12000);

        if (prevForeground != IntPtr.Zero) {
            SetForegroundWindow(prevForeground);
        }

        return result;
    }
}
'@
}

# Ejecución según el modo solicitado
$res = ""
if ($Mode -eq "desktop") {
    $res = [FluxerCaptureEngine]::CaptureDesktop($OutFile)
} else {
    $isHwndVal = [bool]$IsHwnd
    $res = [FluxerCaptureEngine]::CaptureWindow($Query, $isHwndVal, $OutFile)
}

Write-Output $res
