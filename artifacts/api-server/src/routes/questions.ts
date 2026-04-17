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
import { upload } from "../lib/multer";

const router: IRouter = Router();
const VALID_QUESTION_TYPES = ["MCQ", "FILLUP"];
const VALID_DIFFICULTIES = ["EASY", "MEDIUM", "HARD", "UNLABLED"];

const normalizeText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

router.get("/questions", async (req, res): Promise<void> => {
  const query = ListQuestionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { chapterId, subjectId, search, difficulty, type, page = 1, limit = 20 } = query.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (chapterId) conditions.push(eq(questionsTable.chapterId, chapterId));
  if (subjectId) conditions.push(eq(chaptersTable.subjectId, subjectId));
  if (search) conditions.push(ilike(questionsTable.text, `%${search}%`));
  if (difficulty) conditions.push(eq(questionsTable.difficulty, difficulty));
  if (type) conditions.push(eq(questionsTable.type, type));

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
      imageUrl: sql<string | null>`case when ${questionsTable.imageName} is not null then '/api/questions/' || ${questionsTable.id} || '/image' else null end`,
      imageName: questionsTable.imageName,
      imageType: questionsTable.imageType,
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
      questionsTable.type, questionsTable.difficulty, questionsTable.imageName,
      questionsTable.imageType, questionsTable.createdAt,
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

router.post("/questions", upload.single("image"), async (req, res): Promise<void> => {
  const body = req.body;
  const imageFile = req.file;
  const chapterId = parseInt(body.chapterId, 10);
  const normalizedText = normalizeText(body.text);

  if (!body.type || !body.difficulty || isNaN(chapterId)) {
    res.status(400).json({ error: "Missing required fields: chapterId, type, difficulty" });
    return;
  }

  if (!normalizedText && !imageFile) {
    res.status(400).json({ error: "Question must include text or an image" });
    return;
  }

  if (!VALID_QUESTION_TYPES.includes(body.type) || !VALID_DIFFICULTIES.includes(body.difficulty)) {
    res.status(400).json({ error: "Invalid type or difficulty" });
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
      imageData: imageFile ? imageFile.buffer : null,
      imageName: imageFile ? imageFile.originalname : null,
      imageType: imageFile ? imageFile.mimetype : null,
      imageSize: imageFile ? imageFile.size : null,
    })
    .returning();

  res.status(201).json({
    ...question,
    imageData: undefined,
    imageUrl: imageFile ? `/api/questions/${question.id}/image` : null,
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
      imageUrl: sql<string | null>`case when ${questionsTable.imageName} is not null then '/api/questions/' || ${questionsTable.id} || '/image' else null end`,
      imageName: questionsTable.imageName,
      imageType: questionsTable.imageType,
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

router.put("/questions/:id", upload.single("image"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateQuestionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = req.body;
  const imageFile = req.file;
  const removeImage = body.removeImage === "true";

  const [existingQuestion] = await db
    .select({
      id: questionsTable.id,
      text: questionsTable.text,
      imageName: questionsTable.imageName,
      chapterId: questionsTable.chapterId,
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
  const nextHasImage = imageFile ? true : removeImage ? false : Boolean(existingQuestion.imageName);
  if (!nextText && !nextHasImage) {
    res.status(400).json({ error: "Question must include text or an image" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.text != null) updateData.text = normalizeText(body.text);
  if (body.type) updateData.type = body.type;
  if (body.difficulty) updateData.difficulty = body.difficulty;
  if (body.chapterId) updateData.chapterId = parseInt(body.chapterId, 10);

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
      imageUrl: sql<string | null>`case when ${questionsTable.imageName} is not null then '/api/questions/' || ${questionsTable.id} || '/image' else null end`,
      imageName: questionsTable.imageName,
      imageType: questionsTable.imageType,
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
      questionsTable.type, questionsTable.difficulty, questionsTable.imageName,
      questionsTable.imageType, questionsTable.createdAt,
      chaptersTable.name, chaptersTable.subjectId, subjectsTable.name
    );

  res.json(updated || {
    ...question,
    imageData: undefined,
    imageUrl: question.imageName ? `/api/questions/${question.id}/image` : null,
    chapterName: null,
    subjectId: null,
    subjectName: null,
    choiceCount: 0,
  });
});

router.delete("/questions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteQuestionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [question] = await db
    .delete(questionsTable)
    .where(eq(questionsTable.id, params.data.id))
    .returning();

  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.sendStatus(204);
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

  res.json({
    id: question.id,
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    chapterName: question.chapterName,
    subjectName: question.subjectName,
    imageData: question.imageData ? question.imageData.toString("base64") : null,
    imageType: question.imageType,
    choices: choices.map((c) => ({
      id: c.id,
      text: c.text,
      isCorrect: c.isCorrect,
      imageData: c.imageData ? c.imageData.toString("base64") : null,
      imageType: c.imageType,
    })),
  });
});

export default router;
