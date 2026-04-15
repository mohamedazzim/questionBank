# Question Bank Pro - Setup Guide

## Prerequisites

- Node.js 24 (installed ✅)
- PostgreSQL 12+ 
- pnpm (the monorepo package manager - installed ✅)

## Database Setup

### Option 1: Using PostgreSQL Locally (Windows)

1. **Install PostgreSQL**
   - Download from https://www.postgresql.org/download/windows/
   - Install with default settings (port 5432)
   - Remember the postgres password you set during installation

2. **Create Database**
   ```bash
   # Connect as postgres user
   psql -U postgres
   
   # In psql prompt:
   CREATE DATABASE question_bank;
   ```

3. **Set DATABASE_URL** (in your terminal/command prompt)
   ```bash
   # Windows Command Prompt
   set DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank
   
   # Or Windows PowerShell
   $env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank"
   
   # Or Git Bash
   export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/question_bank"
   ```

### Option 2: Using Neon (Cloud PostgreSQL)

1. Go to https://neon.tech and create a free account
2. Create a new project (PostgreSQL database)
3. Copy the connection string from "Connection string" section
4. Set the environment variable:
   ```bash
   set DATABASE_URL=your_neon_connection_string
   ```

### Option 3: Using Docker

```bash
# Run PostgreSQL in Docker
docker run --name postgres-qb -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15

# Set DATABASE_URL
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

## Environment Variables

Create a `.env` file in the root directory or set these in your terminal:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:port/database

# Optional (defaults shown)
PORT=8080
BASE_PATH=/
NODE_ENV=development
LOG_LEVEL=info
```

## Running the Application

### Step 1: Build Everything

```bash
cd "d:\StrangerThings Season 5\Question-Bank-Pro\Question-Bank-Pro"
pnpm run build
```

### Step 2: Push Database Schema (First time only)

```bash
# This creates all tables in your database
pnpm --filter @workspace/db run push
```

### Step 3: Start API Server

**In Terminal 1:**

```bash
# Set PORT if custom
set PORT=8080

# Start API server
pnpm --filter @workspace/api-server run dev

# Expected output:
# > Server listening on port 8080
```

### Step 4: Start Frontend (in new terminal)

**In Terminal 2:**

```bash
# Set ports if custom
set PORT=3000
set BASE_PATH=/

# Start frontend dev server
pnpm --filter @workspace/question-bank run dev

# Expected output:
# > VITE v... dev server running at:
# > Local: http://localhost:3000/
```

## Access the Application

Once both servers are running:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080/api
- **Health Check**: http://localhost:8080/api/healthz

## Testing Flow

1. **Dashboard** - View empty statistics
2. **Subjects** - Create a new subject
3. **Chapters** - Add chapters to the subject
4. **Questions** - Create questions with:
   - Text with LaTeX (try: `$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$`)
   - Image uploads (PNG, JPG, JPEG - max 5MB)
   - Multiple choice or fill-in-the-blank
5. **Choices** - Add multiple choice options
6. **Export** - Generate PDF of questions
7. **Dashboard** - See updated statistics

## Troubleshooting

### "DATABASE_URL must be set" Error
- Make sure you set the environment variable BEFORE running the app
- Verify the DATABASE_URL is correct by testing connection
- Try: `psql connection_string_here` to verify

### "Cannot connect to database" Error
- Make sure PostgreSQL is running
- Check connection string: `postgresql://user:password@host:port/database`
- Verify database exists (see "Create Database" above)
- Check firewall isn't blocking port 5432

### "Port 8080 already in use" Error
```bash
# Windows
netstat -ano | findstr :8080

# Kill the process
taskkill /PID process_id /F

# Or use different port
set PORT=8081
```

### Build Errors
```bash
# Clean and reinstall
pnpm install
pnpm run build
```

### Database Schema Missing
```bash
# Push schema to database
pnpm --filter @workspace/db run push
```

## Development Commands

```bash
# Type checking
pnpm run typecheck

# Build all packages
pnpm run build

# API server development
pnpm --filter @workspace/api-server run dev

# Frontend development
pnpm --filter @workspace/question-bank run dev

# Regenerate API from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push database schema changes
pnpm --filter @workspace/db run push

# View database schema
pnpm --filter @workspace/db run introspect
```

## Production Build

```bash
# Build optimized versions
pnpm run build

# Start API server (production)
set NODE_ENV=production
pnpm --filter @workspace/api-server run start

# Start frontend (production)
pnpm --filter @workspace/question-bank run serve
```

## Architecture Overview

```
Question Bank Pro
├── API Server (Express.js)
│   ├── Routes: subjects, chapters, questions, choices, dashboard, export
│   ├── Middleware: CORS, logging, validation
│   └── Features: PDF generation, image upload, LaTeX rendering
│
├── Frontend (React + Vite)
│   ├── Pages: dashboard, subjects, chapters, questions, export
│   ├── Components: forms, tables, editor, charts
│   └── Features: LaTeX preview, image upload, split-screen editor
│
├── Database (PostgreSQL)
│   ├── Tables: subjects, chapters, questions, choices
│   └── Storage: Images stored as bytea BLOB
│
└── Libraries
    ├── API Client (React Query hooks)
    ├── API Schema (Zod validation)
    └── Database (Drizzle ORM)
```

## Performance Tips

- LaTeX rendering is done server-side for PDF, client-side for preview
- Images are stored as binary blobs in database for efficiency
- React Query handles caching and cache invalidation
- Pagination on questions list (default 20 per page)
- Database indexes on foreign keys for fast lookups

## Support

If you encounter issues:

1. Check the error message in the terminal
2. Verify DATABASE_URL is set and correct
3. Make sure PostgreSQL is running
4. Check that all ports (3000, 8080) are available
5. Review FIXES_APPLIED.md for recently fixed issues

---

**Ready to test!** Follow the steps above and let me know if you encounter any issues.
