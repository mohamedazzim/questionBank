@echo off
REM ============================================================
REM QUESTION BANK PRO - FRONTEND STARTUP
REM ============================================================

echo.
echo Starting Frontend Dev Server...
echo.

cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"

REM Set environment variables
set PORT=3000
set BASE_PATH=/

echo ✓ Port: 3000
echo ✓ Base Path: /
echo.

REM Start frontend dev server
pnpm --filter @workspace/question-bank run dev

REM Keep window open if there's an error
if %errorlevel% neq 0 (
  echo.
  echo ✗ Server exited with error: %errorlevel%
  pause
)
