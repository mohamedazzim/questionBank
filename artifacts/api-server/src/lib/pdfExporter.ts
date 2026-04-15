import puppeteer from "puppeteer";
import katex from "katex";
import { readFileSync, existsSync } from "fs";
import { dirname } from "path";
import { createRequire } from "module";
import { execSync } from "child_process";
import { logger } from "./logger";

function findChromium(): string | undefined {
  const candidates = [
    "/run/current-system/sw/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  try {
    if (process.platform === "win32") {
      const whereOutput = execSync("where chrome.exe", { encoding: "utf-8" }).trim().split(/\r?\n/)[0];
      if (whereOutput && existsSync(whereOutput)) return whereOutput;
    } else {
      const whichOutput = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null", { encoding: "utf-8" }).trim();
      if (whichOutput && existsSync(whichOutput)) return whichOutput;
    }
  } catch {
    // ignore
  }

  try {
    const bundledPath = puppeteer.executablePath();
    if (bundledPath && existsSync(bundledPath)) return bundledPath;
  } catch {
    // ignore
  }

  return undefined;
}

const CHROMIUM_PATH = findChromium();

export function getPdfRuntimeHealth(): {
  canGeneratePdf: boolean;
  browserPath: string | null;
} {
  return {
    canGeneratePdf: Boolean(CHROMIUM_PATH),
    browserPath: CHROMIUM_PATH ?? null,
  };
}

const require = createRequire(import.meta.url);
const katexJsPath = require.resolve("katex"); // resolves to .../katex/dist/katex.js
const katexDistDir = dirname(katexJsPath);    // .../katex/dist
const katexFontsDir = `${katexDistDir}/fonts`;
const katexCssRaw = readFileSync(`${katexDistDir}/katex.min.css`, "utf-8");

// Inline katex fonts as base64 so PDF renders correctly without network
const katexCss = katexCssRaw.replace(/url\(fonts\/([^)]+)\)/g, (_match, filename) => {
  try {
    const fontBuffer = readFileSync(`${katexFontsDir}/${filename}`);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime =
      ext === "woff2" ? "font/woff2"
      : ext === "woff" ? "font/woff"
      : ext === "ttf" ? "font/truetype"
      : "font/opentype";
    return `url(data:${mime};base64,${fontBuffer.toString("base64")})`;
  } catch {
    return `url(fonts/${filename})`;
  }
});

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

function hasMathDelimiters(text: string): boolean {
  return /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/.test(text);
}

function looksLikeLatexExpression(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return (
    /\\[a-zA-Z]+/.test(trimmed) ||
    /[\^_][{(\w-]/.test(trimmed) ||
    /\{[^}]*\}/.test(trimmed)
  );
}

function renderLatex(text: string): string {
  if (!hasMathDelimiters(text) && looksLikeLatexExpression(text)) {
    try {
      return katex.renderToString(text.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      // Fall through to delimiter-based parser below.
    }
  }

  // Split on $$ (block) and $ (inline) delimiters and render server-side
  let result = "";
  let remaining = text;

  while (remaining.length > 0) {
    // Try block math $$...$$
    const blockStart = remaining.indexOf("$$");
    const inlineStart = remaining.indexOf("$");

    if (blockStart !== -1 && (inlineStart === -1 || blockStart <= inlineStart)) {
      const blockEnd = remaining.indexOf("$$", blockStart + 2);
      if (blockEnd !== -1) {
        result += escapeHtml(remaining.slice(0, blockStart));
        const math = remaining.slice(blockStart + 2, blockEnd);
        try {
          result += katex.renderToString(math, { displayMode: true, throwOnError: false });
        } catch {
          result += escapeHtml(`$$${math}$$`);
        }
        remaining = remaining.slice(blockEnd + 2);
        continue;
      }
    }

    // Try inline math $...$
    if (inlineStart !== -1) {
      const inlineEnd = remaining.indexOf("$", inlineStart + 1);
      if (inlineEnd !== -1 && remaining[inlineStart + 1] !== "$") {
        result += escapeHtml(remaining.slice(0, inlineStart));
        const math = remaining.slice(inlineStart + 1, inlineEnd);
        try {
          result += katex.renderToString(math, { displayMode: false, throwOnError: false });
        } catch {
          result += escapeHtml(`$${math}$`);
        }
        remaining = remaining.slice(inlineEnd + 1);
        continue;
      }
    }

    // Also handle \[...\] block math
    const bracketStart = remaining.indexOf("\\[");
    if (bracketStart !== -1) {
      const bracketEnd = remaining.indexOf("\\]", bracketStart + 2);
      if (bracketEnd !== -1) {
        result += escapeHtml(remaining.slice(0, bracketStart));
        const math = remaining.slice(bracketStart + 2, bracketEnd);
        try {
          result += katex.renderToString(math, { displayMode: true, throwOnError: false });
        } catch {
          result += escapeHtml(`\\[${math}\\]`);
        }
        remaining = remaining.slice(bracketEnd + 2);
        continue;
      }
    }

    // Also handle \(...\) inline math
    const parenStart = remaining.indexOf("\\(");
    if (parenStart !== -1) {
      const parenEnd = remaining.indexOf("\\)", parenStart + 2);
      if (parenEnd !== -1) {
        result += escapeHtml(remaining.slice(0, parenStart));
        const math = remaining.slice(parenStart + 2, parenEnd);
        try {
          result += katex.renderToString(math, { displayMode: false, throwOnError: false });
        } catch {
          result += escapeHtml(`\\(${math}\\)`);
        }
        remaining = remaining.slice(parenEnd + 2);
        continue;
      }
    }

    result += escapeHtml(remaining);
    break;
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
          <span class="choice-text">${renderLatex(c.text)}</span>
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
        ${q.subjectName ? `<div class="question-meta">${escapeHtml(q.subjectName)}${q.chapterName ? ` › ${escapeHtml(q.chapterName)}` : ""}</div>` : ""}
        <div class="question-text">${renderLatex(q.text)}</div>
        ${questionImageHtml}
        ${q.choices.length > 0 ? `<div class="choices">${choicesHtml}</div>` : ""}
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${katexCss}

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: Arial, sans-serif;
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
    
    .katex-display { overflow-x: auto; }

    @media print {
      .question-block { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · ${questions.length} question${questions.length !== 1 ? "s" : ""}</div>
  </div>
  <div class="content">
    ${questionsHtml}
  </div>
</body>
</html>`;

  let browser;
  try {
    const launchOptions = {
      headless: true as const,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--font-render-hinting=none",
      ],
    };

    if (!CHROMIUM_PATH) {
      logger.warn("Chromium executable path not found in known locations. Falling back to Puppeteer's default browser.");
    }

    browser = await puppeteer.launch({
      ...launchOptions,
      ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
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
