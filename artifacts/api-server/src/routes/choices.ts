import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, choicesTable, questionsTable } from "@workspace/db";
import {
  UpdateChoiceParams,
  DeleteChoiceParams,
  GetChoiceImageParams,
} from "@workspace/api-zod";
import { upload } from "../lib/multer";

const router: IRouter = Router();
const normalizeText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

router.post("/choices", upload.single("image"), async (req, res): Promise<void> => {
  const body = req.body;
  const imageFile = req.file;
  const questionId = parseInt(body.questionId, 10);
  const normalizedText = normalizeText(body.text);

  if (isNaN(questionId)) {
    res.status(400).json({ error: "Missing required field: questionId" });
    return;
  }

  if (!normalizedText && !imageFile) {
    res.status(400).json({ error: "Choice must include text or an image" });
    return;
  }

  // Verify question exists
  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionId));
  if (!question) {
    res.status(400).json({ error: "Question not found" });
    return;
  }

  const isCorrect = body.isCorrect === "true" || body.isCorrect === true;

  const [choice] = await db
    .insert(choicesTable)
    .values({
      questionId,
      text: normalizedText,
      isCorrect,
      imageData: imageFile ? imageFile.buffer : null,
      imageName: imageFile ? imageFile.originalname : null,
      imageType: imageFile ? imageFile.mimetype : null,
      imageSize: imageFile ? imageFile.size : null,
    })
    .returning();

  res.status(201).json({
    ...choice,
    imageData: undefined,
    imageUrl: imageFile ? `/api/choices/${choice.id}/image` : null,
    imageName: choice.imageName,
  });
});

router.put("/choices/:id", upload.single("image"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateChoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = req.body;
  const imageFile = req.file;
  const removeImage = body.removeImage === "true";

  const [existingChoice] = await db
    .select({
      id: choicesTable.id,
      text: choicesTable.text,
      imageName: choicesTable.imageName,
    })
    .from(choicesTable)
    .where(eq(choicesTable.id, params.data.id));

  if (!existingChoice) {
    res.status(404).json({ error: "Choice not found" });
    return;
  }

  const nextText = body.text != null ? normalizeText(body.text) : normalizeText(existingChoice.text);
  const nextHasImage = imageFile ? true : removeImage ? false : Boolean(existingChoice.imageName);
  if (!nextText && !nextHasImage) {
    res.status(400).json({ error: "Choice must include text or an image" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.text != null) updateData.text = normalizeText(body.text);
  if (body.isCorrect !== undefined) {
    updateData.isCorrect = body.isCorrect === "true" || body.isCorrect === true;
  }

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

  const [choice] = await db
    .update(choicesTable)
    .set(updateData)
    .where(eq(choicesTable.id, params.data.id))
    .returning();

  if (!choice) {
    res.status(404).json({ error: "Choice not found" });
    return;
  }

  res.json({
    ...choice,
    imageData: undefined,
    imageUrl: choice.imageName ? `/api/choices/${choice.id}/image` : null,
    imageName: choice.imageName,
  });
});

router.delete("/choices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteChoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [choice] = await db
    .delete(choicesTable)
    .where(eq(choicesTable.id, params.data.id))
    .returning();

  if (!choice) {
    res.status(404).json({ error: "Choice not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/choices/:id/image", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetChoiceImageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [choice] = await db
    .select({ imageData: choicesTable.imageData, imageType: choicesTable.imageType })
    .from(choicesTable)
    .where(eq(choicesTable.id, params.data.id));

  if (!choice || !choice.imageData || !choice.imageType) {
    res.status(404).json({ error: "No image" });
    return;
  }

  res.setHeader("Content-Type", choice.imageType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(choice.imageData);
});

export default router;
