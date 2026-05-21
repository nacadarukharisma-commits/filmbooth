@echo off
title FilmBooth Launcher
color 0A

echo.
echo  =========================================
echo    FILMBOOTH - Starting up...
echo  =========================================
echo.

:: Cek Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js tidak ditemukan!
    echo  Download di: https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies kalau belum ada
if not exist "node_modules" (
    echo  Installing dependencies...
    call npm install
    echo.
)

:: Cek cloudflared
if not exist "cloudflared.exe" (
    echo  [ERROR] cloudflared.exe tidak ada di folder ini!
    pause
    exit /b 1
)

:: Start Node.js server
echo  [1/3] Starting FilmBooth server...
start "FilmBooth Server" /min node server.js
timeout /t 2 /nobreak >nul

:: Start cloudflared, simpan output ke temp file
echo  [2/3] Starting Cloudflare tunnel...
set CFLOG=%TEMP%\filmbooth_cf.log
if exist "%CFLOG%" del "%CFLOG%"
start "FilmBooth Tunnel" /min cmd /c "cloudflared.exe tunnel --url http://localhost:3000 > %CFLOG% 2>&1"

:: Tunggu URL muncul (max 20 detik)
echo  Menunggu URL cloudflare
set CF_URL=
set /a COUNT=0
:waitloop
timeout /t 1 /nobreak >nul
set /a COUNT+=1
findstr /i "trycloudflare.com" "%CFLOG%" >nul 2>&1
if %errorlevel%==0 goto :extracturl
if %COUNT% GEQ 20 goto :timeout
echo  . menunggu... (%COUNT%s)
goto :waitloop

:extracturl
:: Cari baris yang ada URL nya
for /f "delims=" %%L in ('findstr /i "trycloudflare.com" "%CFLOG%"') do set LASTLINE=%%L
:: Ambil URL pakai powershell sederhana
for /f %%U in ('powershell -nologo -noprofile -command "$m=[regex]::Match('%LASTLINE%','https://\S+trycloudflare\.com');if($m.Success){$m.Value}"') do set CF_URL=%%U

if "%CF_URL%"=="" goto :timeout

echo.
echo  =========================================
echo    URL: %CF_URL%
echo  =========================================
echo.
echo  [3/3] Membuka browser...
start "" "%CF_URL%"
goto :done

:timeout
echo.
echo  [!] Gagal detect URL otomatis.
echo  Buka window "FilmBooth Tunnel" dan copy URL-nya manual.
echo  Atau buka: http://localhost:3000
start http://localhost:3000

:done
echo.
echo  Tekan tombol apapun untuk matiin semua...
pause >nul
taskkill /f /fi "WindowTitle eq FilmBooth Server*" >nul 2>&1
taskkill /f /fi "WindowTitle eq FilmBooth Tunnel*" >nul 2>&1
echo  Server dimatikan.