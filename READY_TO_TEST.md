# Ready To Test (Windows)

## Current status

- Build: passing
- Typecheck: passing
- API + frontend startup scripts: Windows-ready
- DB target: `question_bank_pro`

## Start in 3 steps

### 1) Setup terminal env

```powershell
cd "D:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
$env:DATABASE_URL="postgresql://postgres:data@localhost:5432/question_bank_pro"
```

### 2) Initialize once

```powershell
.\setup_and_run.bat
```

### 3) Run both services

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

## URLs

- Frontend: http://localhost:3000
- API health: http://localhost:8080/api/healthz

## Quick validation commands

```powershell
curl http://localhost:8080/api/healthz
pnpm --filter @workspace/scripts run runtime-smoke
```

## If anything fails

```powershell
pnpm install
pnpm build
pnpm --filter @workspace/db run push
```
