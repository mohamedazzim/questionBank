@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM QUESTION BANK PRO - API SERVER STARTUP
REM ============================================================

echo.
echo Starting API Server...
echo.

cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"

REM Set environment variables
if "%DATABASE_URL%"=="" set DATABASE_URL=postgresql://postgres:data@localhost:5432/question_bank_pro
if "%PORT%"=="" set PORT=8080
if "%NODE_ENV%"=="" set NODE_ENV=development

echo [OK] Database: postgresql://postgres:***@localhost:5432/question_bank_pro
echo [OK] Port: %PORT%
echo [OK] Environment: %NODE_ENV%
echo.

set PORT_PID=
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set PORT_PID=%%P
)

if not "!PORT_PID!"=="" (
  echo [ERROR] Port %PORT% is already in use by PID !PORT_PID!.
  echo Run this to stop it:
  echo   taskkill /PID !PORT_PID! /F
  echo Or run API on another port in PowerShell:
  echo   $env:PORT="8081"
  echo   .\start-api-server.bat
  pause
  exit /b 1
)

REM Start API server
cd artifacts/api-server
echo Building API server...
call pnpm --filter @workspace/api-server run build
if %errorlevel% neq 0 (
  echo [ERROR] API build failed: %errorlevel%
  pause
  exit /b %errorlevel%
)

echo Starting API server...
node --enable-source-maps ./dist/index.mjs

REM Keep window open if there's an error
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Server exited with error: %errorlevel%
  pause
)
