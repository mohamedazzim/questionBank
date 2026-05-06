/**
 * Bulk Question Ingestion Processor
 * 
 * Orchestrates:
 * - ZIP extraction
 * - LaTeX parsing
 * - Image processing and persistence
 * - Database insertion
 * - Error resilience and reporting
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { db, questionsTable, choicesTable } from '@workspace/db';
import { parseCanonicalLatex } from './latexParser';
import { type CanonicalQuestion, mapToDB } from './canonicalMapper';
import { 
  discoverArchiveContents, 
  resolveImagePath, 
  getMimeType, 
  cleanupExtraction,
  validateArchiveFile,
  FileDiscoveryResult 
} from './zipProcessor';
import { logger } from './logger';

export interface BulkIngestionRequest {
  archiveFilePath: string;
  subjectId?: number;
  chapterId?: number;
  defaultDifficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'UNLABLED';
}

export interface BulkIngestionResult {
  success: boolean;
  summary: {
    total: number;
    parsed: number;
    inserted: number;
    failed: number;
  };
  stats: {
    totalFiles: number;
    texFilesFound: number;
    imagesFound: number;
    questionsExtracted: number;
    questionsInserted: number;
    choicesInserted: number;
    errors: number;
  };
  questionsCreated: Array<{
    id: number;
    text: string;
    chapterId: number;
    type: string;
    imageCount: number;
    choiceCount: number;
  }>;
  warnings: Array<{
    message: string;
    questionIndex?: number;
    detail?: string;
  }>;
  errors: Array<{
    message: string;
    questionIndex?: number;
    detail?: string;
  }>;
}

/**
 * Processes image and returns buffer with metadata
 */
async function processImage(
  imagePath: string | null,
  imageMap: Map<string, string>
): Promise<{ buffer: Buffer; name: string; type: string; size: number } | null> {
  if (!imagePath) return null;

  try {
    const resolvedPath = resolveImagePath(imagePath, imageMap, '');
    if (!resolvedPath) {
      logger.warn({ imagePath }, 'Image not found in extraction');
      return null;
    }

    const buffer = await readFile(resolvedPath);
    const name = path.basename(resolvedPath);
    const type = getMimeType(resolvedPath);

    return { buffer, name, type, size: buffer.length };
  } catch (err) {
    logger.warn({ imagePath, err }, 'Error processing image');
    return null;
  }
}

/**
 * Inserts a question with choices into database
 */
async function insertQuestion(
  question: CanonicalQuestion,
  chapterId: number,
  imageMap: Map<string, string>
): Promise<{ id: number; choiceCount: number } | null> {
  try {
    const questionImageRef = question.images[0] ?? null;
    const questionImagePath = questionImageRef ? resolveImagePath(questionImageRef, imageMap, '') : null;
    const questionImageBuffer = questionImagePath ? await readFile(questionImagePath) : null;
    const questionImageName = questionImagePath ? path.basename(questionImagePath) : null;
    const questionImageType = questionImagePath ? getMimeType(questionImagePath) : null;
    const questionImageSize = questionImageBuffer ? questionImageBuffer.length : null;

    const { questionValues, choiceValues } = mapToDB(question, {
      chapterId,
      defaultDifficulty: 'UNLABLED',
      questionImage: questionImagePath
        ? {
            data: questionImageBuffer,
            name: questionImageName,
            type: questionImageType,
            size: questionImageSize,
          }
        : undefined,
    });

    const [insertedQuestion] = await db
      .insert(questionsTable)
      .values(questionValues)
      .returning({ id: questionsTable.id });

    if (!insertedQuestion) {
      throw new Error('Failed to insert question');
    }

    // Insert choices for MCQ
    let choiceCount = 0;
    if (question.type === 'MCQ' && choiceValues.length > 0) {
      for (const option of choiceValues) {
        try {
          await db.insert(choicesTable).values({
            questionId: insertedQuestion.id,
            text: option.text,
            isCorrect: option.isCorrect ?? false,
            imageData: null,
            imageName: null,
            imageType: null,
            imageSize: null,
          });
          choiceCount++;
        } catch (err) {
          logger.warn({ questionId: insertedQuestion.id, option: option.text, err }, 'Error inserting choice');
        }
      }
    }

    return { id: insertedQuestion.id, choiceCount };
  } catch (err) {
    logger.error({ question: question.questionText, chapterId, err }, 'Error inserting question');
    throw err;
  }
}

/**
 * Main bulk ingestion processor
 */
export async function processBulkIngestion(request: BulkIngestionRequest): Promise<BulkIngestionResult> {
  const result: BulkIngestionResult = {
    success: false,
    summary: {
      total: 0,
      parsed: 0,
      inserted: 0,
      failed: 0,
    },
    stats: {
      totalFiles: 0,
      texFilesFound: 0,
      imagesFound: 0,
      questionsExtracted: 0,
      questionsInserted: 0,
      choicesInserted: 0,
      errors: 0,
    },
    questionsCreated: [],
    warnings: [],
    errors: [],
  };

  let extractDir: string | null = null;
  let discovery: FileDiscoveryResult | null = null;

  try {
    await validateArchiveFile(request.archiveFilePath);

    // Generate temporary extraction directory
    extractDir = path.join(process.cwd(), 'uploads', 'tmp', `bulk-ingestion-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Discover and extract
    discovery = await discoverArchiveContents(request.archiveFilePath, extractDir);

    result.stats.totalFiles = discovery.allFiles.length;
    result.stats.texFilesFound = 1; // We selected one primary file
    result.stats.imagesFound = discovery.imagePaths.size;

    logger.info({ stats: result.stats }, 'Archive discovery complete');

    // Read primary TeX file
    const texContent = await readFile(discovery.primaryTexFile, 'utf-8');

    // Parse LaTeX with partial recovery mode
    let parsedQuestions: CanonicalQuestion[] = [];
    try {
      const parseResult = parseCanonicalLatex(texContent);
      parsedQuestions = parseResult.canonicalQuestions;
      for (const warning of parseResult.parseResult.warnings || []) {
        result.warnings.push({ message: warning });
      }
    } catch (parseErr) {
      logger.warn({ err: parseErr }, 'LaTeX parse failed, using partial recovery mode');
      parsedQuestions = [{
        type: 'FILLUP',
        questionText: texContent.slice(0, 4000).trim(),
        options: [],
        solutionText: undefined,
        images: [],
        metadata: {},
      }];

      result.warnings.push({
        message: 'Parser recovery mode activated; raw LaTeX stored for manual review',
      });
    }

    result.stats.questionsExtracted = parsedQuestions.length;
    result.summary.total = parsedQuestions.length;
    result.summary.parsed = parsedQuestions.length;

    logger.info({ extractedQuestions: result.stats.questionsExtracted }, 'LaTeX parsing complete');

    // Determine chapter ID (use provided or require it)
    let chapterId = request.chapterId;
    if (!chapterId) {
      throw new Error('Chapter ID is required for bulk ingestion');
    }

    // Insert questions
    logger.info(
      {
        chapterId,
        questionCount: parsedQuestions.length,
      },
      'Bulk database insertion started',
    );

    for (let i = 0; i < parsedQuestions.length; i++) {
      try {
        const question = parsedQuestions[i];

        // Validate question
        if (!question.questionText || question.questionText.trim().length === 0) {
          result.errors.push({
            message: 'Skipping question: missing questionText',
            questionIndex: i,
          });
          result.summary.failed++;
          result.stats.errors++;
          continue;
        }

        // Validate MCQ options
        if (question.type === 'MCQ' && question.options.length < 2) {
          result.errors.push({
            message: 'Skipping invalid MCQ: at least 2 options required',
            questionIndex: i,
            detail: question.questionText.substring(0, 100),
          });
          result.summary.failed++;
          result.stats.errors++;
          continue;
        }

        // Insert question
        const inserted = await insertQuestion(question, chapterId, discovery.imagePaths);
        if (!inserted) {
          result.errors.push({
            message: 'Failed to insert question',
            questionIndex: i,
            detail: question.questionText.substring(0, 100),
          });
          result.summary.failed++;
          result.stats.errors++;
          continue;
        }

        result.stats.questionsInserted++;
        result.stats.choicesInserted += inserted.choiceCount;
        result.summary.inserted++;

        result.questionsCreated.push({
          id: inserted.id,
          text: question.questionText.substring(0, 100),
          chapterId,
          type: question.type,
          imageCount: question.images.length,
          choiceCount: inserted.choiceCount,
        });

        logger.debug(
          { questionId: inserted.id, questionIndex: i },
          'Question inserted successfully'
        );
      } catch (err) {
        result.errors.push({
          message: 'Error processing question',
          questionIndex: i,
          detail: String(err),
        });
        result.summary.failed++;
        result.stats.errors++;
        logger.warn({ questionIndex: i, err }, 'Error processing question');
      }
    }

    result.success = result.summary.inserted > 0;

    logger.info({ result: result.stats }, 'Bulk database insertion completed');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    result.errors.push({
      message: errorMessage,
      detail: errorMessage,
    });
    result.stats.errors++;
    logger.error({ err, errorMessage }, 'Critical error during bulk ingestion');
  } finally {
    // Cleanup
    if (extractDir) {
      await cleanupExtraction(extractDir);
    }
  }

  return result;
}
