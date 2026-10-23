@echo off
chcp 65001 >nul
title AGALAR OYUN OVERLAY ASISTANI
echo =====================================================================
echo   AGALAR SESLI SOHBET - STEAM OYUN ICI OVERLAY BASLATILIYOR...
echo =====================================================================
echo   [KISAYOLLAR - OYUNDAYKEN CALISIR]
echo   * Shift + Tab (veya Alt + Q) : Pencereyi Oyunun Ustune Getir / Gizle
echo   * Alt + G                    : Hayalet Mod (Tiklamalar Oyuna Gecer!)
echo   * Alt + Yukari / Asagi Ok    : Seffaflik Derecesini Ayarla (%40-%100)
echo =====================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$raw = [System.IO.File]::ReadAllText('%~f0', [System.Text.Encoding]::UTF8); $parts = $raw -split '(?m)^# === PS_START ===\r?$', 2; if ($parts.Length -gt 1) { Invoke-Expression $parts[1] }"
exit /b 0
# === PS_START ===
$ErrorActionPreference = 'SilentlyContinue'
$targetUrl = "https://sesli2.onrender.com/?mode=desktop&overlay=1"

$candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe"
)

$browserExe = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($browserExe) {
    Write-Host "  [BASLATILIYOR] Tarayici bulundu: $browserExe" -ForegroundColor Cyan
    Start-Process -FilePath $browserExe -ArgumentList "--app=`"$targetUrl`" --window-size=460,680 --window-position=25,40"
} else {
    Write-Host "  [BASLATILIYOR] Varsayilan tarayici aciliyor..." -ForegroundColor Cyan
    Start-Process $targetUrl
}

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public class Win32Overlay {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

    public static IntPtr FoundHandle = IntPtr.Zero;
    public static IntPtr FindAgalar() {
        FoundHandle = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            StringBuilder sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString();
            if (title.IndexOf("AGALAR SESL", StringComparison.OrdinalIgnoreCase) >= 0 &&
                title.IndexOf("ASISTANI", StringComparison.OrdinalIgnoreCase) < 0) {
                FoundHandle = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return FoundHandle;
    }
}
'@

$GWL_EXSTYLE = -20
$WS_EX_LAYERED = 0x80000
$WS_EX_TRANSPARENT = 0x20
$LWA_ALPHA = 0x2
$HWND_TOPMOST = [IntPtr]::new(-1)
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$SWP_SHOWWINDOW = 0x0040

$alpha = 225
$visible = $true
$ghost = $false
$targetHwnd = [IntPtr]::Zero

Write-Host "  [BEKLENIYOR] Agalar penceresi araniyor..." -ForegroundColor Yellow

while ($true) {
    if ($targetHwnd -eq [IntPtr]::Zero -or -not [Win32Overlay]::IsWindow($targetHwnd)) {
        $found = [Win32Overlay]::FindAgalar()
        if ($found -ne [IntPtr]::Zero) {
            $targetHwnd = $found
            $style = [Win32Overlay]::GetWindowLong($targetHwnd, $GWL_EXSTYLE)
            [Win32Overlay]::SetWindowLong($targetHwnd, $GWL_EXSTYLE, ($style -bor $WS_EX_LAYERED)) | Out-Null
            [Win32Overlay]::SetLayeredWindowAttributes($targetHwnd, 0, $alpha, $LWA_ALPHA) | Out-Null
            [Win32Overlay]::SetWindowPos($targetHwnd, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW)) | Out-Null
            Write-Host "  [AKTIF] Agalar penceresi yakalandi! Seffaf & Her Zaman Ustte (TopMost) devrede." -ForegroundColor Green
        }
    } else {
        $shift = ([Win32Overlay]::GetAsyncKeyState(0x10) -band 0x8000) -ne 0
        $tab   = ([Win32Overlay]::GetAsyncKeyState(0x09) -band 0x8000) -ne 0
        $alt   = ([Win32Overlay]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0
        $keyQ  = ([Win32Overlay]::GetAsyncKeyState(0x51) -band 0x8000) -ne 0
        $keyG  = ([Win32Overlay]::GetAsyncKeyState(0x47) -band 0x8000) -ne 0
        $up    = ([Win32Overlay]::GetAsyncKeyState(0x26) -band 0x8000) -ne 0
        $down  = ([Win32Overlay]::GetAsyncKeyState(0x28) -band 0x8000) -ne 0

        if (($shift -and $tab) -or ($alt -and $keyQ)) {
            $visible = -not $visible
            if ($visible) {
                [Win32Overlay]::ShowWindow($targetHwnd, 9) | Out-Null
                [Win32Overlay]::SetWindowPos($targetHwnd, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW)) | Out-Null
                [Win32Overlay]::SetForegroundWindow($targetHwnd) | Out-Null
            } else {
                [Win32Overlay]::ShowWindow($targetHwnd, 6) | Out-Null
            }
            Start-Sleep -Milliseconds 350
        }

        if ($alt -and $keyG) {
            $ghost = -not $ghost
            $style = [Win32Overlay]::GetWindowLong($targetHwnd, $GWL_EXSTYLE)
            if ($ghost) {
                [Win32Overlay]::SetWindowLong($targetHwnd, $GWL_EXSTYLE, ($style -bor $WS_EX_LAYERED -bor $WS_EX_TRANSPARENT)) | Out-Null
                [Win32Overlay]::SetLayeredWindowAttributes($targetHwnd, 0, 165, $LWA_ALPHA) | Out-Null
                Write-Host "  [HAYALET MOD ACIK] Tiklamalar oyuna geciyor (Alt+G ile kapatilir)" -ForegroundColor Yellow
            } else {
                [Win32Overlay]::SetWindowLong($targetHwnd, $GWL_EXSTYLE, ($style -band (-bnot $WS_EX_TRANSPARENT))) | Out-Null
                [Win32Overlay]::SetLayeredWindowAttributes($targetHwnd, 0, $alpha, $LWA_ALPHA) | Out-Null
                Write-Host "  [HAYALET MOD KAPALI] Pencere tekrar tiklanabilir" -ForegroundColor Green
            }
            Start-Sleep -Milliseconds 350
        }

        if ($alt -and $up) {
            $alpha = [Math]::Min(255, $alpha + 20)
            [Win32Overlay]::SetLayeredWindowAttributes($targetHwnd, 0, $alpha, $LWA_ALPHA) | Out-Null
            Start-Sleep -Milliseconds 180
        }

        if ($alt -and $down) {
            $alpha = [Math]::Max(95, $alpha - 20)
            [Win32Overlay]::SetLayeredWindowAttributes($targetHwnd, 0, $alpha, $LWA_ALPHA) | Out-Null
            Start-Sleep -Milliseconds 180
        }
    }
    Start-Sleep -Milliseconds 45
}
