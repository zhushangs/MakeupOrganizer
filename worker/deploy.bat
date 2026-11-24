@echo off
chcp 65001 >nul
rem Builds the frontend and deploys the Worker to Cloudflare. Double-click to run.
rem (Plain "npx wrangler deploy" skips the frontend build, so UI changes would not go live.)
rem
rem Signing in:
rem  - Best: put a Cloudflare API token in worker\.cloudflare-token (one line, git-ignored).
rem    It doesn't expire like the browser sign-in, so there's never a login page. See README.
rem  - Otherwise this checks the browser sign-in first and opens the login page only when needed,
rem    and once more if the deploy still fails for a sign-in reason.
cd /d "%~dp0"

if exist ".cloudflare-token" (
  for /f "usebackq tokens=* delims=" %%t in (".cloudflare-token") do if not defined CLOUDFLARE_API_TOKEN set "CLOUDFLARE_API_TOKEN=%%t"
)
if exist ".cloudflare-account" (
  for /f "usebackq tokens=* delims=" %%a in (".cloudflare-account") do if not defined CLOUDFLARE_ACCOUNT_ID set "CLOUDFLARE_ACCOUNT_ID=%%a"
)
if defined CLOUDFLARE_API_TOKEN (
  echo Using the API token in worker\.cloudflare-token
  goto deploy
)

echo Checking the Cloudflare sign-in...
call npx wrangler whoami --json >nul 2>&1
if errorlevel 1 (
  echo Not signed in ^(or the sign-in expired^). Opening the Cloudflare login page...
  call npx wrangler login
  if errorlevel 1 goto failed
)

:deploy
call npm run deploy
if not errorlevel 1 goto done

rem The deploy failed. If it was the sign-in, log in again and try once more.
if defined CLOUDFLARE_API_TOKEN goto failed
call npx wrangler whoami --json >nul 2>&1
if not errorlevel 1 goto failed
echo.
echo The sign-in expired during the deploy. Opening the Cloudflare login page...
call npx wrangler login
if errorlevel 1 goto failed
call npm run deploy
if not errorlevel 1 goto done

:failed
echo.
echo Deploy did not finish. Scroll up for the error.
echo.
pause
exit /b 1

:done
echo.
echo Deployed.
echo.
pause
