import { Router, type IRouter } from "express";
import { eq, sql, ilike } from "drizzle-orm";
import { db, subjectsTable, chaptersTable, questionsTable } from "@workspace/db";
import {
  CreateSubjectBody,
  UpdateSubjectBody,
  GetSubjectParams,
  UpdateSubjectParams,
  DeleteSubjectParams,
  ListSubjectsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/subjects", async (req, res): Promise<void> => {
  const query = ListSubjectsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { search } = query.data;

  const subjects = await db
    .select({
      id: subjectsTable.id,
      name: subjectsTable.name,
      createdAt: subjectsTable.createdAt,
      chapterCount: sql<number>`cast(count(distinct ${chaptersTable.id}) as int)`,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
    })
    .from(subjectsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.subjectId, subjectsTable.id))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .where(search ? ilike(subjectsTable.name, `%${search}%`) : undefined)
    .groupBy(subjectsTable.id, subjectsTable.name, subjectsTable.createdAt)
    .orderBy(subjectsTable.createdAt);

  res.json(subjects);
});

router.post("/subjects", async (req, res): Promise<void> => {
  const parsed = CreateSubjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [subject] = await db
    .insert(subjectsTable)
    .values({ name: parsed.data.name })
    .returning();

  res.status(201).json({ ...subject, chapterCount: 0, questionCount: 0 });
});

router.get("/subjects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetSubjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [subject] = await db
    .select({
      id: subjectsTable.id,
      name: subjectsTable.name,
      createdAt: subjectsTable.createdAt,
      chapterCount: sql<number>`cast(count(distinct ${chaptersTable.id}) as int)`,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
    })
    .from(subjectsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.subjectId, subjectsTable.id))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .where(eq(subjectsTable.id, params.data.id))
    .groupBy(subjectsTable.id, subjectsTable.name, subjectsTable.createdAt);

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  res.json(subject);
});

router.put("/subjects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateSubjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSubjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [subject] = await db
    .update(subjectsTable)
    .set({ name: parsed.data.name })
    .where(eq(subjectsTable.id, params.data.id))
    .returning();

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  // Get the updated counts
  const [updated] = await db
    .select({
      id: subjectsTable.id,
      name: subjectsTable.name,
      createdAt: subjectsTable.createdAt,
      chapterCount: sql<number>`cast(count(distinct ${chaptersTable.id}) as int)`,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
    })
    .from(subjectsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.subjectId, subjectsTable.id))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .where(eq(subjectsTable.id, params.data.id))
    .groupBy(subjectsTable.id, subjectsTable.name, subjectsTable.createdAt);

  res.json(updated || { ...subject, chapterCount: 0, questionCount: 0 });
});

router.delete("/subjects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteSubjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [subject] = await db
    .delete(subjectsTable)
    .where(eq(subjectsTable.id, params.data.id))
    .returning();

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
