import puppeteer from "puppeteer";
import { logger } from "./logger";

interface ChoiceForPdf {
  id: number;
  text: string;
  isCorrect: boolean;
  imageData?: Buffer | null;
  imageType?: string | null;
}

interface QuestionForPdf {
  id: number;
  text: string;
  type: string;
  difficulty: string;
  chapterName?: string | null;
  subjectName?: string | null;
  imageData?: Buffer | null;
  imageType?: string | null;
  choices: ChoiceForPdf[];
}

function bufferToBase64DataUri(data: Buffer | null | undefined, mimeType: string | null | undefined): string | null {
  if (!data || !mimeType) return null;
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

function renderLatexToHtml(text: string): string {
  // Escape HTML but preserve LaTeX markers
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Mark LaTeX blocks (we'll inject KaTeX via the HTML template)
  return escaped;
}

export async function generatePdf(questions: QuestionForPdf[], title: string): Promise<Buffer> {
  logger.info({ count: questions.length }, "Generating PDF");

  const questionsHtml = questions.map((q, index) => {
    const questionImageSrc = bufferToBase64DataUri(q.imageData, q.imageType);
    const questionImageHtml = questionImageSrc
      ? `<img src="${questionImageSrc}" class="question-image" alt="Question image" />`
      : "";

    const choicesHtml = q.choices.map((c, ci) => {
      const choiceImageSrc = bufferToBase64DataUri(c.imageData, c.imageType);
      const choiceImageHtml = choiceImageSrc
        ? `<img src="${choiceImageSrc}" class="choice-image" alt="Choice image" />`
        : "";
      const correctMark = c.isCorrect ? ' <span class="correct-mark">✓</span>' : "";

      return `
        <div class="choice ${c.isCorrect ? "correct" : ""}">
          <span class="choice-letter">${String.fromCharCode(65 + ci)}.</span>
          <span class="choice-text" data-latex="${encodeURIComponent(c.text)}">${c.text}</span>
          ${correctMark}
          ${choiceImageHtml}
        </div>`;
    }).join("");

    const difficultyClass = q.difficulty.toLowerCase();
    const typeLabel = q.type === "MCQ" ? "Multiple Choice" : "Fill in the Blank";

    return `
      <div class="question-block">
        <div class="question-header">
          <span class="question-number">Q${index + 1}</span>
          <div class="question-badges">
            <span class="badge difficulty-${difficultyClass}">${q.difficulty}</span>
            <span class="badge type-badge">${typeLabel}</span>
          </div>
        </div>
        ${q.subjectName ? `<div class="question-meta">${q.subjectName}${q.chapterName ? ` › ${q.chapterName}` : ""}</div>` : ""}
        <div class="question-text" data-latex="${encodeURIComponent(q.text)}">${q.text}</div>
        ${questionImageHtml}
        ${q.choices.length > 0 ? `<div class="choices">${choicesHtml}</div>` : ""}
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Inter', sans-serif;
      font-size: 12pt;
      color: #1a1a2e;
      background: white;
      padding: 0;
    }
    
    .cover {
      padding: 60px 50px;
      border-bottom: 3px solid #1a1a2e;
      margin-bottom: 30px;
    }
    
    .cover h1 {
      font-size: 24pt;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    
    .cover .subtitle {
      font-size: 11pt;
      color: #666;
    }
    
    .content {
      padding: 20px 50px 50px;
    }
    
    .question-block {
      margin-bottom: 28px;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    .question-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    
    .question-number {
      font-size: 13pt;
      font-weight: 700;
      color: #1a1a2e;
      background: #f3f4f6;
      padding: 3px 10px;
      border-radius: 4px;
    }
    
    .question-badges {
      display: flex;
      gap: 6px;
    }
    
    .badge {
      font-size: 8pt;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .difficulty-easy { background: #d1fae5; color: #065f46; }
    .difficulty-medium { background: #fef3c7; color: #92400e; }
    .difficulty-hard { background: #fee2e2; color: #991b1b; }
    .type-badge { background: #ede9fe; color: #5b21b6; }
    
    .question-meta {
      font-size: 9pt;
      color: #9ca3af;
      margin-bottom: 10px;
    }
    
    .question-text {
      font-size: 12pt;
      line-height: 1.6;
      margin-bottom: 12px;
      color: #1a1a2e;
    }
    
    .question-image {
      max-width: 100%;
      max-height: 200px;
      object-fit: contain;
      margin: 10px 0;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    
    .choices {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .choice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fafafa;
    }
    
    .choice.correct {
      background: #f0fdf4;
      border-color: #86efac;
    }
    
    .choice-letter {
      font-weight: 700;
      color: #4b5563;
      min-width: 20px;
    }
    
    .choice-text {
      flex: 1;
      line-height: 1.5;
    }
    
    .correct-mark {
      color: #22c55e;
      font-weight: 700;
      margin-left: 6px;
    }
    
    .choice-image {
      max-width: 100px;
      max-height: 80px;
      object-fit: contain;
      margin-left: 8px;
      border-radius: 3px;
    }
    
    @media print {
      .question-block { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${title}</h1>
    <div class="subtitle">Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · ${questions.length} question${questions.length !== 1 ? "s" : ""}</div>
  </div>
  <div class="content">
    ${questionsHtml}
  </div>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      // Render LaTeX in question texts and choice texts
      document.querySelectorAll("[data-latex]").forEach(function(el) {
        var text = decodeURIComponent(el.getAttribute("data-latex"));
        try {
          // Clear existing content and render with auto-render
          el.innerHTML = "";
          var span = document.createElement("span");
          span.textContent = text;
          el.appendChild(span);
          renderMathInElement(el, {
            delimiters: [
              {left: "$$", right: "$$", display: true},
              {left: "$", right: "$", display: false},
              {left: "\\\\(", right: "\\\\)", display: false},
              {left: "\\\\[", right: "\\\\]", display: true}
            ],
            throwOnError: false
          });
        } catch(e) {
          el.textContent = text;
        }
      });
    });
  </script>
</body>
</html>`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for KaTeX to render
    await page.waitForTimeout(1000);
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}
