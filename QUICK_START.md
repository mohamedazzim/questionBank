# 🚀 APPLICATION READY TO RUN!

## Your Database Configuration
```
Host: localhost
Port: 5432
User: postgres
Password: data
Database: study_smart_hub
```

## How to Start the Application

### ✅ OPTION 1: Using Batch Files (Easiest)

**Step 1:** Open **Command Prompt** and run:
```cmd
cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
start-api-server.bat
```

**Step 2:** Open another **Command Prompt** and run:
```cmd
cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
start-frontend.bat
```

**Step 3:** Open your browser and go to:
```
http://localhost:3000
```

---

### ✅ OPTION 2: Using PowerShell

**Terminal 1 (API Server):**
```powershell
cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
$env:DATABASE_URL="postgresql://postgres:data@localhost:5432/study_smart_hub"
$env:PORT=8080
cd artifacts/api-server
node --enable-source-maps ./dist/index.mjs
```

**Terminal 2 (Frontend):**
```powershell
cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
$env:PORT=3000
$env:BASE_PATH="/"
pnpm --filter @workspace/question-bank run dev
```

---

### ✅ OPTION 3: Using Git Bash

**Terminal 1 (API Server):**
```bash
cd "/d/StrangerThings Season 5/Question-Bank-Pro/Question-Bank-Pro"
export DATABASE_URL="postgresql://postgres:data@localhost:5432/study_smart_hub"
export PORT=8080
cd artifacts/api-server
node --enable-source-maps ./dist/index.mjs
```

**Terminal 2 (Frontend):**
```bash
cd "/d/StrangerThings Season 5/Question-Bank-Pro/Question-Bank-Pro"
export PORT=3000
export BASE_PATH="/"
pnpm --filter @workspace/question-bank run dev
```

---

## 🧪 Testing the Application

Once both servers are running:

1. **Open**: http://localhost:3000
2. **Create a Subject** (e.g., "Physics")
3. **Create a Chapter** under the subject
4. **Create a Question** with:
   - Text: "What is the formula for kinetic energy?"
   - LaTeX Math: `$KE = \frac{1}{2}mv^2$`
   - Type: MCQ
   - Difficulty: Medium
5. **Add Choices**:
   - Option A: `$\frac{1}{2}mv^2$` (Mark as correct)
   - Option B: `$mv^2$`
   - Option C: `mgh$`
6. **Preview** - LaTeX should render beautifully
7. **Export to PDF** - View the generated PDF  
8. **Dashboard** - See updated statistics

---

## 🔍 Expected Output

### API Server Should Show:
```
[17:09:40.383] [INFO] Server listening
    port: 8080
```

### Frontend Should Show:
```
✓ 3000 server ready
Local: http://localhost:3000
```

---

## 🐛 Troubleshooting

### API Server won't start
- ✓ Ensure PostgreSQL is running
- ✓ Check database exists: `study_smart_hub`
- ✓ Verify credentials: postgres / data
- ✓ Try connecting: `psql -U postgres -d study_smart_hub`

### Frontend won't start
- ✓ Make sure API server is running first
- ✓ Check Port 3000 is available
- ✓ Try: `netstat -ano | findstr :3000`

### Database connection fails
- Port: 5432
- Host: localhost
- User: postgres
- Password: data
- Database: study_smart_hub

---

## 📱 Access Points

- **Frontend**: http://localhost:3000
- **API Health**: http://localhost:8080/api/healthz
- **API Base**: http://localhost:8080/api

---

## ⚡ Quick Commands Reference

| Action | Command |
|--------|---------|
| Start API | `pnpm --filter @workspace/api-server run dev` |
| Start Frontend | `pnpm --filter @workspace/question-bank run dev` |
| Push Database | `pnpm --filter @workspace/db run push` |
| Type Check | `pnpm run typecheck` |
| Build All | `pnpm run build` |

---

## ✨ Features Ready to Test

- ✅ Dashboard with statistics
- ✅ Subject Management (CRUD)
- ✅ Chapter Management (CRUD)
- ✅ Question Editor with Split-Screen Preview
- ✅ LaTeX Math Rendering
- ✅ Image Upload & Storage
- ✅ Multiple Choice Questions
- ✅ PDF Export (Question/Chapter/Subject/Selected)
- ✅ Search & Filtering
- ✅ Pagination

---

**👉 Use Option 1 (Batch Files) for the quickest start!**
