import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, questionsTable, chaptersTable, subjectsTable, choicesTable } from "@workspace/db";
import { generatePdf, getPdfRuntimeHealth } from "../lib/pdfExporter";
import {
  ExportQuestionPdfParams,
  ExportChapterPdfParams,
  ExportSubjectPdfParams,
  ExportSelectedPdfBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

  const pdf = await generatePdf(questions, `Question #${params.data.id}`);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="question-${params.data.id}.pdf"`);
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

  const pdf = await generatePdf(questions, chapter.name);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="chapter-${chapter.name.replace(/\s+/g, "-")}.pdf"`);
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
    const pdf = await generatePdf([], subject.name);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="subject-${subject.name.replace(/\s+/g, "-")}.pdf"`);
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

  const pdf = await generatePdf(questions, subject.name);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="subject-${subject.name.replace(/\s+/g, "-")}.pdf"`);
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

  const pdf = await generatePdf(questions, title ?? "Selected Questions");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="selected-questions.pdf"`);
  res.send(pdf);
});

export default router;
