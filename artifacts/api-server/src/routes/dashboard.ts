import { Router, type IRouter } from "express";
import { eq, sql, count, desc } from "drizzle-orm";
import { db, subjectsTable, chaptersTable, questionsTable, choicesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const [stats] = await db
    .select({
      totalSubjects: sql<number>`cast(count(distinct ${subjectsTable.id}) as int)`,
      totalChapters: sql<number>`cast(count(distinct ${chaptersTable.id}) as int)`,
      totalQuestions: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
      totalMCQ: sql<number>`cast(count(distinct case when ${questionsTable.type} = 'MCQ' then ${questionsTable.id} end) as int)`,
      totalFillup: sql<number>`cast(count(distinct case when ${questionsTable.type} = 'FILLUP' then ${questionsTable.id} end) as int)`,
      easyCount: sql<number>`cast(count(distinct case when ${questionsTable.difficulty} = 'EASY' then ${questionsTable.id} end) as int)`,
      mediumCount: sql<number>`cast(count(distinct case when ${questionsTable.difficulty} = 'MEDIUM' then ${questionsTable.id} end) as int)`,
      hardCount: sql<number>`cast(count(distinct case when ${questionsTable.difficulty} = 'HARD' then ${questionsTable.id} end) as int)`,
    })
    .from(subjectsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.subjectId, subjectsTable.id))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id));

  res.json(stats ?? {
    totalSubjects: 0, totalChapters: 0, totalQuestions: 0,
    totalMCQ: 0, totalFillup: 0, easyCount: 0, mediumCount: 0, hardCount: 0,
  });
});

router.get("/dashboard/subject-breakdown", async (_req, res): Promise<void> => {
  const breakdown = await db
    .select({
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
      questionCount: sql<number>`cast(count(distinct ${questionsTable.id}) as int)`,
      chapterCount: sql<number>`cast(count(distinct ${chaptersTable.id}) as int)`,
    })
    .from(subjectsTable)
    .leftJoin(chaptersTable, eq(chaptersTable.subjectId, subjectsTable.id))
    .leftJoin(questionsTable, eq(questionsTable.chapterId, chaptersTable.id))
    .groupBy(subjectsTable.id, subjectsTable.name)
    .orderBy(desc(sql`count(distinct ${questionsTable.id})`));

  res.json(breakdown);
});

router.get("/dashboard/difficulty-breakdown", async (_req, res): Promise<void> => {
  const breakdown = await db
    .select({
      difficulty: questionsTable.difficulty,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(questionsTable)
    .groupBy(questionsTable.difficulty)
    .orderBy(questionsTable.difficulty);

  res.json(breakdown);
});

router.get("/dashboard/recent-questions", async (_req, res): Promise<void> => {
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
    .groupBy(
      questionsTable.id, questionsTable.chapterId, questionsTable.text,
      questionsTable.type, questionsTable.difficulty, questionsTable.imageName,
      questionsTable.imageType, questionsTable.createdAt,
      chaptersTable.name, chaptersTable.subjectId, subjectsTable.name
    )
    .orderBy(desc(questionsTable.createdAt))
    .limit(10);

  res.json(questions);
});

export default router;
