import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, questionsTable, chaptersTable, subjectsTable, choicesTable } from "@workspace/db";
import { generatePdf, generateTex, getPdfRuntimeHealth, getQuestionImageFileName, getChoiceImageFileName } from "../lib/pdfExporter";
import { mkdirSync, writeFileSync, rmSync, createWriteStream, readFileSync } from "fs";
import path from "path";
import archiver from "archiver";
import {
  ExportQuestionPdfParams,
  ExportChapterPdfParams,
  ExportSubjectPdfParams,
  ExportSelectedPdfBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const projectRoot = path.resolve(process.cwd(), "../..");

function sanitizeFileName(name: string): string {
  // Export filenames and folders are sanitized to keep filesystem-safe paths across platforms.
  return name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "export";
}

function ensureDirectory(dirPath: string): void {
  // recursive mkdir ensures nested export folders are always created in one operation.
  mkdirSync(dirPath, { recursive: true });
}

function getLocalExportDir(scope: "question" | "chapter" | "subject" | "selected", value: string): string {
  // We store a local archive copy under project-root/export for traceability and offline reuse.
  const baseExportDir = path.join(projectRoot, "export");
  ensureDirectory(baseExportDir);

  if (scope === "question") return path.join(baseExportDir, `question_${value}`);
  if (scope === "selected") return path.join(baseExportDir, "custom_selection");
  return path.join(baseExportDir, sanitizeFileName(value));
}

function writeTexImages(questions: Awaited<ReturnType<typeof fetchQuestionsWithChoices>>, imagesDir: string): void {
  ensureDirectory(imagesDir);

  for (const question of questions) {
    if (question.imageData && question.imageType) {
      const questionImageName = getQuestionImageFileName(question.id, question.imageType);
      writeFileSync(path.join(imagesDir, questionImageName), question.imageData);
    }

    for (const choice of question.choices) {
      if (choice.imageData && choice.imageType) {
        const choiceImageName = getChoiceImageFileName(question.id, choice.id, choice.imageType);
        writeFileSync(path.join(imagesDir, choiceImageName), choice.imageData);
      }
    }
  }
}

async function zipDirectory(sourceDir: string, outputZipPath: string): Promise<Buffer> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });

  return readFileSync(outputZipPath);
}

async function buildTexZip(questions: Awaited<ReturnType<typeof fetchQuestionsWithChoices>>, title: string): Promise<Buffer> {
  const tempExportDir = path.join("/tmp", `export-${Date.now()}`);
  const tempImagesDir = path.join(tempExportDir, "images");
  const texPath = path.join(tempExportDir, "questions.tex");
  const zipPath = path.join("/tmp", `export-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);

  // Images are exported beside the TEX file so pdflatex resolves relative assets reliably.
  ensureDirectory(tempImagesDir);
  writeTexImages(questions, tempImagesDir);

  const tex = generateTex(questions, title);
  writeFileSync(texPath, tex, "utf-8");

  // ZIP packaging keeps questions.tex + images together as a single portable download artifact.
  const zipBuffer = await zipDirectory(tempExportDir, zipPath);
  rmSync(zipPath, { force: true });
  rmSync(tempExportDir, { recursive: true, force: true });
  return zipBuffer;
}

function persistPdfCopy(localDir: string, filename: string, pdfBuffer: Buffer): void {
  ensureDirectory(localDir);
  writeFileSync(path.join(localDir, filename), pdfBuffer);
}

function persistTexCopy(localDir: string, filename: string, zipBuffer: Buffer): void {
  ensureDirectory(localDir);

  // Keep only the packaged artifact locally to avoid redundant extracted copies.
  rmSync(path.join(localDir, "images"), { recursive: true, force: true });
  rmSync(path.join(localDir, filename), { force: true });

  // We keep the ZIP copy locally to mirror the exact downloadable bundle.
  writeFileSync(path.join(localDir, "questions.zip"), zipBuffer);
}

function setLocalExportHeader(res: any, localDir: string): void {
  res.setHeader("X-Local-Export-Dir", localDir);
}

router.get("/export/health", (_req, res): void => {
  const health = getPdfRuntimeHealth();
  res.json({
    canGeneratePdf: health.canGeneratePdf,
    browserPath: health.browserPath,
  });
});

async function fetchQuestionsWithChoices(questionIds: number[]) {
  if (questionIds.length === 0) return [];

  const questions = await db
    .select({
      id: questionsTable.id,
      text: questionsTable.text,
      type: questionsTable.type,
      difficulty: questionsTable.difficulty,
      chapterName: chaptersTable.name,
      subjectName: subjectsTable.name,
      imageData: questionsTable.imageData,
      imageType: questionsTable.imageType,
    })
    .from(questionsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.id, questionsTable.chapterId))
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .where(inArray(questionsTable.id, questionIds))
    .orderBy(questionsTable.id);

  const choices = await db
    .select()
    .from(choicesTable)
    .where(inArray(choicesTable.questionId, questionIds))
    .orderBy(choicesTable.questionId, choicesTable.id);

  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    difficulty: q.difficulty,
    chapterName: q.chapterName,
    subjectName: q.subjectName,
    imageData: q.imageData ?? null,
    imageType: q.imageType ?? null,
    choices: choices
      .filter((c) => c.questionId === q.id)
      .map((c) => ({
        id: c.id,
        text: c.text,
        isCorrect: c.isCorrect,
        imageData: c.imageData ?? null,
        imageType: c.imageType ?? null,
      })),
  }));
}

router.get("/export/pdf/question/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportQuestionPdfParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const questions = await fetchQuestionsWithChoices([params.data.id]);
  if (questions.length === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const exportBase = `question_${params.data.id}`;
  const pdfFilename = `${exportBase}.pdf`;
  const pdf = await generatePdf(questions, `Question #${params.data.id}`);
  const localDir = getLocalExportDir("question", String(params.data.id));
  persistPdfCopy(localDir, pdfFilename, pdf);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
  res.send(pdf);
});

router.get("/export/pdf/chapter/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportChapterPdfParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chapter] = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.id, params.data.id));

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const questionRows = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.chapterId, params.data.id));

  const ids = questionRows.map((r) => r.id);
  const questions = await fetchQuestionsWithChoices(ids);

  const safeName = sanitizeFileName(chapter.name);
  const pdfFilename = `${safeName}.pdf`;
  const pdf = await generatePdf(questions, chapter.name);
  const localDir = getLocalExportDir("chapter", chapter.name);
  persistPdfCopy(localDir, pdfFilename, pdf);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
  res.send(pdf);
});

router.get("/export/pdf/subject/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportSubjectPdfParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [subject] = await db
    .select()
    .from(subjectsTable)
    .where(eq(subjectsTable.id, params.data.id));

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const chapterRows = await db
    .select({ id: chaptersTable.id })
    .from(chaptersTable)
    .where(eq(chaptersTable.subjectId, params.data.id));

  if (chapterRows.length === 0) {
    const safeName = sanitizeFileName(subject.name);
    const pdfFilename = `${safeName}.pdf`;
    const pdf = await generatePdf([], subject.name);
    const localDir = getLocalExportDir("subject", subject.name);
    persistPdfCopy(localDir, pdfFilename, pdf);
    setLocalExportHeader(res, localDir);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.send(pdf);
    return;
  }

  const chapterIds = chapterRows.map((r) => r.id);
  const questionRows = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(inArray(questionsTable.chapterId, chapterIds));

  const ids = questionRows.map((r) => r.id);
  const questions = await fetchQuestionsWithChoices(ids);

  const safeName = sanitizeFileName(subject.name);
  const pdfFilename = `${safeName}.pdf`;
  const pdf = await generatePdf(questions, subject.name);
  const localDir = getLocalExportDir("subject", subject.name);
  persistPdfCopy(localDir, pdfFilename, pdf);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
  res.send(pdf);
});

router.post("/export/pdf/selected", async (req, res): Promise<void> => {
  const parsed = ExportSelectedPdfBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { questionIds, title } = parsed.data;
  const questions = await fetchQuestionsWithChoices(questionIds);

  const pdfFilename = "custom_selection.pdf";
  const pdf = await generatePdf(questions, title ?? "Selected Questions");
  const localDir = getLocalExportDir("selected", "custom_selection");
  persistPdfCopy(localDir, pdfFilename, pdf);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
  res.send(pdf);
});

router.get("/export/tex/question/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportQuestionPdfParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const questions = await fetchQuestionsWithChoices([params.data.id]);
  if (questions.length === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const texFilename = `question_${params.data.id}.tex`;
  const zipBuffer = await buildTexZip(questions, `Question #${params.data.id}`);
  const localDir = getLocalExportDir("question", String(params.data.id));
  persistTexCopy(localDir, texFilename, zipBuffer);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="questions.zip"`);
  res.send(zipBuffer);
});

router.get("/export/tex/chapter/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportChapterPdfParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chapter] = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.id, params.data.id));

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const questionRows = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.chapterId, params.data.id));

  const ids = questionRows.map((r) => r.id);
  const questions = await fetchQuestionsWithChoices(ids);

  const texFilename = `${sanitizeFileName(chapter.name)}.tex`;
  const zipBuffer = await buildTexZip(questions, chapter.name);
  const localDir = getLocalExportDir("chapter", chapter.name);
  persistTexCopy(localDir, texFilename, zipBuffer);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="questions.zip"`);
  res.send(zipBuffer);
});

router.get("/export/tex/subject/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExportSubjectPdfParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [subject] = await db
    .select()
    .from(subjectsTable)
    .where(eq(subjectsTable.id, params.data.id));

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const chapterRows = await db
    .select({ id: chaptersTable.id })
    .from(chaptersTable)
    .where(eq(chaptersTable.subjectId, params.data.id));

  if (chapterRows.length === 0) {
    const texFilename = `${sanitizeFileName(subject.name)}.tex`;
    const zipBuffer = await buildTexZip([], subject.name);
    const localDir = getLocalExportDir("subject", subject.name);
    persistTexCopy(localDir, texFilename, zipBuffer);
    setLocalExportHeader(res, localDir);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="questions.zip"`);
    res.send(zipBuffer);
    return;
  }

  const chapterIds = chapterRows.map((r) => r.id);
  const questionRows = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(inArray(questionsTable.chapterId, chapterIds));

  const ids = questionRows.map((r) => r.id);
  const questions = await fetchQuestionsWithChoices(ids);

  const texFilename = `${sanitizeFileName(subject.name)}.tex`;
  const zipBuffer = await buildTexZip(questions, subject.name);
  const localDir = getLocalExportDir("subject", subject.name);
  persistTexCopy(localDir, texFilename, zipBuffer);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="questions.zip"`);
  res.send(zipBuffer);
});

router.post("/export/tex/selected", async (req, res): Promise<void> => {
  const parsed = ExportSelectedPdfBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { questionIds, title } = parsed.data;
  const questions = await fetchQuestionsWithChoices(questionIds);

  const exportTitle = title ?? "Selected Questions";
  const texFilename = "custom_selection.tex";
  const zipBuffer = await buildTexZip(questions, exportTitle);
  const localDir = getLocalExportDir("selected", "custom_selection");
  persistTexCopy(localDir, texFilename, zipBuffer);
  setLocalExportHeader(res, localDir);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="questions.zip"`);
  res.send(zipBuffer);
});

export default router;
