@echo off
chcp 65001 >nul
rem Builds the frontend and deploys the Worker to Cloudflare. Double-click to run.
rem (Plain "npx wrangler deploy" skips the frontend build, so UI changes would not go live.)
cd /d "%~dp0"
call npm run deploy
echo.
pause
