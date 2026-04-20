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

export function getImageExtensionFromMime(imageType: string | null | undefined): "png" | "jpeg" | "jpg" | "webp" {
  const normalized = (imageType || "").toLowerCase();
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("jpeg")) return "jpeg";
  if (normalized.includes("jpg")) return "jpg";
  return "png";
}

export function getQuestionImageFileName(questionId: number, imageType: string | null | undefined): string {
  return `question_${questionId}.${getImageExtensionFromMime(imageType)}`;
}

export function getChoiceImageFileName(questionId: number, choiceId: number, imageType: string | null | undefined): string {
  return `question_${questionId}_choice_${choiceId}.${getImageExtensionFromMime(imageType)}`;
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

function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}#%&])/g, "\\$1")
    .replace(/\$/g, "\\$")
    .replace(/_/g, "\\_")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function renderTextForTex(raw: string): string {
  const text = raw ?? "";

  if (!hasMathDelimiters(text) && looksLikeLatexExpression(text)) {
    return `$${text.trim()}$`;
  }

  let result = "";
  let i = 0;

  while (i < text.length) {
    const blockDollar = text.indexOf("$$", i);
    const inlineDollar = text.indexOf("$", i);
    const blockBracket = text.indexOf("\\[", i);
    const inlineParen = text.indexOf("\\(", i);

    const candidates = [
      { index: blockDollar, open: "$$", close: "$$" },
      { index: inlineDollar, open: "$", close: "$" },
      { index: blockBracket, open: "\\[", close: "\\]" },
      { index: inlineParen, open: "\\(", close: "\\)" },
    ].filter((c) => c.index !== -1);

    if (candidates.length === 0) {
      result += escapeLatexText(text.slice(i));
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const next = candidates[0];

    result += escapeLatexText(text.slice(i, next.index));

    const contentStart = next.index + next.open.length;
    const contentEnd = text.indexOf(next.close, contentStart);

    if (contentEnd === -1) {
      result += escapeLatexText(text.slice(next.index));
      break;
    }

    result += text.slice(next.index, contentEnd + next.close.length);
    i = contentEnd + next.close.length;
  }

  return result;
}

export function generateTex(questions: QuestionForPdf[], title: string): string {
  logger.info({ count: questions.length }, "Generating TEX");

  const texQuestions = questions.map((q) => {
    const lines: string[] = [];
    lines.push(`\\question ${renderTextForTex(q.text)}`);

    if (q.imageData && q.imageType) {
      const questionImagePath = `images/${getQuestionImageFileName(q.id, q.imageType)}`;
      lines.push(`\\textit{See image: ${escapeLatexText(questionImagePath)}}`);
      lines.push(`\\includegraphics[width=0.5\\textwidth]{${escapeLatexText(questionImagePath)}}`);
    }

    if (q.type === "MCQ" && q.choices.length > 0) {
      lines.push("\\begin{choices}");
      for (const choice of q.choices) {
        const choiceCommand = choice.isCorrect ? "\\CorrectChoice" : "\\choice";
        lines.push(`${choiceCommand} ${renderTextForTex(choice.text)}`);
        if (choice.imageData && choice.imageType) {
          const choiceImagePath = `images/${getChoiceImageFileName(q.id, choice.id, choice.imageType)}`;
          lines.push(`\\textit{See image: ${escapeLatexText(choiceImagePath)}}`);
          lines.push(`\\includegraphics[width=0.35\\textwidth]{${escapeLatexText(choiceImagePath)}}`);
        }
      }
      lines.push("\\end{choices}");
    }

    return lines.join("\n");
  }).join("\n\n");

  return [
    "\\documentclass[12pt]{exam}",
    "\\usepackage{amsmath}",
    "\\usepackage{amssymb}",
    "\\usepackage{graphicx}",
    "\\usepackage{enumitem}",
    "",
    "\\begin{document}",
    `\\title{${escapeLatexText(title || "Questions")}}`,
    "\\date{}",
    "\\maketitle",
    "",
    "\\begin{questions}",
    texQuestions,
    "\\end{questions}",
    "\\end{document}",
    "",
  ].join("\n");
}

export async function generatePdf(questions: QuestionForPdf[], title: string): Promise<Buffer> {
  logger.info({ count: questions.length }, "Generating PDF");
  const isSingleQuestionExport = questions.length === 1;

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
          <div class="choice-main">
            <span class="choice-letter">${String.fromCharCode(65 + ci)}.</span>
            <div class="choice-content">
              <div class="choice-text-row">
                <span class="choice-text">${renderLatex(c.text)}</span>
                ${correctMark}
              </div>
              ${choiceImageHtml}
            </div>
          </div>
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
    
    .content {
      padding: 10px 40px 20px;
    }
    
    .question-block {
      margin-bottom: 28px;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      page-break-inside: auto;
      break-inside: auto;
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
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fafafa;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .choice-main {
      display: flex;
      align-items: flex-start;
      gap: 8px;
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

    .choice-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .choice-text-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    
    .correct-mark {
      color: #22c55e;
      font-weight: 700;
      margin-left: 6px;
    }
    
    .choice-image {
      max-width: 160px;
      max-height: 120px;
      object-fit: contain;
      border-radius: 3px;
      border: 1px solid #e5e7eb;
    }
    
    .katex-display { overflow-x: auto; }
  </style>
</head>
<body class="${isSingleQuestionExport ? "single-question" : ""}">
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
      margin: isSingleQuestionExport
        ? { top: "8mm", bottom: "8mm", left: "10mm", right: "10mm" }
        : { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}
