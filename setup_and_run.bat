@echo off
setlocal
echo.
echo ================================================
echo   QUESTION BANK PRO - SETUP & RUN
echo ================================================
echo.
where pnpm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo ✗ pnpm is not installed.
  echo Install it with: corepack enable ^&^& corepack prepare pnpm@latest --activate
  exit /b 1
)

echo Installing dependencies...
call pnpm install
if %ERRORLEVEL% NEQ 0 exit /b 1

echo Running workspace build...
call pnpm build
if %ERRORLEVEL% NEQ 0 exit /b 1

echo Setting database configuration...
if "%DATABASE_URL%"=="" set DATABASE_URL=postgresql://postgres:data@localhost:5432/question_bank_pro
echo ✓ DATABASE_URL set
echo.
echo Pushing database schema...
call pnpm --filter @workspace/db run push
echo.
if %ERRORLEVEL% EQU 0 (
  echo ✓ Database schema initialized successfully!
  echo.
  echo ================================================
  echo   STARTING APPLICATION SERVERS
  echo ================================================
  echo.
  echo Choose which server to start:
  echo.
  echo Option 1: Start API Server
  echo   Command: call start-api-server.bat
  echo.
  echo Option 2: Start Frontend
  echo   Command: call start-frontend.bat
  echo.
  echo Note: You need TWO terminal windows to run both servers
  echo.
  echo Open http://localhost:3000 when both are running
  echo.
) else (
  echo ✗ Database schema push failed
  echo Make sure:
  echo   - PostgreSQL is running
  echo   - Database "question_bank_pro" exists
  echo   - Credentials are correct
  exit /b 1
)
