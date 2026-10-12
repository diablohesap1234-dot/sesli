@echo off
chcp 65001 >nul
title AGALAR SESLI SOHBET (Masaustu Ozel Surum)
echo =======================================================
echo   👑 AGALAR SESLI SOHBET BASLATILIYOR...
echo   Masaustu Ozel Surum & Dusuk RAM Modu (~35MB)
echo =======================================================

set APP_URL=https://sesli2.onrender.com/?mode=desktop

:: 1. Microsoft Edge Standalone App Modu (Windows Yerel - En dusuk RAM ~35MB)
start "" msedge.exe --app="%APP_URL%" 2>nul
if %errorlevel% equ 0 exit

:: 2. Google Chrome Standalone App Modu (Alternatif)
start "" chrome.exe --app="%APP_URL%" 2>nul
if %errorlevel% equ 0 exit

:: 3. Varsayilan Tarayici
start "" "%APP_URL%"
exit
