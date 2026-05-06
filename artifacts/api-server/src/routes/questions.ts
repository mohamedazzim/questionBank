import { Router, type IRouter } from "express";
import { eq, sql, ilike, and, desc, count } from "drizzle-orm";
import { db, questionsTable, chaptersTable, subjectsTable, choicesTable } from "@workspace/db";
import {
  GetQuestionParams,
  DeleteQuestionParams,
  UpdateQuestionParams,
  PreviewQuestionParams,
  GetQuestionImageParams,
  ListQuestionsQueryParams,
} from "@workspace/api-zod";
import { upload, bulkUpload } from "../lib/multer";
import { processBulkIngestion } from "../lib/bulkIngestionProcessor";
import { writeFile } from "fs/promises";
import path from "path";
import { logger } from "../lib/logger";
import { mapFromDB } from "../lib/canonicalMapper";

const router: IRouter = Router();
const VALID_QUESTION_TYPES = ["MCQ", "FILLUP"];
const VALID_DIFFICULTIES = ["EASY", "MEDIUM", "HARD", "UNLABLED"];
const VALID_ACTIVE_STATUSES = ["Active", "Inactive"];
const VALID_VERIFICATION_STATUSES = ["Verified", "Need to Verified", "Changes Needed"];
const VALID_PREVIOUS_YEAR_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const questionUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "solutionImage", maxCount: 1 },
]);

const normalizeText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizePreviousYearParts = (value: string | null): { year: number | null; month: typeof VALID_PREVIOUS_YEAR_MONTHS[number] | null } => {
  if (!value) return { year: null, month: null };

  const yearMatch = value.match(/\b(19|20)\d{2}\b/);
  const monthMatch = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  const normalizedMonth: typeof VALID_PREVIOUS_YEAR_MONTHS[number] | null = monthMatch
    ? VALID_PREVIOUS_YEAR_MONTHS.find((month) => month.toLowerCase() === monthMatch[1].toLowerCase()) ?? null
    : null;

  return {
    year: yearMatch ? Number.parseInt(yearMatch[0], 10) : null,
    month: normalizedMonth,
  };
};

const parseBooleanInput = (value: unknown): boolean | undefined => {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

router.get("/questions", async (req, res): Promise<void> => {
  const query = ListQuestionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { chapterId, subjectId, search, difficulty, type, verificationStatus, page = 1, limit = 20 } = query.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (chapterId) conditions.push(eq(questionsTable.chapterId, chapterId));
  if (subjectId) conditions.push(eq(chaptersTable.subjectId, subjectId));
  if (search) conditions.push(ilike(questionsTable.text, `%${search}%`));
  if (difficulty) conditions.push(eq(questionsTable.difficulty, difficulty));
  if (type) conditions.push(eq(questionsTable.type, type));
  if (verificationStatus) conditions.push(eq(questionsTable.verificationStatus, verificationStatus));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(questionsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.id, questionsTable.chapterId))
    .where(whereClause);

  const questions = await db
    .select({
      id: questionsTable.id,
      chapterId: questionsTable.chapterId,
      chapterName: chaptersTable.name,
      subjectId: chaptersTable.subjectId,
      subjectName: subjectsTable.name,
      text: questionsTable.text,
      type: questionsTable.type,
      difficulty: questionsTable.difficulty,
      activeStatus: questionsTable.activeStatus,
      verificationStatus: questionsTable.verificationStatus,
      isPreviousYear: questionsTable.isPreviousYear,
      previousYearDateText: questionsTable.previousYearDateText,
      previousYearYear: questionsTable.previousYearYear,
      previousYearMonth: questionsTable.previousYearMonth,
      answerText: questionsTable.answerText,
      imageUrl: sql<string | null>`case when ${questionsTable.imageName} is not null then '/api/questions/' || ${questionsTable.id} || '/image' else null end`,
      imageName: questionsTable.imageName,
      imageType: questionsTable.imageType,
      solutionText: questionsTable.solutionText,
      solutionImageUrl: sql<string | null>`case when ${questionsTable.solutionImageName} is not null then '/api/questions/' || ${questionsTable.id} || '/solution-image' else null end`,
      solutionImageName: questionsTable.solutionImageName,
      solutionImageType: questionsTable.solutionImageType,
      createdAt: questionsTable.createdAt,
      choiceCount: sql<number>`cast(count(distinct ${choicesTable.id}) as int)`,
    })
    .from(questionsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.id, questionsTable.chapterId))
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .leftJoin(choicesTable, eq(choicesTable.questionId, questionsTable.id))
    .where(whereClause)
    .groupBy(
      questionsTable.id, questionsTable.chapterId, questionsTable.text,
      questionsTable.type, questionsTable.difficulty, questionsTable.activeStatus, questionsTable.verificationStatus,
      questionsTable.isPreviousYear, questionsTable.previousYearDateText, questionsTable.previousYearYear, questionsTable.previousYearMonth, questionsTable.imageName,
      questionsTable.imageType, questionsTable.answerText, questionsTable.solutionText, questionsTable.solutionImageName,
      questionsTable.solutionImageType, questionsTable.createdAt,
      chaptersTable.name, chaptersTable.subjectId, subjectsTable.name
    )
    .orderBy(desc(questionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    questions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.post("/questions", questionUpload, async (req, res): Promise<void> => {
  const body = req.body;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFile = files?.image?.[0] || null;
  const solutionImageFile = files?.solutionImage?.[0] || null;
  const chapterId = parseInt(body.chapterId, 10);
  const normalizedText = normalizeText(body.text);
  const normalizedAnswerText = normalizeText(body.answerText) || null;
  const normalizedSolutionText = normalizeText(body.solutionText) || null;

  if (!body.type || !body.difficulty || isNaN(chapterId)) {
    res.status(400).json({ error: "Missing required fields: chapterId, type, difficulty" });
    return;
  }

  const activeStatus = body.activeStatus || "Active";
  const verificationStatus = body.verificationStatus || "Need to Verified";
  const parsedIsPreviousYear = parseBooleanInput(body.isPreviousYear);
  const isPreviousYear = parsedIsPreviousYear ?? false;
  const previousYearDateText = normalizeText(body.previousYearDateText) || null;
  const previousYearParts = normalizePreviousYearParts(previousYearDateText);

  if (!normalizedText) {
    res.status(400).json({ error: "Question text is required" });
    return;
  }

  if (!VALID_QUESTION_TYPES.includes(body.type) || !VALID_DIFFICULTIES.includes(body.difficulty) || !VALID_ACTIVE_STATUSES.includes(activeStatus) || !VALID_VERIFICATION_STATUSES.includes(verificationStatus)) {
    res.status(400).json({ error: "Invalid type, difficulty, activeStatus, or verificationStatus" });
    return;
  }

  if (isPreviousYear && !previousYearDateText) {
    res.status(400).json({ error: "When isPreviousYear is true, previousYearDateText is required." });
    return;
  }

  // Verify chapter exists
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, chapterId));
  if (!chapter) {
    res.status(400).json({ error: "Chapter not found" });
    return;
  }

  const [question] = await db
    .insert(questionsTable)
    .values({
      chapterId,
      text: normalizedText,
      type: body.type,
      difficulty: body.difficulty,
      activeStatus,
      verificationStatus,
      isPreviousYear,
      previousYearDateText: isPreviousYear ? previousYearDateText : null,
      previousYearYear: isPreviousYear ? previousYearParts.year : null,
      previousYearMonth: isPreviousYear ? previousYearParts.month : null,
      answerText: normalizedAnswerText,
      imageData: imageFile ? imageFile.buffer : null,
      imageName: imageFile ? imageFile.originalname : null,
      imageType: imageFile ? imageFile.mimetype : null,
      imageSize: imageFile ? imageFile.size : null,
      solutionText: normalizedSolutionText,
      solutionImageData: solutionImageFile ? solutionImageFile.buffer : null,
      solutionImageName: solutionImageFile ? solutionImageFile.originalname : null,
      solutionImageType: solutionImageFile ? solutionImageFile.mimetype : null,
      solutionImageSize: solutionImageFile ? solutionImageFile.size : null,
    })
    .returning();

  res.status(201).json({
    ...question,
    imageData: undefined,
    solutionImageData: undefined,
    imageUrl: imageFile ? `/api/questions/${question.id}/image` : null,
    solutionImageUrl: solutionImageFile ? `/api/questions/${question.id}/solution-image` : null,
    chapterName: null,
    subjectId: null,
    subjectName: null,
    choiceCount: 0,
  });
});

router.get("/questions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetQuestionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [question] = await db
    .select({
      id: questionsTable.id,
      chapterId: questionsTable.chapterId,
      chapterName: chaptersTable.name,
      subjectId: chaptersTable.subjectId,
      subjectName: subjectsTable.name,
      text: questionsTable.text,
      type: questionsTable.type,
      difficulty: questionsTable.difficulty,
      activeStatus: questionsTable.activeStatus,
      verificationStatus: questionsTable.verificationStatus,
      isPreviousYear: questionsTable.isPreviousYear,
      previousYearDateText: questionsTable.previousYearDateText,
      previousYearYear: questionsTable.previousYearYear,
      previousYearMonth: questionsTable.previousYearMonth,
      answerText: questionsTable.answerText,
      imageUrl: sql<string | null>`case when ${questionsTable.imageName} is not null then '/api/questions/' || ${questionsTable.id} || '/image' else null end`,
      imageName: questionsTable.imageName,
      imageType: questionsTable.imageType,
      solutionText: questionsTable.solutionText,
      solutionImageUrl: sql<string | null>`case when ${questionsTable.solutionImageName} is not null then '/api/questions/' || ${questionsTable.id} || '/solution-image' else null end`,
      solutionImageName: questionsTable.solutionImageName,
      solutionImageType: questionsTable.solutionImageType,
      createdAt: questionsTable.createdAt,
    })
    .from(questionsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.id, questionsTable.chapterId))
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .where(eq(questionsTable.id, params.data.id));

  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const choices = await db
    .select({
      id: choicesTable.id,
      questionId: choicesTable.questionId,
      text: choicesTable.text,
      imageUrl: sql<string | null>`case when ${choicesTable.imageName} is not null then '/api/choices/' || ${choicesTable.id} || '/image' else null end`,
      imageName: choicesTable.imageName,
      isCorrect: choicesTable.isCorrect,
      createdAt: choicesTable.createdAt,
    })
    .from(choicesTable)
    .where(eq(choicesTable.questionId, params.data.id))
    .orderBy(choicesTable.id);

  res.json({ ...question, choices });
});

router.put("/questions/:id", questionUpload, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateQuestionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = req.body;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFile = files?.image?.[0] || null;
  const solutionImageFile = files?.solutionImage?.[0] || null;
  const removeImage = body.removeImage === "true";
  const removeSolutionImage = body.removeSolutionImage === "true";

  const [existingQuestion] = await db
    .select({
      id: questionsTable.id,
      text: questionsTable.text,
      imageName: questionsTable.imageName,
      solutionImageName: questionsTable.solutionImageName,
      chapterId: questionsTable.chapterId,
      isPreviousYear: questionsTable.isPreviousYear,
      previousYearDateText: questionsTable.previousYearDateText,
      previousYearYear: questionsTable.previousYearYear,
      previousYearMonth: questionsTable.previousYearMonth,
      answerText: questionsTable.answerText,
    })
    .from(questionsTable)
    .where(eq(questionsTable.id, params.data.id));

  if (!existingQuestion) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  if (body.type && !VALID_QUESTION_TYPES.includes(body.type)) {
    res.status(400).json({ error: "Invalid question type" });
    return;
  }

  if (body.difficulty && !VALID_DIFFICULTIES.includes(body.difficulty)) {
    res.status(400).json({ error: "Invalid difficulty" });
    return;
  }

  if (body.activeStatus && !VALID_ACTIVE_STATUSES.includes(body.activeStatus)) {
    res.status(400).json({ error: "Invalid activeStatus" });
    return;
  }

  if (body.verificationStatus && !VALID_VERIFICATION_STATUSES.includes(body.verificationStatus)) {
    res.status(400).json({ error: "Invalid verificationStatus" });
    return;
  }

  const parsedIsPreviousYear = body.isPreviousYear != null ? parseBooleanInput(body.isPreviousYear) : undefined;
  if (body.isPreviousYear != null && parsedIsPreviousYear === undefined) {
    res.status(400).json({ error: "Invalid isPreviousYear" });
    return;
  }

  const parsedPreviousYearDateText = body.previousYearDateText != null
    ? (normalizeText(body.previousYearDateText) || null)
    : undefined;

  const nextIsPreviousYear = parsedIsPreviousYear ?? existingQuestion.isPreviousYear;
  const nextPreviousYearDateText = parsedPreviousYearDateText !== undefined
    ? parsedPreviousYearDateText
    : existingQuestion.previousYearDateText;
  const nextPreviousYearParts = normalizePreviousYearParts(nextPreviousYearDateText);

  if (nextIsPreviousYear && !nextPreviousYearDateText) {
    res.status(400).json({ error: "When isPreviousYear is true, previousYearDateText is required." });
    return;
  }

  if (body.chapterId) {
    const nextChapterId = parseInt(body.chapterId, 10);
    if (Number.isNaN(nextChapterId)) {
      res.status(400).json({ error: "Invalid chapterId" });
      return;
    }

    const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, nextChapterId));
    if (!chapter) {
      res.status(400).json({ error: "Chapter not found" });
      return;
    }
  }

  const nextText = body.text != null ? normalizeText(body.text) : normalizeText(existingQuestion.text);
  if (!nextText) {
    res.status(400).json({ error: "Question text is required" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.text != null) updateData.text = normalizeText(body.text);
  if (body.solutionText != null) {
    const normalizedSolutionText = normalizeText(body.solutionText);
    updateData.solutionText = normalizedSolutionText || null;
  }
  if (body.answerText != null) {
    const normalizedAnswerText = normalizeText(body.answerText);
    updateData.answerText = normalizedAnswerText || null;
  }
  if (body.type) updateData.type = body.type;
  if (body.difficulty) updateData.difficulty = body.difficulty;
  if (body.activeStatus) updateData.activeStatus = body.activeStatus;
  if (body.verificationStatus) updateData.verificationStatus = body.verificationStatus;
  if (body.chapterId) updateData.chapterId = parseInt(body.chapterId, 10);
  if (parsedIsPreviousYear !== undefined) updateData.isPreviousYear = parsedIsPreviousYear;
  if (parsedPreviousYearDateText !== undefined) updateData.previousYearDateText = parsedPreviousYearDateText;

  if (nextIsPreviousYear) {
    updateData.previousYearYear = nextPreviousYearParts.year;
    updateData.previousYearMonth = nextPreviousYearParts.month;
  }

  if (!nextIsPreviousYear) {
    updateData.isPreviousYear = false;
    updateData.previousYearDateText = null;
    updateData.previousYearYear = null;
    updateData.previousYearMonth = null;
  }

  if (imageFile) {
    updateData.imageData = imageFile.buffer;
    updateData.imageName = imageFile.originalname;
    updateData.imageType = imageFile.mimetype;
    updateData.imageSize = imageFile.size;
  } else if (removeImage) {
    updateData.imageData = null;
    updateData.imageName = null;
    updateData.imageType = null;
    updateData.imageSize = null;
  }

  if (solutionImageFile) {
    updateData.solutionImageData = solutionImageFile.buffer;
    updateData.solutionImageName = solutionImageFile.originalname;
    updateData.solutionImageType = solutionImageFile.mimetype;
    updateData.solutionImageSize = solutionImageFile.size;
  } else if (removeSolutionImage) {
    updateData.solutionImageData = null;
    updateData.solutionImageName = null;
    updateData.solutionImageType = null;
    updateData.solutionImageSize = null;
  }

  const [question] = await db
    .update(questionsTable)
    .set(updateData)
    .where(eq(questionsTable.id, params.data.id))
    .returning();

  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  // Get the updated question with full details
  const [updated] = await db
    .select({
      id: questionsTable.id,
      chapterId: questionsTable.chapterId,
      chapterName: chaptersTable.name,
      subjectId: chaptersTable.subjectId,
      subjectName: subjectsTable.name,
      text: questionsTable.text,
      type: questionsTable.type,
      difficulty: questionsTable.difficulty,
      activeStatus: questionsTable.activeStatus,
      verificationStatus: questionsTable.verificationStatus,
      isPreviousYear: questionsTable.isPreviousYear,
      previousYearDateText: questionsTable.previousYearDateText,
      previousYearYear: questionsTable.previousYearYear,
      previousYearMonth: questionsTable.previousYearMonth,
      answerText: questionsTable.answerText,
      imageUrl: sql<string | null>`case when ${questionsTable.imageName} is not null then '/api/questions/' || ${questionsTable.id} || '/image' else null end`,
      imageName: questionsTable.imageName,
      imageType: questionsTable.imageType,
      solutionText: questionsTable.solutionText,
      solutionImageUrl: sql<string | null>`case when ${questionsTable.solutionImageName} is not null then '/api/questions/' || ${questionsTable.id} || '/solution-image' else null end`,
      solutionImageName: questionsTable.solutionImageName,
      solutionImageType: questionsTable.solutionImageType,
      createdAt: questionsTable.createdAt,
      choiceCount: sql<number>`cast(count(distinct ${choicesTable.id}) as int)`,
    })
    .from(questionsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.id, questionsTable.chapterId))
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .leftJoin(choicesTable, eq(choicesTable.questionId, questionsTable.id))
    .where(eq(questionsTable.id, params.data.id))
    .groupBy(
      questionsTable.id, questionsTable.chapterId, questionsTable.text,
      questionsTable.type, questionsTable.difficulty, questionsTable.activeStatus, questionsTable.verificationStatus,
      questionsTable.isPreviousYear, questionsTable.previousYearDateText, questionsTable.previousYearYear, questionsTable.previousYearMonth, questionsTable.imageName,
      questionsTable.imageType, questionsTable.answerText, questionsTable.solutionText, questionsTable.solutionImageName,
      questionsTable.solutionImageType, questionsTable.createdAt,
      chaptersTable.name, chaptersTable.subjectId, subjectsTable.name
    );

  res.json(updated || {
    ...question,
    imageData: undefined,
    solutionImageData: undefined,
    imageUrl: question.imageName ? `/api/questions/${question.id}/image` : null,
    solutionImageUrl: question.solutionImageName ? `/api/questions/${question.id}/solution-image` : null,
    chapterName: null,
    subjectId: null,
    subjectName: null,
    choiceCount: 0,
  });
});

router.delete("/questions/clear-all", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV !== "development") {
    res.status(403).json({ success: false, message: "Bulk delete is disabled in production", error: "Bulk delete is disabled in production" });
    return;
  }

  const confirm = req.body?.confirm === true;

  if (!confirm) {
    res.status(400).json({ success: false, message: "Confirmation required", error: "confirm must be true" });
    return;
  }

  const deletedCount = await db.transaction(async (tx) => {
    await tx.delete(choicesTable);
    const deleted = await tx.delete(questionsTable).returning({ id: questionsTable.id });
    return deleted.length;
  });

  logger.info({ deletedCount, timestamp: new Date().toISOString() }, "All DB questions cleared");

  res.json({
    success: true,
    message: "All questions cleared from database successfully",
    deletedCount,
  });
});

router.delete("/questions/chapter/:chapterId/clear", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV !== "development") {
    res.status(403).json({ success: false, message: "Bulk delete is disabled in production", error: "Bulk delete is disabled in production" });
    return;
  }

  const raw = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const chapterId = parseInt(raw, 10);
  const confirm = req.body?.confirm === true;

  if (Number.isNaN(chapterId)) {
    res.status(400).json({ success: false, message: "Invalid chapterId", error: "Invalid chapterId" });
    return;
  }

  if (!confirm) {
    res.status(400).json({ success: false, message: "Confirmation required", error: "confirm must be true" });
    return;
  }

  const [chapter] = await db.select({ id: chaptersTable.id }).from(chaptersTable).where(eq(chaptersTable.id, chapterId));
  if (!chapter) {
    res.status(404).json({ success: false, message: "Chapter not found", error: "Chapter not found" });
    return;
  }

  const deletedCount = await db.transaction(async (tx) => {
    const chapterQuestions = await tx
      .select({ id: questionsTable.id })
      .from(questionsTable)
      .where(eq(questionsTable.chapterId, chapterId));

    for (const question of chapterQuestions) {
      await tx.delete(choicesTable).where(eq(choicesTable.questionId, question.id));
    }

    const deleted = await tx.delete(questionsTable).where(eq(questionsTable.chapterId, chapterId)).returning({ id: questionsTable.id });
    return deleted.length;
  });

  logger.info({ chapterId, deletedCount, timestamp: new Date().toISOString() }, "Chapter questions cleared");

  res.json({
    success: true,
    message: "All questions deleted successfully",
    deletedCount,
  });
});

router.delete("/questions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteQuestionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const question = await db.transaction(async (tx) => {
      // Manually delete choices first to prevent foreign key constraint violations
      // in case the database doesn't have ON DELETE CASCADE configured natively
      await tx.delete(choicesTable).where(eq(choicesTable.questionId, params.data.id));
      
      const [deletedQuestion] = await tx
        .delete(questionsTable)
        .where(eq(questionsTable.id, params.data.id))
        .returning();
        
      return deletedQuestion;
    });

    if (!question) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    res.json(question);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete question", details: String(error) });
  }
});

router.get("/questions/:id/image", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetQuestionImageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [question] = await db
    .select({ imageData: questionsTable.imageData, imageType: questionsTable.imageType })
    .from(questionsTable)
    .where(eq(questionsTable.id, params.data.id));

  if (!question || !question.imageData || !question.imageType) {
    res.status(404).json({ error: "No image" });
    return;
  }

  res.setHeader("Content-Type", question.imageType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(question.imageData);
});

router.get("/questions/:id/solution-image", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetQuestionImageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [question] = await db
    .select({ solutionImageData: questionsTable.solutionImageData, solutionImageType: questionsTable.solutionImageType })
    .from(questionsTable)
    .where(eq(questionsTable.id, params.data.id));

  if (!question || !question.solutionImageData || !question.solutionImageType) {
    res.status(404).json({ error: "No image" });
    return;
  }

  res.setHeader("Content-Type", question.solutionImageType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(question.solutionImageData);
});

router.get("/questions/:id/preview", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = PreviewQuestionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [question] = await db
    .select({
      id: questionsTable.id,
      chapterId: questionsTable.chapterId,
      subjectId: chaptersTable.subjectId,
      text: questionsTable.text,
      type: questionsTable.type,
      difficulty: questionsTable.difficulty,
      activeStatus: questionsTable.activeStatus,
      verificationStatus: questionsTable.verificationStatus,
      isPreviousYear: questionsTable.isPreviousYear,
      previousYearDateText: questionsTable.previousYearDateText,
      previousYearYear: questionsTable.previousYearYear,
      previousYearMonth: questionsTable.previousYearMonth,
      answerText: questionsTable.answerText,
      chapterName: chaptersTable.name,
      subjectName: subjectsTable.name,
      imageData: questionsTable.imageData,
      imageType: questionsTable.imageType,
      solutionText: questionsTable.solutionText,
      solutionImageData: questionsTable.solutionImageData,
      solutionImageType: questionsTable.solutionImageType,
    })
    .from(questionsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.id, questionsTable.chapterId))
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .where(eq(questionsTable.id, params.data.id));

  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const choices = await db
    .select()
    .from(choicesTable)
    .where(eq(choicesTable.questionId, params.data.id))
    .orderBy(choicesTable.id);

  const canonicalQuestion = mapFromDB(question, choices.map((choice) => ({ text: choice.text, isCorrect: choice.isCorrect })));

  res.json({
    id: question.id,
    canonicalQuestion,
    questionText: canonicalQuestion.questionText,
    options: canonicalQuestion.options,
    images: canonicalQuestion.images,
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    activeStatus: question.activeStatus,
    verificationStatus: question.verificationStatus,
    isPreviousYear: question.isPreviousYear,
    previousYearDateText: question.previousYearDateText,
    previousYearYear: question.previousYearYear,
    previousYearMonth: question.previousYearMonth,
    answerText: question.answerText,
    chapterName: question.chapterName,
    subjectName: question.subjectName,
    imageData: question.imageData ? question.imageData.toString("base64") : null,
    imageType: question.imageType,
    solutionText: question.solutionText,
    solutionImageData: question.solutionImageData ? question.solutionImageData.toString("base64") : null,
    solutionImageType: question.solutionImageType,
    choices: choices.map((c) => ({
      id: c.id,
      text: c.text,
      isCorrect: c.isCorrect,
      imageData: c.imageData ? c.imageData.toString("base64") : null,
      imageType: c.imageType,
    })),
  });
});

/**
 * Bulk ingestion endpoint
 * POST /questions/bulk/upload
 * 
 * Accepts ZIP/RAR archive containing LaTeX source and images
 * Returns detailed ingestion results and error report
 */
router.post("/questions/bulk/upload", bulkUpload.single("zipFile"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      message: "No archive uploaded",
      error: "No archive uploaded",
    });
    return;
  }

  const chapterId = parseInt(req.body.chapterId, 10);

  if (isNaN(chapterId)) {
    res.status(400).json({
      success: false,
      message: "Invalid or missing chapterId",
      error: "Invalid or missing chapterId",
    });
    return;
  }

  // Verify chapter exists
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, chapterId));
  if (!chapter) {
    res.status(400).json({
      success: false,
      message: "Chapter not found",
      error: "Chapter not found",
    });
    return;
  }

  try {
    logger.info(
      {
        chapterId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      "Bulk upload received",
    );

    // Write archive file to temporary location
    const tmpDir = path.join(process.cwd(), "uploads", "tmp");
    await (await import("fs/promises")).mkdir(tmpDir, { recursive: true });
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const safeExt = ext === ".rar" ? ".rar" : ".zip";
    const tmpPath = path.join(tmpDir, `bulk-upload-${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
    await writeFile(tmpPath, req.file.buffer);

    logger.info({ tmpPath, chapterId }, "Bulk ingestion extraction start");

    // Process bulk ingestion
    const result = await processBulkIngestion({
      archiveFilePath: tmpPath,
      chapterId,
      defaultDifficulty: "UNLABLED",
    });

    logger.info(
      {
        chapterId,
        success: result.success,
        summary: result.summary,
        stats: result.stats,
      },
      "Bulk ingestion completed",
    );

    const failureDetails = result.errors.map((e) => `${e.message} ${e.detail || ""}`.trim()).join(" | ");

    if (!result.success && failureDetails.includes("RAR extraction requires WinRAR or unrar installed")) {
      res.status(400).json({
        success: false,
        message: "RAR extraction failed",
        reason: "unrar not installed",
        error: "RAR extraction requires WinRAR or unrar installed",
      });
      return;
    }

    if (!result.success && failureDetails.includes("Invalid or corrupted RAR file")) {
      res.status(400).json({
        success: false,
        message: "Invalid or corrupted RAR file",
        reason: "corrupted file",
        error: "Invalid or corrupted RAR file",
      });
      return;
    }

    if (!result.success && failureDetails.includes("RAR contains no files")) {
      res.status(400).json({
        success: false,
        message: "RAR contains no files",
        reason: "no files extracted",
        error: "RAR contains no files",
      });
      return;
    }

    if (!result.success && failureDetails.includes("RAR extraction failed: archive is corrupt or unsupported")) {
      res.status(400).json({
        success: false,
        message: "RAR extraction failed",
        reason: "archive is corrupt or unsupported",
        error: "RAR extraction failed: archive is corrupt or unsupported",
      });
      return;
    }

    // Clean up temp ZIP file
    try {
      await (await import("fs/promises")).rm(tmpPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }

    res.status(result.success ? 201 : result.summary.inserted > 0 ? 200 : 400).json({
      ...result,
      success: result.success,
      message: result.success ? "Bulk upload completed successfully" : result.summary.inserted > 0 ? "Bulk upload completed with issues" : "Bulk upload failed",
      data: result,
    });
  } catch (err) {
    logger.error({ err, chapterId, fileName: req.file.originalname }, "Bulk upload failed");
    res.status(500).json({
      success: false,
      message: "Failed to process bulk ingestion",
      error: "Failed to process bulk ingestion",
      detail: String(err),
    });
  }
});

export default router;
