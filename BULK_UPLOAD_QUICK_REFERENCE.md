# Bulk Upload LaTeX Format - Quick Reference

## Basic Template

```latex
\documentclass{article}
\usepackage{graphicx}
\begin{document}

\section{Chapter Name}

\question{What is the question?}
\option{Correct answer}
\option{Wrong answer}
\option{Wrong answer}

\end{document}
```

## Command Quick Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `\section{}` | Chapter/Section | `\section{Algebra}` |
| `\subsection{}` | Sub-topic | `\subsection{Linear Equations}` |
| `\question{}` | Question text | `\question{Solve for x}` |
| `\option{}` | MCQ option | `\option{x = 5}` |
| `\includegraphics{}` | Add image | `\includegraphics{diagram.png}` |
| `\metadata{}{}` | Custom metadata | `\metadata{year}{2023}` |

## Common Patterns

### Pattern 1: Simple MCQ
```latex
\question{What is 2 + 2?}
\option{4}
\option{5}
\option{6}
\option{7}
```
✓ **Creates**: 1 MCQ with 4 options

### Pattern 2: Question with Image
```latex
\question{Identify the shape}
\includegraphics{triangle.png}
\option{Triangle}
\option{Square}
\option{Circle}
```
✓ **Creates**: 1 MCQ with image and 3 options

### Pattern 3: Multiple Sections
```latex
\section{Chapter 1}

\question{Q1}
\option{A}
\option{B}

\section{Chapter 2}

\question{Q2}
\option{C}
\option{D}
```
✓ **Creates**: 2 MCQs in their section paths

### Pattern 4: Subsections
```latex
\section{Algebra}

\subsection{Equations}
\question{Solve x + 1 = 5}
\option{x = 4}

\subsection{Polynomials}
\question{Factor x² + 5x + 6}
\option{(x+2)(x+3)}
```
✓ **Creates**: Organized question hierarchy

### Pattern 5: Long Text & Math
```latex
\question{A train travels at 60 km/h for 2 hours. 
How far does it travel? Express answer as $d = v \times t$}
\option{120 km}
\option{150 km}
\option{100 km}
```
✓ **Creates**: MCQ with LaTeX math notation

### Pattern 6: Image per Option
```latex
\question{Match the graphs}
\option{Linear growth} \includegraphics{linear.png}
\option{Exponential growth} \includegraphics{exponential.png}
```
✓ **Creates**: MCQ with images per option

### Pattern 7: Metadata
```latex
\question{Advanced topic}
\metadata{difficulty}{HARD}
\metadata{year}{2023}
\metadata{month}{March}
\option{Answer A}
\option{Answer B}
```
✓ **Creates**: MCQ with metadata (stored but not displayed yet)

## Image Paths

### Supported Formats

✓ **All work the same**:
```latex
\includegraphics{image.png}
\includegraphics{./image.png}
\includegraphics{images/image.png}
\includegraphics{img/path/to/image.png}
\includegraphics{/root/image.png}
```

### Image Location in ZIP

✓ **All these work**:
```
myquestions.zip
├─ questions.tex
└─ image.png                    ← Root level

myquestions.zip
├─ questions.tex
└─ images/
   ├─ photo1.png
   └─ diagram.svg              ← Subdirectory

myquestions.zip
├─ src/
│  ├─ main.tex
│  └─ figures/
│     └─ graph.jpg             ← Nested structure
```

### Image Resolution

Images are matched **flexibly**:
- `\includegraphics{photo}` → finds `photo.png`
- `\includegraphics{PHOTO.PNG}` → finds `photo.png` (case-insensitive)
- `\includegraphics{images/photo.png}` → finds `photo.png` anywhere in ZIP

## Real-World Examples

### Example 1: Physics Chapter

```latex
\documentclass{article}
\usepackage{graphicx}
\usepackage{amsmath}

\title{Physics Questions}
\author{Science Department}
\begin{document}

\section{Mechanics}

\subsection{Force and Motion}

\question{What is Newton's second law?}
\option{$F = ma$}
\option{$F = mv$}
\option{$F = \frac{m}{a}$}
\option{$F = E$}

\question{Identify the force diagram}
\includegraphics{force_diagram.png}
\option{Balanced forces}
\option{Unbalanced forces}

\subsection{Energy}

\question{A 2 kg object falls from 5 meters. 
Calculate potential energy ($E_p = mgh$, $g = 10 m/s²$)}
\option{50 J}
\option{100 J}
\option{200 J}
\option{10 J}

\question{Match energy types to examples}
\metadata{difficulty}{MEDIUM}
\option{Kinetic: Moving car} \includegraphics{car.png}
\option{Potential: Raised weight} \includegraphics{weight.png}

\end{document}
```

### Example 2: Math Problems

```latex
\section{Algebra}

\subsection{Linear Equations}

\question{Solve: $2x + 5 = 13$}
\option{$x = 4$}
\option{$x = 9$}
\option{$x = 3$}
\option{$x = 6$}

\question{Graph of $y = 2x + 1$}
\includegraphics{line_graph.png}
\option{Positive slope, y-intercept at 1}
\option{Negative slope, y-intercept at 1}
\option{Positive slope, y-intercept at 2}

\subsection{Quadratic Equations}

\question{Factor: $x^2 + 5x + 6$}
\option{$(x+2)(x+3)$}
\option{$(x+1)(x+6)$}
\option{$(x+2)(x+2)$}
```

### Example 3: Mixed Content

```latex
\section{Biology}

\question{Identify the cell organelles}
\includegraphics{cell_diagram.png}
\option{Mitochondria in upper left}
\option{Nucleus in center}
\option{Ribosome on right}
\option{Chloroplast visible}

\question{Process of photosynthesis equation: 
$6CO_2 + 6H_2O + light \rightarrow C_6H_{12}O_6 + 6O_2$}
\option{Occurs in chloroplasts}
\option{Occurs in mitochondria}
\option{Occurs in nucleus}

\metadata{year}{2024}
\question{Diagram annotation task}
\includegraphics{leaf_cross_section.png}
\option{Epidermis protection layer}
\option{Mesophyll contains chloroplasts}
\option{Vascular bundle transports water}
```

## Common Mistakes to Avoid

### ❌ Wrong: Unclosed Braces
```latex
\question{What is the answer?  ← Missing }
\option{A}
```
**Fix**: `\question{What is the answer?}`

### ❌ Wrong: Incorrect Command
```latex
\Question{...}  ← Capital Q
\Option{...}    ← Capital O
```
**Fix**: `\question{...}` and `\option{...}`

### ❌ Wrong: Image doesn't exist
```latex
\includegraphics{missing.png}  ← File not in ZIP
```
**Fix**: Include image in ZIP with same filename

### ❌ Wrong: Backslash without closing
```latex
\section{Topic
\question{Q1}
```
**Fix**: `\section{Topic}` then `\question{Q1}`

### ❌ Wrong: Multiple sections inside question
```latex
\question{What is...}
\section{Answer}  ← Section inside question!
\option{A}
```
**Fix**: Close question first, then start section

### ❌ Wrong: Special characters without escaping
```latex
\question{What is 50% of x?}  ← % starts comment!
```
**Fix**: Escape: `\question{What is 50\% of x?}`

### ❌ Wrong: Images in document preamble
```latex
\documentclass{article}
\includegraphics{image.png}  ← Too early!
\begin{document}
```
**Fix**: Put inside `\begin{document}...\end{document}`

## Troubleshooting

### Issue: "No LaTeX files found"
```
✓ Ensure ZIP contains .tex file
✓ Check filename has .tex extension
✓ Not .TEX or .Tex (usually case-sensitive on Linux)
```

### Issue: "Image not linking"
```
✓ Image file is in ZIP
✓ Filename matches (case-insensitive matching available)
✓ Try without path: \includegraphics{image.png}
✓ Try with subdirectory: \includegraphics{images/image.png}
```

### Issue: "Questions not inserting"
```
✓ Check question has text: \question{...} not empty
✓ Verify LaTeX syntax (matching braces)
✓ Review error message in upload results
✓ Check chapter is selected correctly
```

### Issue: "Options not attaching to questions"
```
✓ \option must come after \question
✓ Don't put \section between \question and \option
✓ All \option before next \question are grouped
```

### Issue: "ZIP too large"
```
✓ Limit is 100MB per ZIP
✓ Reduce image quality if needed
✓ Split into multiple ZIPs
✓ Contact admin to increase limit
```

## Advanced Usage

### Using Comments
```latex
% This is a comment - won't be parsed
\question{Actual question}  % Comment here too
% \question{This is commented out - won't import}
\option{A}
```

### Escaping Special Characters
```latex
\question{What costs \$50?}           % Dollar sign
\question{What is 100\% correct?}    % Percent sign
\question{Use \{braces\} for this}   % Braces
\question{Use \\ for line break}     % Backslash
```

### Mathematical Notation
```latex
\question{Solve $2x^2 + 3x - 5 = 0$}
\question{Find $\lim_{x \to \infty} \frac{1}{x}$}
\question{Calculate $\int_0^1 x^2 dx$}
\question{Probability: $P(A \cap B) = P(A) \cdot P(B|A)$}
```

### Formatting (decorative - stored as plain text)
```latex
\question{\textbf{Bold} or \textit{italic} text}
\question{\emph{Emphasized} or normal text}
\option{Formatted \texttt{code} example}
```

## File Size Guidelines

| Component | Impact | Recommendation |
|-----------|--------|-----------------|
| .tex file | Minimal | < 10MB |
| Images | Major | Resize to < 500KB each |
| Total ZIP | Processing | < 100MB (default limit) |

### Image Optimization

```bash
# Resize image to reasonable dimensions
convert input.png -resize 800x600 output.png

# Compress PNG
convert input.png -strip output.png

# Convert JPEG quality
convert input.jpg -quality 85 output.jpg
```

## Submission Checklist

Before uploading:

- [ ] .tex file exists and compiles (or at least has valid syntax)
- [ ] All images referenced are included in ZIP
- [ ] Subject selected in Question Bank
- [ ] Chapter selected in Question Bank
- [ ] Questions have text or image
- [ ] Options properly formatted as `\option{...}`
- [ ] Image filenames have extensions (.png, .jpg, etc.)
- [ ] ZIP file < 100MB
- [ ] No special characters in folder/file names (besides . and _)

## Getting Help

1. **Check error message** in upload results - very specific
2. **Review this guide** for your LaTeX pattern
3. **Simplify** your .tex file to find issue
4. **Test locally** with single question first
5. **Contact admin** with ZIP file for debugging

---

**Happy importing! 🚀**
