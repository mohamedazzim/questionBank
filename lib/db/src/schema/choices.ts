import { pgTable, serial, text, timestamp, integer, boolean, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { questionsTable } from "./questions";

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

export const choicesTable = pgTable("choices", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  imageData: bytea("image_data"),
  imageName: text("image_name"),
  imageType: text("image_type"),
  imageSize: integer("image_size"),
  isCorrect: boolean("is_correct").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChoiceSchema = createInsertSchema(choicesTable).omit({ id: true, createdAt: true });
export type InsertChoice = z.infer<typeof insertChoiceSchema>;
export type Choice = typeof choicesTable.$inferSelect;
