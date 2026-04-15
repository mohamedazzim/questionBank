import { Router, type IRouter } from "express";
import { eq, sql, ilike, and } from "drizzle-orm";
import { db, chaptersTable, subjectsTable, questionsTable } from "@workspace/db";
import {
  CreateChapterBody,
  UpdateChapterBody,
  GetChapterParams,
  UpdateChapterParams,
  DeleteChapterParams,
  ListChaptersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/chapters", async (req, res): Promise<void> => {
  const query = ListChaptersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { subjectId, search } = query.data;

  const conditions = [];
  if (subjectId) conditions.push(eq(chaptersTable.subjectId, subjectId));
  if (search) conditions.push(ilike(chaptersTable.name, `%${search}%`));

  const chapters = await db
    .select({
      id: chaptersTable.id,
      subjectId: chaptersTable.subjectId,
      subjectName: subjectsTable.name,
      name: chaptersTable.name,
      createdAt: chaptersTable.createdAt,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
    })
    .from(chaptersTable)
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(chaptersTable.id, chaptersTable.subjectId, chaptersTable.name, chaptersTable.createdAt, subjectsTable.name)
    .orderBy(chaptersTable.createdAt);

  res.json(chapters);
});

router.post("/chapters", async (req, res): Promise<void> => {
  const parsed = CreateChapterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify subject exists
  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, parsed.data.subjectId));
  if (!subject) {
    res.status(400).json({ error: "Subject not found" });
    return;
  }

  const [chapter] = await db
    .insert(chaptersTable)
    .values({ subjectId: parsed.data.subjectId, name: parsed.data.name })
    .returning();

  res.status(201).json({ ...chapter, subjectName: subject.name, questionCount: 0 });
});

router.get("/chapters/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetChapterParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chapter] = await db
    .select({
      id: chaptersTable.id,
      subjectId: chaptersTable.subjectId,
      subjectName: subjectsTable.name,
      name: chaptersTable.name,
      createdAt: chaptersTable.createdAt,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
    })
    .from(chaptersTable)
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .where(eq(chaptersTable.id, params.data.id))
    .groupBy(chaptersTable.id, chaptersTable.subjectId, chaptersTable.name, chaptersTable.createdAt, subjectsTable.name);

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  res.json(chapter);
});

router.put("/chapters/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateChapterParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateChapterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify subject exists if subjectId is being changed
  if (parsed.data.subjectId) {
    const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, parsed.data.subjectId));
    if (!subject) {
      res.status(400).json({ error: "Subject not found" });
      return;
    }
  }

  const [chapter] = await db
    .update(chaptersTable)
    .set({ name: parsed.data.name, subjectId: parsed.data.subjectId })
    .where(eq(chaptersTable.id, params.data.id))
    .returning();

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  // Get the updated chapter with counts and subject name
  const [updated] = await db
    .select({
      id: chaptersTable.id,
      subjectId: chaptersTable.subjectId,
      subjectName: subjectsTable.name,
      name: chaptersTable.name,
      createdAt: chaptersTable.createdAt,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
    })
    .from(chaptersTable)
    .leftJoin(subjectsTable, eq(subjectsTable.id, chaptersTable.subjectId))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .where(eq(chaptersTable.id, params.data.id))
    .groupBy(chaptersTable.id, chaptersTable.subjectId, chaptersTable.name, chaptersTable.createdAt, subjectsTable.name);

  res.json(updated || { ...chapter, subjectName: null, questionCount: 0 });
});

router.delete("/chapters/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteChapterParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chapter] = await db
    .delete(chaptersTable)
    .where(eq(chaptersTable.id, params.data.id))
    .returning();

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
