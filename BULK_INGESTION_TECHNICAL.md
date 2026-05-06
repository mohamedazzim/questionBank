# Bulk Ingestion System - Technical Implementation Guide

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend: /bulk-upload Route                                │
│ ├─ Subject & Chapter Selection                              │
│ ├─ Drag & Drop ZIP Upload                                   │
│ └─ Real-time Progress & Results Display                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ POST /api/questions/bulk/upload
                 ├─ zipFile (multipart/form-data)
                 └─ chapterId (form field)
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Backend: Express Route Handler                              │
│ (artifacts/api-server/src/routes/questions.ts:656-710)      │
│                                                              │
│ 1. Validate chapterId exists in database                    │
│ 2. Save temporary ZIP file                                  │
│ 3. Call processBulkIngestion()                              │
│ 4. Return result JSON                                       │
│ 5. Clean up temp ZIP file                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Bulk Ingestion Processor                                    │
│ (lib/bulkIngestionProcessor.ts)                             │
│                                                              │
│ processBulkIngestion(request):                              │
│ ├─ discoverZipContents()                                    │
│ ├─ readFile(primaryTexFile)                                 │
│ ├─ parseLatex(texContent)                                   │
│ ├─ For each ParsedQuestion:                                 │
│ │  ├─ Validate question.text not empty                      │
│ │  ├─ insertQuestion() ──────────┐                          │
│ │  └─ Track stats & errors       │                          │
│ └─ Return BulkIngestionResult    │                          │
└─────────────────────────────────────┼──────────────────────┘
                                      │
                    ┌─────────────────┴──────────────┐
                    │                                │
        ┌───────────▼──────────────┐   ┌────────────▼──────┐
        │ LaTeX Parser             │   │ ZIP Processor     │
        │ (lib/latexParser.ts)     │   │ (lib/zipProcessor)│
        │                          │   │                   │
        │ Input: LaTeX text        │   │ Input: ZIP path   │
        │ Process:                 │   │ Process:          │
        │ ├─Clean content          │   │ ├─Extract ZIP     │
        │ ├─Tokenize commands      │   │ ├─Scan files      │
        │ ├─Parse \section         │   │ ├─Select TEX      │
        │ ├─Parse \question        │   │ ├─Discover images │
        │ ├─Parse \option          │   │ └─Map references  │
        │ ├─Parse \includegraphics │   │                   │
        │ └─Detect type            │   │ Output:           │
        │                          │   │ FileDiscoveryResult
        │ Output: ParseResult      │   └───────────────────┘
        │ ├─ParsedQuestion[]       │
        │ ├─imageReferences Set    │
        │ └─metadata {}            │
        └──────────────────────────┘
```

## Code Flow: Detailed Walkthrough

### Step 1: Frontend Upload Initiated

**File**: `artifacts/question-bank/src/pages/bulk-upload.tsx`

```typescript
const handleUpload = async () => {
  // Validation
  if (!zipFile || !chapterId) return;
  
  // Create multipart form data
  const formData = new FormData();
  formData.append("zipFile", zipFile);
  formData.append("chapterId", chapterId);
  
  // POST request
  const response = await fetch("/api/questions/bulk/upload", {
    method: "POST",
    body: formData
  });
  
  const result: IngestionResult = await response.json();
  setResult(result);  // Display results
};
```

**Key Components**:
- `dragActive` state for drop zone styling
- File validation (`.zip` extension)
- Subject/Chapter cascading selection
- Real-time result display with statistics

### Step 2: Backend Route Handler

**File**: `artifacts/api-server/src/routes/questions.ts` (lines 656-710)

```typescript
router.post("/bulk/upload", bulkUpload.single("zipFile"), async (req, res) => {
  // 1. Validate ZIP file exists
  if (!req.file) {
    res.status(400).json({ error: "No ZIP file uploaded" });
    return;
  }

  // 2. Parse chapterId
  const chapterId = parseInt(req.body.chapterId, 10);
  if (isNaN(chapterId)) {
    res.status(400).json({ error: "Invalid or missing chapterId" });
    return;
  }

  // 3. Verify chapter exists
  const [chapter] = await db.select()
    .from(chaptersTable)
    .where(eq(chaptersTable.id, chapterId));
  
  if (!chapter) {
    res.status(400).json({ error: "Chapter not found" });
    return;
  }

  try {
    // 4. Write temporary ZIP file
    const tmpPath = `/tmp/bulk-upload-${Date.now()}-${random}.zip`;
    await writeFile(tmpPath, req.file.buffer);

    // 5. Process bulk ingestion
    const result = await processBulkIngestion({
      zipFilePath: tmpPath,
      chapterId,
      defaultDifficulty: "UNLABLED"
    });

    // 6. Cleanup and respond
    await rm(tmpPath, { force: true });
    res.status(result.success ? 201 : 200).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to process bulk ingestion",
      detail: String(err)
    });
  }
});
```

**Validation Chain**:
1. File exists ✓
2. chapterId is numeric ✓
3. chapterId references valid chapter ✓
4. Temporary storage is writable ✓

### Step 3: ZIP Discovery & File Processing

**File**: `artifacts/api-server/src/lib/zipProcessor.ts`

#### 3a. ZIP Extraction
```typescript
export async function discoverZipContents(
  zipPath: string, 
  extractDir: string
): Promise<FileDiscoveryResult> {
  // Security: Validate extraction path
  const tmpBase = path.resolve('/tmp');
  const normalizedExtractDir = path.resolve(extractDir);
  
  if (!normalizedExtractDir.startsWith(tmpBase)) {
    throw new Error('Invalid extraction directory');
  }

  // Extract ZIP securely
  await extractZip(zipPath, { dir: extractDir });
  
  // Rest of discovery...
}
```

**Security Check**: Prevents zip-slip attacks by validating extraction target

#### 3b. File Scanning & Filtering
```typescript
async function scanDirectory(dir: string): Promise<string[]> {
  // Recursive walk of directory
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(dir, fullPath);
      
      // Security: Validate path is safe
      if (!validatePath(dir, relativePath)) continue;
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(relativePath);
      }
    }
  }
  
  await walk(dir);
  return files;
}
```

**Filters Applied**:
- Ignored extensions: `.aux`, `.log`, `.out`, `.gz`, `.tmp`, `.dvi`
- Ignored patterns: `.*` (hidden), `*.bak`, `Thumbs.db`

#### 3c. LaTeX File Selection
```typescript
async function selectPrimaryTexFile(
  dir: string, 
  texFiles: string[]
): Promise<string | null> {
  // Scoring algorithm
  const score = (sizeScore * 0.3) + (questionCount * 40) + (sectionCount * 30);
  
  // Returns: largest TEX file with most \question commands
}
```

**Scoring Weights**:
- File size: 30% (normalized to 0-100)
- `\question` count: 40% (raw count)
- `\section` count: 30% (raw count)

#### 3d. Image Discovery & Mapping
```typescript
async function discoverImages(
  dir: string, 
  allFiles: string[]
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  
  for (const file of allFiles) {
    const fileName = path.basename(file);
    const fullPath = path.join(dir, file);
    
    // Multiple lookup keys for flexible matching
    imageMap.set(fileName, fullPath);                    // "photo.png"
    imageMap.set(fileName.toLowerCase(), fullPath);     // "photo.png" (lower)
    
    const nameWithoutExt = path.basename(file, ext);
    imageMap.set(nameWithoutExt, fullPath);             // "photo"
    imageMap.set(nameWithoutExt.toLowerCase(), fullPath); // "photo" (lower)
  }
  
  return imageMap;
}
```

**Mapping Examples**:
```
ZIP Entry: images/diagram.png
Lookup Keys:
  "diagram.png" → /tmp/extract.../images/diagram.png
  "DIAGRAM.PNG" → /tmp/extract.../images/diagram.png
  "diagram" → /tmp/extract.../images/diagram.png
  "DIAGRAM" → /tmp/extract.../images/diagram.png
```

### Step 4: LaTeX Parsing

**File**: `artifacts/api-server/src/lib/latexParser.ts`

#### 4a. Tokenization
```typescript
class LaTeXTokenizer {
  parseBraced(): string | null {
    // Handles balanced braces: { ... \{ ... } ... }
    // Tracks nesting depth
  }
  
  parseCommand(): { command: string; args: string[] } | null {
    // Extracts \command{arg1}{arg2}[optional]
  }
}
```

**Advantages over Regex**:
- Handles nested braces correctly
- Supports optional arguments `[...]`
- Proper escaping handling (`\{`, `\}`)
- Command name extraction

#### 4b. Content Cleaning
```typescript
private cleanContent(content: string): string {
  let cleaned = content;
  
  // Remove document structure
  cleaned = cleaned.replace(/\\documentclass\s*\[[^\]]*\]\s*\{[^}]*\}/g, '');
  cleaned = cleaned.replace(/\\usepackage\s*\[[^\]]*\]\s*\{[^}]*\}/g, '');
  cleaned = cleaned.replace(/\\begin\s*\{\s*document\s*\}/g, '');
  cleaned = cleaned.replace(/\\end\s*\{\s*document\s*\}/g, '');
  
  return cleaned;
}
```

**Removes**:
- `\documentclass{...}`
- `\usepackage{...}`
- `\begin{document}` / `\end{document}`

#### 4c. Command Parsing Loop
```typescript
parse(content: string): ParseResult {
  const tokenizer = new LaTeXTokenizer(cleanContent(content));
  const sections: ParsedSection[] = [];
  const allQuestions: ParsedQuestion[] = [];

  while (tokenizer.hasMore()) {
    const cmd = tokenizer.parseCommand();
    
    if (cmd?.command === 'section') {
      const section = this.parseSection(tokenizer, cmd.args[0]);
      sections.push(section);
      allQuestions.push(...section.questions);
    } else if (cmd?.command === 'question') {
      const question = this.parseQuestion(cmd.args[0], tokenizer);
      allQuestions.push(question);
    }
  }

  return { sections, allQuestions, imageReferences, metadata };
}
```

#### 4d. Question Parsing
```typescript
private parseQuestion(
  initialText: string, 
  tokenizer: LaTeXTokenizer
): ParsedQuestion {
  const question: ParsedQuestion = {
    text: this.sanitizeText(initialText),
    type: 'MCQ',
    options: [],
    images: []
  };

  // Look-ahead for associated commands
  while (tokenizer.hasMore()) {
    const cmd = tokenizer.parseCommand();
    
    if (cmd?.command === 'option') {
      question.options.push({
        text: this.sanitizeText(cmd.args[0]),
        images: [],
        isCorrect: cmd.args[1] === 'true'
      });
    } else if (cmd?.command === 'includegraphics') {
      const image = this.parseImageReference(cmd.args[cmd.args.length - 1]);
      question.images.push(image);
    } else if (cmd?.command === 'question' || cmd?.command === 'section') {
      // Next question, back up parser
      tokenizer.pos -= cmd.command.length + 1;
      break;
    }
  }

  return question;
}
```

**Type Determination Logic**:
```typescript
if (!hasOptions && question.images.length === 0) {
  question.type = 'SUBJECTIVE';
} else if (question.options.length > 0) {
  question.type = 'MCQ';
} else {
  question.type = 'SUBJECTIVE';
}
```

### Step 5: Database Insertion

**File**: `artifacts/api-server/src/lib/bulkIngestionProcessor.ts`

#### 5a. Question Validation
```typescript
for (const question of parseResult.allQuestions) {
  try {
    // Skip empty questions
    if (!question.text || question.text.trim().length === 0) {
      result.warnings.push({
        message: 'Skipping empty question',
        questionIndex: i
      });
      continue;
    }

    // Validate before insertion
    const inserted = await insertQuestion(question, chapterId);
    
    result.stats.questionsInserted++;
    result.questionsCreated.push({
      id: inserted.id,
      text: question.text.substring(0, 100),
      type: question.type,
      imageCount: question.images.length,
      choiceCount: inserted.choiceCount
    });
  } catch (err) {
    result.errors.push({
      message: 'Error processing question',
      questionIndex: i,
      detail: String(err)
    });
    result.stats.errors++;
  }
}
```

#### 5b. Question Insertion
```typescript
async function insertQuestion(
  question: ParsedQuestion,
  chapterId: number
): Promise<{ id: number; choiceCount: number }> {
  // Determine type based on options
  const type = question.type === 'MCQ' && question.options.length > 0 
    ? 'MCQ' 
    : 'FILLUP';

  // Insert question record
  const [insertedQuestion] = await db
    .insert(questionsTable)
    .values({
      chapterId,
      text: question.text,
      type,
      difficulty: 'UNLABLED',
      activeStatus: 'Active',
      verificationStatus: 'Need to Verified',
      isPreviousYear: false,
      // ... other fields (null)
    })
    .returning({ id: questionsTable.id });

  // Insert choice records
  let choiceCount = 0;
  if (type === 'MCQ' && question.options.length > 0) {
    for (const option of question.options) {
      try {
        await db.insert(choicesTable).values({
          questionId: insertedQuestion.id,
          text: option.text,
          isCorrect: option.isCorrect ?? false
          // ... image fields (null)
        });
        choiceCount++;
      } catch (err) {
        logger.warn({ err }, 'Error inserting choice');
      }
    }
  }

  return { id: insertedQuestion.id, choiceCount };
}
```

**Database Columns Populated**:
- From LaTeX: `text`, `type`, detected from options
- Defaults: `difficulty='UNLABLED'`, `activeStatus='Active'`, `verificationStatus='Need to Verified'`
- Blanked: All image fields (`imageData`, `imageName`, etc.), solution fields, previous year fields

**Notes**:
- Images NOT currently stored (future enhancement: stream to S3)
- All inserted questions initially marked as "Need to Verified"
- Choices' `isCorrect` determined by `\option{text}{true}` syntax

### Step 6: Error Resilience

#### Error Types
```typescript
// Level 1: Critical (stops entire import)
- Invalid chapter ID
- ZIP extraction failure
- No LaTeX files found

// Level 2: Question-level (skip this question, continue)
- Empty question text
- Question insertion database error
- LaTeX parse error for single question

// Level 3: Warning (question inserted, feature degraded)
- Image not found in ZIP
- Choice insertion failure
- Metadata parse error
```

#### Resilience Strategy
```typescript
try {
  const inserted = await insertQuestion(question, chapterId);
  result.stats.questionsInserted++;
} catch (err) {
  result.errors.push({
    message: 'Error processing question',
    questionIndex: i,
    detail: String(err)
  });
  result.stats.errors++;
  // Continue with next question
}
```

### Step 7: Result Compilation

```typescript
const result: BulkIngestionResult = {
  success: result.stats.errors === 0,
  stats: {
    totalFiles: discovery.allFiles.length,
    texFilesFound: 1,
    imagesFound: discovery.imagePaths.size,
    questionsExtracted: parseResult.allQuestions.length,
    questionsInserted: /* counted */,
    choicesInserted: /* counted */,
    errors: /* counted */
  },
  questionsCreated: [/* array of created questions */],
  warnings: [/* array of non-critical issues */],
  errors: [/* array of failures */]
};

return result;
```

## Data Structures

### ParsedQuestion
```typescript
interface ParsedQuestion {
  text: string;                        // Cleaned question text
  type: 'MCQ' | 'MATCH' | 'SUBJECTIVE'; // Detected type
  options: ParsedOption[];             // Multiple choice options (if MCQ)
  images: ParsedImage[];               // Associated images
  metadata?: Record<string, string>;   // Custom metadata from \metadata{}
  sectionPath?: string[];              // Hierarchy: [section, subsection]
}
```

### ParsedOption
```typescript
interface ParsedOption {
  text: string;              // Cleaned option text
  images: ParsedImage[];     // Images for this option
  isCorrect?: boolean;       // True if marked with \option{text}{true}
}
```

### ParsedImage
```typescript
interface ParsedImage {
  originalPath: string;      // From LaTeX: "images/photo.png"
  resolvedPath: string;      // Resolved full path from image map
  fileName: string;          // Filename only: "photo.png"
}
```

### BulkIngestionResult
```typescript
interface BulkIngestionResult {
  success: boolean;
  stats: {
    totalFiles: number;
    texFilesFound: number;
    imagesFound: number;
    questionsExtracted: number;
    questionsInserted: number;
    choicesInserted: number;
    errors: number;
  };
  questionsCreated: Array<{
    id: number;
    text: string;
    chapterId: number;
    type: string;
    imageCount: number;
    choiceCount: number;
  }>;
  warnings: Array<{ message: string; questionIndex?: number; detail?: string; }>;
  errors: Array<{ message: string; questionIndex?: number; detail?: string; }>;
}
```

## Configuration & Constants

### File Size Limits
**File**: `artifacts/api-server/src/lib/multer.ts`
```typescript
const MAX_ZIP_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
```

### Ignored Extensions
**File**: `artifacts/api-server/src/lib/zipProcessor.ts`
```typescript
const IGNORED_EXTENSIONS = new Set([
  '.aux', '.log', '.out', '.gz', '.tmp', '.dvi', 
  '.fls', '.fdb_latexmk', '.DS_Store'
]);
```

### Valid Question Types
**File**: `artifacts/api-server/src/routes/questions.ts`
```typescript
const VALID_QUESTION_TYPES = ["MCQ", "FILLUP"];
```

## Testing Strategy

### Unit Test: LaTeX Parser
```typescript
describe('LaTeX Parser', () => {
  it('should parse question with options', () => {
    const latex = `\\question{Q?}\\option{A}\\option{B}`;
    const result = parseLatex(latex);
    expect(result.allQuestions[0].options).toHaveLength(2);
  });
  
  it('should handle nested braces', () => {
    const latex = `\\question{Q {nested}?}`;
    const result = parseLatex(latex);
    expect(result.allQuestions[0].text).toContain('nested');
  });
});
```

### Integration Test: ZIP Processing
```typescript
describe('ZIP Processing', () => {
  it('should discover LaTeX file', async () => {
    const result = await discoverZipContents(testZipPath, extractDir);
    expect(result.primaryTexFile).toBeDefined();
  });
  
  it('should map image paths', async () => {
    const result = await discoverZipContents(testZipPath, extractDir);
    expect(result.imagePaths.size).toBeGreaterThan(0);
  });
});
```

### End-to-End Test: Bulk Upload
```typescript
describe('Bulk Upload', () => {
  it('should import questions from ZIP', async () => {
    const result = await processBulkIngestion({
      zipFilePath: testZipPath,
      chapterId: 1
    });
    expect(result.success).toBe(true);
    expect(result.stats.questionsInserted).toBeGreaterThan(0);
  });
});
```

## Deployment Notes

### Dependencies
```bash
pnpm add extract-zip@^2.0.1
```

### Environment Variables
None required (uses defaults).

### Database Migration
No schema changes. Compatible with existing database.

### Temporary Storage
- Location: `/tmp` directory
- Size: 100MB max per upload
- Cleanup: Automatic after processing
- Fallback: Manual cleanup on server restart

### Performance Tuning
- Async extraction reduces blocking
- Streaming ZIP processing for large files
- Batch database inserts (future enhancement)

## Monitoring & Debugging

### Log Levels
```typescript
// Debug (development)
logger.debug({ stats }, 'ZIP discovery complete');

// Info (routine operations)
logger.info({ extracted }, 'LaTeX parsing complete');

// Warn (degraded operations)
logger.warn({ imagePath }, 'Image reference not resolved');

// Error (failures)
logger.error({ err }, 'Critical error during bulk ingestion');
```

### Metrics to Track
- Import duration (target: <10s for 100MB ZIP)
- Success rate (% questions inserted / extracted)
- Error types and frequency
- Average questions per import
- Image resolution success rate

### Debugging Tips
1. Enable debug logging: `DEBUG=*` environment variable
2. Check `/tmp` for extraction artifacts if cleanup fails
3. Review question table for "Need to Verified" entries
4. Inspect choice table for relationship errors
5. Use database query logs to trace insertion order

## Performance Characteristics

| Operation | Time | Factors |
|-----------|------|---------|
| ZIP extraction | O(n) | File count, compression ratio |
| File scanning | O(n) | Directory depth |
| TeX file selection | O(m) | Number of .tex files |
| Image discovery | O(n) | File count |
| LaTeX parsing | O(l) | File size (content length) |
| DB insertion | O(q+c) | Questions + choices |

Where:
- n = total files in ZIP
- m = number of .tex files  
- l = .tex file line count
- q = questions to insert
- c = choices to insert
