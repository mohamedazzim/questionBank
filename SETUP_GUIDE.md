# Question Bank Pro - Windows Setup and Deployment Guide

This guide is for a new Windows machine and includes copy-paste commands.

## 1. Prerequisites

Install these first:

1. Node.js LTS (v20 or newer): https://nodejs.org
2. PostgreSQL 14+ (local) or Neon cloud database: https://www.postgresql.org / https://neon.tech
3. Git: https://git-scm.com

Open PowerShell and verify:

```powershell
node -v
npm -v
git --version
```

Enable pnpm with Corepack:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

## 2. Clone and open project

```powershell
git clone <your-repo-url>
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
```

## 3. Configure database

### Option A: Local PostgreSQL

Create database:

```powershell
psql -U postgres -c "CREATE DATABASE question_bank_pro;"
```

Set database URL in current terminal:

```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank_pro"
```

### Option B: Neon (cloud)

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
```

## 4. One-command setup (recommended)

```powershell
.\setup_and_run.bat
```

What it does:

1. `pnpm install`
2. `pnpm build`
3. `pnpm --filter @workspace/db run push`

## 5. Start the app (two terminals)

Terminal 1 (API):

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank_pro"
.\start-api-server.bat
```

Terminal 2 (Frontend):

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
.\start-frontend.bat
```

Open in browser:

- Frontend: http://localhost:3000
- API health: http://localhost:8080/api/healthz

## 6. Manual commands (if you do not use .bat files)

```powershell
pnpm install
pnpm build
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/question-bank run dev
```

## 7. Production-style deployment on Windows server

Use this flow on a fresh server after cloning:

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
corepack enable
corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile
pnpm build
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank_pro"
pnpm --filter @workspace/db run push
```

Run API in production mode:

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
$env:NODE_ENV="production"
$env:PORT="8080"
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank_pro"
cd artifacts/api-server
node --enable-source-maps ./dist/index.mjs
```

Frontend production artifact is generated at:

- `artifacts/question-bank/dist/public`

Serve it with your preferred Windows web server or reverse proxy to API on port 8080.

## 8. Health and smoke checks

```powershell
curl http://localhost:8080/api/healthz
pnpm --filter @workspace/scripts run runtime-smoke
```

## 9. Common Windows troubleshooting

Port already in use:

```powershell
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

Reinstall dependencies:

```powershell
pnpm store prune
pnpm install
pnpm build
```

Database schema mismatch:

```powershell
pnpm --filter @workspace/db run push
```

## 10. Windows command reference

```powershell
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/question-bank run dev
pnpm --filter @workspace/scripts run runtime-smoke
```
