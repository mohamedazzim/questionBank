import type { InsertChoice, InsertQuestion } from "@workspace/db";
import type { ParsedQuestion } from "./latexParser";

export interface CanonicalQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface CanonicalQuestionMetadata {
  year?: number;
  month?: InsertQuestion["previousYearMonth"];
  exam?: string;
}

export interface CanonicalQuestion {
  type: "MCQ" | "FILLUP";
  questionText: string;
  options: CanonicalQuestionOption[];
  answerText?: string;
  solutionText?: string;
  images: string[];
  metadata: CanonicalQuestionMetadata;
}

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

export interface CanonicalDbMappingContext {
  chapterId: number;
  defaultDifficulty?: InsertQuestion["difficulty"];
  questionImage?: {
    data: Buffer | null;
    name: string | null;
    type: string | null;
    size: number | null;
  };
}

export interface CanonicalPreviewQuestion extends Omit<CanonicalQuestion, "type"> {
  id: number;
  chapterId: number;
  chapterName: string | null;
  subjectId: number | null;
  subjectName: string | null;
  text: string;
  type: "MCQ" | "FILLUP";
  difficulty: string;
  activeStatus: string;
  verificationStatus: string;
  isPreviousYear: boolean;
  previousYearDateText: string | null;
  previousYearYear: number | null;
  previousYearMonth: string | null;
  imageData: string | null;
  imageType: string | null;
  solutionImageData: string | null;
  solutionImageType: string | null;
  choices: Array<{
    id: number;
    text: string;
    isCorrect: boolean;
    imageData: string | null;
    imageType: string | null;
  }>;
}

function normalizeYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeMonth(value: string | null | undefined): CanonicalQuestionMetadata["month"] {
  if (!value) return undefined;
  return VALID_PREVIOUS_YEAR_MONTHS.includes(value as (typeof VALID_PREVIOUS_YEAR_MONTHS)[number])
    ? value as (typeof VALID_PREVIOUS_YEAR_MONTHS)[number]
    : undefined;
}

export function mapParsedQuestionToCanonical(parsed: ParsedQuestion): CanonicalQuestion {
  const type = parsed.type === "MCQ" && parsed.options.length > 0 ? "MCQ" : "FILLUP";

  return {
    type,
    questionText: parsed.text,
    options: parsed.options.map((option) => ({
      text: option.text,
      isCorrect: Boolean(option.isCorrect),
    })),
    answerText: parsed.answer || parsed.metadata?.answer || undefined,
    solutionText: parsed.solution || undefined,
    images: parsed.images.map((image) => image.originalPath),
    metadata: {
      year: normalizeYear(parsed.metadata?.year),
      month: normalizeMonth(parsed.metadata?.month),
      exam: parsed.metadata?.exam || parsed.metadata?.yearRaw,
    },
  };
}

export function mapToDB(
  canonicalQuestion: CanonicalQuestion,
  context: CanonicalDbMappingContext,
): {
  questionValues: InsertQuestion;
  choiceValues: Array<Omit<InsertChoice, "questionId">>;
} {
  const hasMetadata = Boolean(
    canonicalQuestion.metadata.year ||
      canonicalQuestion.metadata.month ||
      canonicalQuestion.metadata.exam,
  );

  return {
    questionValues: {
      chapterId: context.chapterId,
      text: canonicalQuestion.questionText,
      type: canonicalQuestion.type === "MCQ" ? "MCQ" : "FILLUP",
      difficulty: context.defaultDifficulty ?? "UNLABLED",
      activeStatus: "Active",
      verificationStatus: "Need to Verified",
      isPreviousYear: hasMetadata,
      previousYearDateText: canonicalQuestion.metadata.exam ?? null,
      previousYearYear: canonicalQuestion.metadata.year ?? null,
      previousYearMonth: canonicalQuestion.metadata.month ?? null,
      answerText: canonicalQuestion.answerText ?? null,
      imageData: context.questionImage?.data ?? null,
      imageName: context.questionImage?.name ?? null,
      imageType: context.questionImage?.type ?? null,
      imageSize: context.questionImage?.size ?? null,
      solutionText: canonicalQuestion.solutionText ?? null,
      solutionImageData: null,
      solutionImageName: null,
      solutionImageType: null,
      solutionImageSize: null,
    },
    choiceValues: canonicalQuestion.options.map((option) => ({
      text: option.text,
      isCorrect: option.isCorrect,
      imageData: null,
      imageName: null,
      imageType: null,
      imageSize: null,
    })),
  };
}

export function mapFromDB(
  question: {
    id: number;
    text: string;
    type: string;
    isPreviousYear?: boolean | null;
    previousYearDateText?: string | null;
    previousYearYear?: number | null;
    previousYearMonth?: string | null;
    answerText?: string | null;
    solutionText?: string | null;
    imageName?: string | null;
  },
  choices: Array<{
    text: string;
    isCorrect: boolean;
  }>,
): CanonicalQuestion {
  return {
    type: question.type === "MCQ" ? "MCQ" : "FILLUP",
    questionText: question.text,
    options: choices.map((choice) => ({
      text: choice.text,
      isCorrect: Boolean(choice.isCorrect),
    })),
    answerText: question.answerText ?? undefined,
    solutionText: question.solutionText ?? undefined,
    images: question.imageName ? [`/api/questions/${question.id}/image`] : [],
    metadata: {
      year: question.previousYearYear ?? undefined,
      month: normalizeMonth(question.previousYearMonth),
      exam: question.previousYearDateText ?? undefined,
    },
  };
}

export function canonicalToPreviewQuestion(
  question: {
    id: number;
    chapterId: number;
    chapterName: string | null;
    subjectId: number | null;
    subjectName: string | null;
    difficulty: string;
    activeStatus: string;
    verificationStatus: string;
    isPreviousYear: boolean;
    previousYearDateText: string | null;
    previousYearYear: number | null;
    previousYearMonth: string | null;
    imageData: Buffer | null;
    imageType: string | null;
    solutionImageData: Buffer | null;
    solutionImageType: string | null;
    answerText?: string | null;
  },
  choices: Array<{
    id: number;
    text: string;
    isCorrect: boolean;
    imageData: Buffer | null;
    imageType: string | null;
  }>,
): CanonicalPreviewQuestion {
  const canonical = mapFromDB(
    {
      id: question.id,
      text: question.previousYearDateText ? question.previousYearDateText : question.chapterName || question.subjectName || "",
      type: question.activeStatus ? "MCQ" : "SUBJECTIVE",
      isPreviousYear: question.isPreviousYear,
      previousYearDateText: question.previousYearDateText,
      previousYearYear: question.previousYearYear,
      previousYearMonth: question.previousYearMonth,
      answerText: question.answerText ?? null,
      solutionText: null,
      imageName: question.imageData ? "image" : null,
    },
    choices.map((choice) => ({
      text: choice.text,
      isCorrect: choice.isCorrect,
    })),
  );

  return {
    id: question.id,
    chapterId: question.chapterId,
    chapterName: question.chapterName,
    subjectId: question.subjectId,
    subjectName: question.subjectName,
    text: canonical.questionText,
    type: canonical.type === "MCQ" ? "MCQ" : "FILLUP",
    difficulty: question.difficulty,
    activeStatus: question.activeStatus,
    verificationStatus: question.verificationStatus,
    isPreviousYear: question.isPreviousYear,
    previousYearDateText: question.previousYearDateText,
    previousYearYear: question.previousYearYear,
    previousYearMonth: question.previousYearMonth,
    questionText: canonical.questionText,
    options: canonical.options,
    answerText: canonical.answerText,
    solutionText: canonical.solutionText,
    images: canonical.images,
    metadata: canonical.metadata,
    imageData: question.imageData ? question.imageData.toString("base64") : null,
    imageType: question.imageType,
    solutionImageData: question.solutionImageData ? question.solutionImageData.toString("base64") : null,
    solutionImageType: question.solutionImageType,
    choices: choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      isCorrect: choice.isCorrect,
      imageData: choice.imageData ? choice.imageData.toString("base64") : null,
      imageType: choice.imageType,
    })),
  };
}
