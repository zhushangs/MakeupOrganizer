@echo off
chcp 65001 >nul
cd /d "%~dp0server\MakeupOrganizer.Api"
dotnet run -c Release
pause
