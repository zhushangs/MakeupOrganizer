@echo off
chcp 65001 >nul
echo.
echo   NOTE: this is the legacy ASP.NET Core version, no longer used or maintained.
echo   The app runs on Cloudflare now (see README). This copy uses its own separate local data.
echo.
cd /d "%~dp0server\MakeupOrganizer.Api"
dotnet run -c Release
pause
