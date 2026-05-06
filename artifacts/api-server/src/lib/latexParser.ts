/**
 * LaTeX Parser for Question Bank Bulk Import
 *
 * Supports:
 * - Custom structured format: \question{} + \option{}
 * - Exam class format: \begin{questions} + \item + \begin{enumerate}
 * - Fallback messy extraction patterns: 1. question, (a) option
 */

export interface ParsedImage {
  originalPath: string;
  resolvedPath: string;
  fileName: string;
}

export interface ParsedOption {
  text: string;
  images: ParsedImage[];
  isCorrect?: boolean;
}

export interface ParsedQuestion {
  text: string;
  rawLatex?: string;
  type: "MCQ" | "FILLUP";
  options: ParsedOption[];
  images: ParsedImage[];
  metadata?: Record<string, string>;
  sectionPath?: string[];
  answer?: string;
  solution?: string;
  status?: "parsed" | "needs_review";
}

export interface ParsedSection {
  name: string;
  questions: ParsedQuestion[];
  subsections: ParsedSection[];
}

export interface ParseResult {
  sections: ParsedSection[];
  allQuestions: ParsedQuestion[];
  imageReferences: Set<string>;
  metadata: {
    documentTitle?: string;
    author?: string;
    date?: string;
  };
  warnings?: string[];
}

interface Token {
  command: string;
  args: string[];
  raw: string;
  index: number;
}

interface LatexEnvironmentRange {
  bodyStart: number;
  bodyEnd: number;
}

const NOISE_PATTERNS = [
  /^\s*page\s+\d+\s*$/i,
  /^\s*\d+\s*$/,
  /all rights reserved/i,
  /copyright/i,
  /publisher/i,
  /printed in/i,
  /isbn/i,
  /www\./i,
  /^\s*\\(vspace|hspace|newpage|clearpage|smallskip|medskip|bigskip)\b/i,
];

function readBalanced(content: string, startIndex: number, openChar: string, closeChar: string): { value: string; endIndex: number } | null {
  if (content[startIndex] !== openChar) return null;

  let depth = 1;
  let i = startIndex + 1;
  const start = i;

  while (i < content.length) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : "";
    if (ch === openChar && prev !== "\\") depth++;
    if (ch === closeChar && prev !== "\\") depth--;
    if (depth === 0) {
      return { value: content.slice(start, i), endIndex: i };
    }
    i++;
  }

  return null;
}

function tokenizeCommands(content: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < content.length) {
    if (content[i] !== "\\") {
      i++;
      continue;
    }

    const start = i;
    i++;
    const cmdStart = i;
    while (i < content.length && /[a-zA-Z*]/.test(content[i])) i++;
    const command = content.slice(cmdStart, i);
    if (!command) continue;

    const args: string[] = [];
    while (i < content.length) {
      while (i < content.length && /\s/.test(content[i])) i++;
      if (content[i] === "[") {
        const bracket = readBalanced(content, i, "[", "]");
        if (!bracket) break;
        args.push(bracket.value);
        i = bracket.endIndex + 1;
        continue;
      }
      if (content[i] === "{") {
        const brace = readBalanced(content, i, "{", "}");
        if (!brace) break;
        args.push(brace.value);
        i = brace.endIndex + 1;
        continue;
      }
      break;
    }

    tokens.push({
      command,
      args,
      raw: content.slice(start, i),
      index: start,
    });
  }

  return tokens;
}

function findEnvironmentRanges(content: string, environmentName: string): LatexEnvironmentRange[] {
  const tokens = tokenizeCommands(content);
  const ranges: LatexEnvironmentRange[] = [];
  const stack: Array<{ bodyStart: number }> = [];

  for (const token of tokens) {
    if ((token.command !== "begin" && token.command !== "end") || token.args[0] !== environmentName) {
      continue;
    }

    if (token.command === "begin") {
      stack.push({ bodyStart: token.index + token.raw.length });
      continue;
    }

    const opened = stack.pop();
    if (opened && stack.length === 0) {
      ranges.push({
        bodyStart: opened.bodyStart,
        bodyEnd: token.index,
      });
    }
  }

  return ranges;
}

function normalizeImagePath(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  const withoutPrefix = trimmed.replace(/^\.\//, "").replace(/^images\//i, "");
  return withoutPrefix.replace(/\\/g, "/");
}

function cleanTextPreserveEquations(text: string): string {
  const mathPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const cleanNonMath = (value: string) => value
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n");

  while ((match = mathPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleanNonMath(text.slice(lastIndex, match.index)));
    }

    parts.push(match[0]);
    lastIndex = mathPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(cleanNonMath(text.slice(lastIndex)));
  }

  return parts.join("").trim();
}

function normalizeMetadataText(text: string): string {
  return text
    .replace(/\\textbf\s*\{\s*(Sol(?:ution)?\s*:)\s*\}/gi, "$1")
    .replace(/\\textit\s*\{\s*(Sol(?:ution)?\s*:)\s*\}/gi, "$1")
    .replace(/\\emph\s*\{\s*(Sol(?:ution)?\s*:)\s*\}/gi, "$1");
}

function parseYearMetadata(value: string, metadata: Record<string, string>): void {
  const trimmed = value.trim();
  if (!trimmed) return;

  metadata.yearRaw = trimmed;

  const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) metadata.year = yearMatch[0];

  const monthMatch = trimmed.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  if (monthMatch) {
    metadata.month = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase();
  }

  metadata.exam = trimmed;
}

function extractQuestionMetadata(text: string): { text: string; metadata: Record<string, string>; answer?: string; solution?: string } {
  let working = normalizeMetadataText(text);
  const metadata: Record<string, string> = {};
  let answer: string | undefined;
  let solution: string | undefined;

  const firstMetadataMatch = working.match(/(?:^|\n)\s*(?:Year|Ans(?:wer)?|Sol(?:ution)?)\s*:/i);
  const questionText = firstMetadataMatch && firstMetadataMatch.index !== undefined
    ? working.slice(0, firstMetadataMatch.index)
    : working;
  const metadataText = firstMetadataMatch && firstMetadataMatch.index !== undefined
    ? working.slice(firstMetadataMatch.index)
    : "";

  const solutionMatch = metadataText.match(/(?:^|\n)\s*Sol(?:ution)?\s*:\s*([\s\S]*)$/i);
  if (solutionMatch) {
    solution = solutionMatch[1].trim();
    working = metadataText.slice(0, solutionMatch.index);
  } else {
    working = metadataText;
  }

  const yearMatch = working.match(/(?:^|\n)\s*Year\s*:\s*([^\n]+)/i);
  if (yearMatch) {
    parseYearMetadata(yearMatch[1], metadata);
  }

  const ansMatch = working.match(/(?:^|\n)\s*Ans(?:wer)?\s*:\s*([^\n]+)/i);
  if (ansMatch) {
    answer = ansMatch[1].trim();
    metadata.answer = answer;
  }

  if (solution) metadata.solution = solution;

  return {
    text: cleanTextPreserveEquations(questionText),
    metadata,
    answer,
    solution,
  };
}

function applyAnswerKeyToOptions(question: ParsedQuestion): void {
  const answer = question.metadata?.answer;
  if (!answer || question.options.length === 0) return;

  const cleaned = answer.trim().toLowerCase();

  const comparableAnswer = cleaned.replace(/^[([{]\s*/, "").replace(/\s*[)\]}]$/, "");
  const exactTextIndex = question.options.findIndex((option) => {
    const optionText = cleanTextPreserveEquations(option.text).trim().toLowerCase();
    return optionText === cleaned || optionText === comparableAnswer;
  });

  if (exactTextIndex >= 0) {
    question.options = question.options.map((opt, i) => ({
      ...opt,
      isCorrect: i === exactTextIndex,
    }));
    return;
  }
  
  // Try numeric answer (1-based index)
  const numMatch = cleaned.match(/[1-9]/);
  if (numMatch) {
    const index = parseInt(numMatch[0], 10) - 1;
    if (index >= 0 && index < question.options.length) {
      question.options = question.options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index,
      }));
      return;
    }
  }

  // Try letter answer (A-D)
  const letterMatch = cleaned.match(/[a-d]/);
  if (!letterMatch) return;

  const index = letterMatch[0].charCodeAt(0) - "a".charCodeAt(0);
  if (index < 0 || index >= question.options.length) return;

  question.options = question.options.map((opt, i) => ({
    ...opt,
    isCorrect: i === index,
  }));
}

function createImage(value: string): ParsedImage {
  const normalized = normalizeImagePath(value);
  const fileName = normalized.split("/").pop() || normalized;
  return {
    originalPath: normalized,
    resolvedPath: normalized,
    fileName,
  };
}

export class LaTeXParser {
  private imageReferences: Set<string> = new Set();
  public warnings: string[] = [];

  parse(content: string): ParseResult {
    const cleaned = this.cleanLatexContent(content);
    const sections = this.extractSections(cleaned);
    const metadata = this.extractDocumentMetadata(content);

    // Only use state-machine based parsers. Fallback regex creates duplicates and breaks \enumerate blocks.
    const questionsFromExam = this.parseExamClassQuestions(cleaned, sections);
    const questionsFromStructured = this.parseStructuredQuestions(cleaned, sections);

    const allQuestions = this.mergeQuestions([
      ...questionsFromExam,
      ...questionsFromStructured,
    ]);

    const sectionMap = new Map<string, ParsedSection>();
    for (const question of allQuestions) {
      const sectionName = question.sectionPath?.[0] || "Ungrouped";
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, {
          name: sectionName,
          questions: [],
          subsections: [],
        });
      }
      sectionMap.get(sectionName)!.questions.push(question);
    }

    return {
      sections: Array.from(sectionMap.values()),
      allQuestions,
      imageReferences: this.imageReferences,
      metadata,
      warnings: this.warnings,
    };
  }

  private cleanLatexContent(content: string): string {
    let cleaned = content;

    cleaned = cleaned.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*/g, "\n");
    cleaned = cleaned.replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\}\s*/g, "\n");
    cleaned = cleaned.replace(/\\begin\{document\}|\\end\{document\}/g, "\n");

    // Keep escaped percent, remove comment tails.
    const lines: string[] = [];
    let inDisplayMath = false;

    for (const line of cleaned.split("\n")) {
      const normalized = line.replace(/\r/g, "");
      const preserveMathLine = inDisplayMath || /\\\[|\$\$/.test(normalized);
      const nextDisplayMath = this.updateDisplayMathState(normalized, inDisplayMath);

      if (preserveMathLine) {
        lines.push(normalized);
      } else {
        const commentStart = normalized.match(/(^|[^\\])%/);
        const withoutComment = !commentStart || commentStart.index === undefined
          ? normalized
          : normalized.slice(0, commentStart.index + (commentStart[1] ? commentStart[1].length : 0));
        lines.push(this.removeLineNoise(withoutComment));
      }

      inDisplayMath = nextDisplayMath;
    }

    cleaned = lines.join("\n");

    // Normalize includegraphics paths without altering equations.
    cleaned = cleaned.replace(/\\includegraphics(\[[^\]]*\])?\{([^}]+)\}/g, (_m, opts, p) => {
      const normalizedPath = normalizeImagePath(p);
      return `\\includegraphics${opts || ""}{${normalizedPath}}`;
    });

    return cleaned;
  }

  private updateDisplayMathState(line: string, current: boolean): boolean {
    let inDisplayMath = current;
    const tokenPattern = /(\\\[|\\\]|\$\$)/g;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(line)) !== null) {
      if (match[0] === "\\[") inDisplayMath = true;
      else if (match[0] === "\\]") inDisplayMath = false;
      else inDisplayMath = !inDisplayMath;
    }

    return inDisplayMath;
  }

  private removeLineNoise(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return "";

    if (NOISE_PATTERNS.some((pattern) => pattern.test(trimmed))) return "";
    if (/^\\[a-zA-Z*]+\s*(\{\s*\})?\s*$/.test(trimmed)) return "";

    return line;
  }

  private extractDocumentMetadata(content: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    const titleMatch = content.match(/\\title\s*\{([^}]+)\}/);
    const authorMatch = content.match(/\\author\s*\{([^}]+)\}/);
    const dateMatch = content.match(/\\date\s*\{([^}]+)\}/);

    if (titleMatch) metadata.documentTitle = titleMatch[1].trim();
    if (authorMatch) metadata.author = authorMatch[1].trim();
    if (dateMatch) metadata.date = dateMatch[1].trim();

    return metadata;
  }

  private extractSections(content: string): Array<{ index: number; path: string[] }> {
    const sections: Array<{ index: number; path: string[] }> = [{ index: 0, path: ["Ungrouped"] }];
    const rgx = /\\(section|subsection)\{([^}]+)\}/g;
    let currentSection = "Ungrouped";
    let match = rgx.exec(content);

    while (match) {
      const level = match[1];
      const name = cleanTextPreserveEquations(match[2]);
      if (level === "section") {
        currentSection = name || "Ungrouped";
        sections.push({ index: match.index, path: [currentSection] });
      } else {
        sections.push({ index: match.index, path: [currentSection, name || "Subsection"] });
      }
      match = rgx.exec(content);
    }

    return sections.sort((a, b) => a.index - b.index);
  }

  private sectionPathAt(index: number, sections: Array<{ index: number; path: string[] }>): string[] {
    let best = sections[0]?.path || ["Ungrouped"];
    for (const section of sections) {
      if (section.index <= index) best = section.path;
      else break;
    }
    return [...best];
  }

  private parseStructuredQuestions(content: string, sections: Array<{ index: number; path: string[] }>): ParsedQuestion[] {
    const tokens = tokenizeCommands(content);
    const questions: ParsedQuestion[] = [];
    let current: ParsedQuestion | null = null;

    for (const token of tokens) {
      if (token.command === "question") {
        if (current && current.text.trim()) {
          current = this.finalizeQuestion(current);
          questions.push(current);
        }

        const initial = token.args[0] || "";
        current = {
          text: initial,
          rawLatex: token.raw,
          type: "FILLUP",
          options: [],
          images: [],
          metadata: {},
          sectionPath: this.sectionPathAt(token.index, sections),
          status: "parsed",
        };
        continue;
      }

      if (!current) continue;

      if (token.command === "option") {
        const text = cleanTextPreserveEquations(token.args[0] || "");
        if (text) {
          const explicit = (token.args[1] || "").toLowerCase();
          current.options.push({
            text,
            images: [],
            isCorrect: explicit === "correct" || explicit === "true",
          });
        }
      } else if (token.command === "includegraphics") {
        const rawRef = token.args[token.args.length - 1] || "";
        if (rawRef) {
          const image = createImage(rawRef);
          this.imageReferences.add(image.originalPath);
          if (current.options.length > 0) current.options[current.options.length - 1].images.push(image);
          else current.images.push(image);
        }
      } else if (token.command === "metadata") {
        const key = (token.args[0] || "").trim();
        const value = (token.args[1] || "").trim();
        if (key) {
          current.metadata = current.metadata || {};
          current.metadata[key] = value;
        }
      }
    }

    if (current && current.text.trim()) {
      questions.push(this.finalizeQuestion(current));
    }

    return questions;
  }

  private parseExamClassQuestions(content: string, sections: Array<{ index: number; path: string[] }>): ParsedQuestion[] {
    const questionRanges = findEnvironmentRanges(content, "questions");
    if (questionRanges.length === 0) return [];

    const questions: ParsedQuestion[] = [];
    let current: ParsedQuestion | null = null;
    let enumerateDepth = 0;
    let lastTextIndex = 0;
    const enumerateStack: Array<{ optionCountAtStart: number }> = [];

    const pushCurrent = () => {
      if (!current) return;
      const finalized = this.finalizeQuestion(current);
      if (finalized.text.trim()) questions.push(finalized);
      current = null;
    };

    const appendText = (rawText: string) => {
      const text = cleanTextPreserveEquations(rawText);
      if (!text || !current) return;

      if (enumerateDepth > 0 && current.options.length > 0) {
        const last = current.options[current.options.length - 1];
        last.text = cleanTextPreserveEquations(`${last.text}\n${text}`);
        return;
      }

      current.text = cleanTextPreserveEquations(`${current.text}\n${text}`);
    };

    const attachImage = (rawRef: string) => {
      if (!rawRef || !current) return;

      const image = createImage(rawRef);
      this.imageReferences.add(image.originalPath);

      if (enumerateDepth > 0 && current.options.length > 0) {
        current.options[current.options.length - 1].images.push(image);
        return;
      }

      current.images.push(image);
    };

    const resetRangeState = (bodyStart: number) => {
      current = null;
      enumerateDepth = 0;
      lastTextIndex = bodyStart;
      enumerateStack.length = 0;
    };

    for (const range of questionRanges) {
      resetRangeState(range.bodyStart);
      const body = content.slice(range.bodyStart, range.bodyEnd);
      const tokens = tokenizeCommands(body).map((token) => ({
        ...token,
        index: token.index + range.bodyStart,
      }));

      for (const token of tokens) {
        const environment = token.args[0];
        const isBegin = token.command === "begin";
        const isEnd = token.command === "end";
        const isQuestionsBoundary = (isBegin || isEnd) && environment === "questions";
        const isEnumerateBoundary = (isBegin || isEnd) && environment === "enumerate";
        const isCenterBoundary = (isBegin || isEnd) && environment?.toLowerCase() === "center";
        const isStructural =
          token.command === "item" ||
          token.command === "includegraphics" ||
          isQuestionsBoundary ||
          isEnumerateBoundary ||
          isCenterBoundary;

        if (!isStructural) continue;

        appendText(content.slice(lastTextIndex, token.index));

        if (isBegin && environment === "enumerate") {
          enumerateStack.push({ optionCountAtStart: current?.options.length ?? 0 });
          enumerateDepth++;
          lastTextIndex = token.index + token.raw.length;
          continue;
        }

        if (isEnd && environment === "enumerate") {
          const frame = enumerateStack.pop();
          if (current && frame && current.options.length === frame.optionCountAtStart) {
            this.warnings.push("Enumerate block detected but no options parsed");
          }
          enumerateDepth = Math.max(0, enumerateDepth - 1);
          lastTextIndex = token.index + token.raw.length;
          continue;
        }

        if (isQuestionsBoundary || isCenterBoundary) {
          lastTextIndex = token.index + token.raw.length;
          continue;
        }

        if (token.command === "includegraphics") {
          const rawRef = token.args[token.args.length - 1] || "";
          attachImage(rawRef);
          lastTextIndex = token.index + token.raw.length;
          continue;
        }

        if (token.command === "item") {
          if (enumerateDepth === 0) {
            pushCurrent();
            current = {
              text: "",
              rawLatex: token.raw,
            type: "FILLUP",
              options: [],
              images: [],
              metadata: {},
              sectionPath: this.sectionPathAt(token.index, sections),
              status: "parsed",
            };
          } else {
            if (!current) {
              current = {
                text: "",
                rawLatex: "",
              type: "FILLUP",
                options: [],
                images: [],
                metadata: {},
                sectionPath: this.sectionPathAt(token.index, sections),
                status: "needs_review",
              };
            }

            current.options.push({
              text: "",
              images: [],
            });
          }

          lastTextIndex = token.index + token.raw.length;
        }
      }

      appendText(content.slice(lastTextIndex, range.bodyEnd));
      pushCurrent();
    }
    return questions;
  }

  private finalizeQuestion(question: ParsedQuestion): ParsedQuestion {
    const enriched = { ...question };
    const extracted = extractQuestionMetadata(enriched.text);

    enriched.text = extracted.text;
    enriched.metadata = {
      ...(enriched.metadata || {}),
      ...extracted.metadata,
    };
    if (extracted.answer) enriched.answer = extracted.answer;
    if (extracted.solution) enriched.solution = extracted.solution;

    applyAnswerKeyToOptions(enriched);

    if (enriched.options.length >= 2) enriched.type = "MCQ";
    else enriched.type = "FILLUP";

    enriched.status = enriched.status || "parsed";
    enriched.rawLatex = enriched.rawLatex || enriched.text;

    return enriched;
  }

  private mergeQuestions(questions: ParsedQuestion[]): ParsedQuestion[] {
    const dedup = new Map<string, ParsedQuestion>();

    for (const q of questions) {
      const key = q.text.replace(/\s+/g, " ").trim().toLowerCase();
      if (!key) continue;

      const existing = dedup.get(key);
      if (!existing) {
        dedup.set(key, q);
        continue;
      }

      if (existing.options.length < q.options.length) dedup.set(key, q);
    }

    return Array.from(dedup.values());
  }
}

import { mapParsedQuestionToCanonical, type CanonicalQuestion } from "./canonicalMapper";

export interface CanonicalParseResult {
  canonicalQuestions: CanonicalQuestion[];
  parseResult: ParseResult;
}

export function parseLatex(content: string): ParseResult {
  const parser = new LaTeXParser();
  return parser.parse(content);
}

export function parseCanonicalLatex(content: string): CanonicalParseResult {
  const parseResult = parseLatex(content);
  return {
    parseResult,
    canonicalQuestions: parseResult.allQuestions.map((question) => mapParsedQuestionToCanonical(question)),
  };
}
