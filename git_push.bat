@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===================================================
echo   GitHub'a Guncellemeler Gonderiliyor (Render Otomatik Deploy)...
echo ===================================================
git push origin main
echo.
pause
