import { pgTable, serial, text, timestamp, integer, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chaptersTable } from "./chapters";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(val: unknown): Buffer {
    if (Buffer.isBuffer(val)) return val;
    if (typeof val === "string") return Buffer.from(val, "hex");
    return Buffer.alloc(0);
  },
  toDriver(val: Buffer): Buffer {
    return val;
  },
});

export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  chapterId: integer("chapter_id").notNull().references(() => chaptersTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  type: text("type", { enum: ["MCQ", "FILLUP"] }).notNull().default("MCQ"),
  difficulty: text("difficulty", { enum: ["EASY", "MEDIUM", "HARD", "UNLABLED"] }).notNull().default("MEDIUM"),
  verificationStatus: text("verification_status", { enum: ["Verified", "Need to Verified", "Changes Needed"] }).notNull().default("Need to Verified"),
  imageData: bytea("image_data"),
  imageName: text("image_name"),
  imageType: text("image_type"),
  imageSize: integer("image_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true, createdAt: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
