# Question Bank Web Application

## Overview

Enterprise-grade Question Bank Web Application for academic content management. Allows administrators to create Subjects, Chapters, Questions with LaTeX support, image uploads stored as BLOBs in PostgreSQL, live preview rendering, and professional PDF export functionality.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS + KaTeX + react-resizable-panels
- **API framework**: Express 5
- **Database**: PostgreSQL (via Drizzle ORM) — images stored as `bytea` BLOBs
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **PDF Export**: Puppeteer + KaTeX rendering
- **Image Upload**: multer (memory storage) → stored in DB as bytea

## Application Structure

### Frontend (`artifacts/question-bank/`)
- `/` — Dashboard with stats cards, charts by subject/difficulty, recent questions
- `/subjects` — CRUD for subjects
- `/chapters` — CRUD for chapters (filterable by subject)
- `/questions` — Question list with search, filter (difficulty/type/subject/chapter), pagination
- `/questions/new` — Split-screen question editor (form + preview panel)
- `/questions/:id/edit` — Edit existing question
- `/export` — PDF export panel (by question, chapter, subject, or selected)

### Backend (`artifacts/api-server/`)

Routes:
- `GET/POST /api/subjects` — List/create subjects
- `GET/PUT/DELETE /api/subjects/:id` — Get/update/delete subject
- `GET/POST /api/chapters` — List/create chapters (filter by subjectId)
- `GET/PUT/DELETE /api/chapters/:id` — Get/update/delete chapter
- `GET/POST /api/questions` — List/create questions (with image upload)
- `GET/PUT/DELETE /api/questions/:id` — Get/update/delete question
- `GET /api/questions/:id/image` — Serve question image from DB
- `GET /api/questions/:id/preview` — Question preview with base64 images
- `POST/PUT/DELETE /api/choices` — Choice management (with image upload)
- `GET /api/choices/:id/image` — Serve choice image from DB
- `GET /api/dashboard/stats` — Dashboard statistics
- `GET /api/dashboard/subject-breakdown` — Questions per subject
- `GET /api/dashboard/difficulty-breakdown` — Questions per difficulty
- `GET /api/dashboard/recent-questions` — Recently added questions
- `GET /api/export/pdf/question/:id` — Export single question to PDF
- `GET /api/export/pdf/chapter/:id` — Export chapter questions to PDF
- `GET /api/export/pdf/subject/:id` — Export all subject questions to PDF
- `POST /api/export/pdf/selected` — Export selected question IDs to PDF

### Database (`lib/db/`)
Tables: `subjects`, `chapters`, `questions` (with bytea image), `choices` (with bytea image)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Key Features

- **LaTeX rendering** via KaTeX in both the editor preview and question lists
- **Image storage** as binary BLOBs in PostgreSQL (no filesystem)
- **Split-screen editor** with react-resizable-panels (draggable divider)
- **PDF export** using Puppeteer with KaTeX auto-render for math
- **Validation**: MCQ requires 2-6 choices, exactly 1 correct; file type/size limits
- **Pagination** on question lists
- **Search & filter** by keyword, difficulty, type, subject, chapter

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
