@echo off
title Arkadaslarla Paylas - Guvenli HTTPS Baglantisi
cls

cd /d "%~dp0"

echo ========================================================
echo   ARKADASLARLA PAYLAS - GUVENLI HTTPS BAGLANTISI
echo ========================================================
echo.
echo Tunel baslatiliyor, lutfen 3-5 saniye bekleyin...
echo.
echo --------------------------------------------------------
echo  Asagida cikacak kutudaki:
echo  https://....trycloudflare.com
echo  linkini kopyalayip 5 arkadasiniza gonderin!
echo.
echo  (Bu pencereyi sohbet bitene kadar KAPATMAYIN)
echo --------------------------------------------------------
echo.

cloudflared.exe tunnel --url http://localhost:8000

echo.
echo Tunel durduruldu.
pause
