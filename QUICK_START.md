# Quick Start (Windows)

Use this when you want the fastest path on a fresh Windows machine.

## 1) Open PowerShell in project root

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
```

## 2) Install Node + pnpm (one-time on new machine)

```powershell
# Verify Node.js (requires v20+)
node -v

# Enable pnpm via Corepack
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

## 3) Set database connection (current terminal)

```powershell
$env:DATABASE_URL="postgresql://postgres:data@localhost:5432/question_bank_pro"
```

## 4) One-command setup (install + build + db push)

```powershell
.\setup_and_run.bat
```

## 5) Start API and Frontend (two terminals)

Terminal 1:

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
$env:DATABASE_URL="postgresql://postgres:data@localhost:5432/question_bank_pro"
.\start-api-server.bat
```

Terminal 2:

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
.\start-frontend.bat
```

## 6) Open app

- Frontend: http://localhost:3000
- API health: http://localhost:8080/api/healthz

## Optional: direct commands (without .bat files)

```powershell
pnpm install
pnpm build
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/question-bank run dev
```
