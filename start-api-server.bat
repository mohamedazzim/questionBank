@echo off
REM ============================================================
REM QUESTION BANK PRO - API SERVER STARTUP
REM ============================================================

echo.
echo Starting API Server...
echo.

cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"

REM Set environment variables
set DATABASE_URL=postgresql://postgres:data@localhost:5432/question_bank_pro
set PORT=8080
set NODE_ENV=development

echo ✓ Database: postgresql://postgres:***@localhost:5432/question_bank_pro
echo ✓ Port: 8080
echo ✓ Environment: development
echo.

REM Start API server
cd artifacts/api-server
node --enable-source-maps ./dist/index.mjs

REM Keep window open if there's an error
if %errorlevel% neq 0 (
  echo.
  echo ✗ Server exited with error: %errorlevel%
  pause
)
