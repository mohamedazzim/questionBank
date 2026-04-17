@echo off
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

echo ✓ Database: postgresql://postgres:***@localhost:5432/question_bank_pro
echo ✓ Port: %PORT%
echo ✓ Environment: %NODE_ENV%
echo.

REM Start API server
cd artifacts/api-server
if exist dist\index.mjs (
  node --enable-source-maps ./dist/index.mjs
) else (
  cd ..\..
  pnpm --filter @workspace/api-server run dev
)

REM Keep window open if there's an error
if %errorlevel% neq 0 (
  echo.
  echo ✗ Server exited with error: %errorlevel%
  pause
)
