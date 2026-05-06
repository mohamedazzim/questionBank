# Bulk Upload - Getting Started Guide

## Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
pnpm add extract-zip@^2.0.1
pnpm install
```

### 2. Create Test ZIP
```bash
echo "\\documentclass{article}\\begin{document}\\question{Q}\\option{A}\\option{B}\\end{document}" > test.tex
zip test.zip test.tex
```

### 3. Start Application
```bash
# Terminal 1: Backend
cd artifacts/api-server && pnpm run dev

# Terminal 2: Frontend
cd artifacts/question-bank && pnpm run dev
```

### 4. Create Subject & Chapter (First Time Only)
- Go to http://localhost:5173/subjects
- Click "Add Subject" → Create "Test"
- Go to http://localhost:5173/chapters  
- Click "Add Chapter" → Create "Chapter 1"

### 5. Upload ZIP
- Go to http://localhost:5173/bulk-upload
- Select Subject "Test" and Chapter "Chapter 1"
- Drag/drop test.zip
- Click "Import Questions"
- ✅ Done! Questions should be imported

## Creating Real LaTeX Files

### Simple Multi-Choice
```latex
\documentclass{article}
\begin{document}

\question{What is 2+2?}
\option{4}
\option{5}
\option{6}

\end{document}
```

### With Images
```latex
\documentclass{article}
\usepackage{graphicx}
\begin{document}

\question{What shape is this?}
\includegraphics{shape.png}
\option{Circle}
\option{Square}

\end{document}
```

### Organized Structure
```latex
\documentclass{article}
\begin{document}

\section{Chapter 1}

\subsection{Topic A}
\question{Question 1}
\option{A}
\option{B}

\subsection{Topic B}
\question{Question 2}
\option{C}
\option{D}

\end{document}
```

## API Testing

```bash
# Test endpoint exists
curl -X POST http://localhost:3000/api/questions/bulk/upload \
  -F "zipFile=@test.zip" \
  -F "chapterId=1" | jq .

# Check results
curl "http://localhost:3000/api/questions?chapterId=1" | jq .
```

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "No LaTeX files found" | Ensure ZIP has `.tex` file |
| "Chapter not found" | Verify chapter ID is correct |
| "Cannot find module" | Run `pnpm install` then rebuild |
| "Port already in use" | Change port in config or kill process |
| Images not linking | Check image names match LaTeX references |

## Features

✅ Smart file discovery (finds LaTeX in messy ZIPs)
✅ Automatic image mapping (flexible path resolution)
✅ Organized sections (preserves structure)
✅ Error resilience (skip bad questions, continue)
✅ Detailed reporting (statistics, warnings, errors)
✅ Security (zip-slip protection, size limits)

## Documentation

- **Full Guide**: `BULK_INGESTION_GUIDE.md`
- **Technical**: `BULK_INGESTION_TECHNICAL.md`  
- **LaTeX Ref**: `BULK_UPLOAD_QUICK_REFERENCE.md`
- **Validation**: `ARCHITECTURE_VALIDATION.md`

## Next Steps

1. Try the examples above
2. Create your own LaTeX files
3. Batch import your question collections
4. Review full documentation for advanced features

---

**Need help?** Check the error message in the upload results - it's very specific!
