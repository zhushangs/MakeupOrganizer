@echo off
chcp 65001 >nul
rem Builds the frontend, applies new database migrations and deploys to Cloudflare.
rem Double-click to run. If it asks about applying migrations, type y and press Enter.
cd /d "%~dp0"
call npm run deploy
echo.
pause
