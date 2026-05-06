import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function ensureQuestionSchema(): Promise<void> {
  await pool.query("alter table questions add column if not exists answer_text text");
  logger.info("Question schema guard complete");
}
