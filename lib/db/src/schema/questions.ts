import { pgTable, serial, text, timestamp, integer, boolean, customType } from "drizzle-orm/pg-core";
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
  activeStatus: text("active_status", { enum: ["Active", "Inactive"] }).notNull().default("Active"),
  verificationStatus: text("verification_status", { enum: ["Verified", "Need to Verified", "Changes Needed"] }).notNull().default("Need to Verified"),
  isPreviousYear: boolean("is_previous_year").notNull().default(false),
  previousYearDateText: text("previous_year_date_text"),
  previousYearYear: integer("previous_year_year"),
  previousYearMonth: text("previous_year_month", {
    enum: [
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
    ],
  }),
  imageData: bytea("image_data"),
  imageName: text("image_name"),
  imageType: text("image_type"),
  imageSize: integer("image_size"),
  solutionText: text("solution_text"),
  solutionImageData: bytea("solution_image_data"),
  solutionImageName: text("solution_image_name"),
  solutionImageType: text("solution_image_type"),
  solutionImageSize: integer("solution_image_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true, createdAt: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
