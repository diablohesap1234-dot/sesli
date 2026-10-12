@echo off
title Ozel Sesli ve Yazili Sohbet Sunucusu
cls

cd /d "%~dp0"

echo ========================================================
echo   OZEL SESLI VE YAZILI GRUP SOHBET UYGULAMASI
echo ========================================================
echo.

if exist ".venv\Scripts\python.exe" goto start_server

echo Python ortami hazirlaniyor...
python -m venv .venv
if errorlevel 1 goto python_error

.\.venv\Scripts\python.exe -m pip install -r requirements.txt

:start_server
echo Sunucu baslatiliyor...
echo.
echo --------------------------------------------------------
echo  Tarayicinizdan su adrese girin:
echo  http://localhost:8000
echo --------------------------------------------------------
echo.
echo Sunucuyu durdurmak icin CTRL+C tusuna basin.
echo.

.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
goto end

:python_error
echo HATA: Python bulunamadi! Lutfen Python 3 yuklu oldugundan emin olun.
pause

:end
pause
