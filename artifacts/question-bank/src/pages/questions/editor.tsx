import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useGetQuestion, 
  useCreateQuestion, 
  useUpdateQuestion, 
  useCreateChoice, 
  useUpdateChoice, 
  useDeleteChoice,
  useListSubjects,
  useListChapters,
  usePreviewQuestion,
  getPreviewQuestionQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ArrowLeft, Save, Eye, Trash2, Plus, Image as ImageIcon, X, Check, ChevronsUpDown } from "lucide-react";
import { LatexRenderer } from "@/components/latex-renderer";

const NEW_QUESTION_SELECTION_STORAGE_KEY = "qb:last-new-question-selection";

type SearchableOption = { id: number; name: string };

type SearchableSelectProps = {
  value: number;
  onChange: (value: number) => void;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
};

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selected ? selected.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.name} ${option.id}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function readSavedNewQuestionSelection(): { subjectId: number; chapterId: number } | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(NEW_QUESTION_SELECTION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { subjectId?: unknown; chapterId?: unknown };
    const subjectId = Number(parsed.subjectId);
    const chapterId = Number(parsed.chapterId);

    if (!Number.isFinite(subjectId) || !Number.isFinite(chapterId)) return null;
    if (subjectId <= 0 || chapterId <= 0) return null;

    return { subjectId, chapterId };
  } catch {
    return null;
  }
}

function saveNewQuestionSelection(subjectId: number, chapterId: number): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    NEW_QUESTION_SELECTION_STORAGE_KEY,
    JSON.stringify({ subjectId, chapterId }),
  );
}

const hasText = (value?: string | null) => Boolean(value?.trim());
const hasImage = (image?: File, preview?: string | null, removeImage?: boolean) =>
  Boolean(image) || (Boolean(preview) && !removeImage);

function splitLeakedQuestionSections(
  text: string,
  answerText?: string | null,
  solutionText?: string | null,
  previousYearDateText?: string | null,
): {
  text: string;
  answerText: string;
  solutionText: string;
  previousYearDateText: string;
} {
  const normalized = (text || "")
    .replace(/\\textbf\s*\{\s*(Sol(?:ution)?\s*:)\s*\}/gi, "$1")
    .replace(/\\textit\s*\{\s*(Sol(?:ution)?\s*:)\s*\}/gi, "$1")
    .replace(/\\emph\s*\{\s*(Sol(?:ution)?\s*:)\s*\}/gi, "$1");
  const firstMetadata = normalized.match(/(?:^|\n)\s*(?:Year|Ans(?:wer)?|Sol(?:ution)?)\s*:/i);

  if (!firstMetadata || firstMetadata.index === undefined) {
    return {
      text,
      answerText: answerText || "",
      solutionText: solutionText || "",
      previousYearDateText: previousYearDateText || "",
    };
  }

  const cleanText = normalized.slice(0, firstMetadata.index).trim();
  const metadataText = normalized.slice(firstMetadata.index);
  const yearMatch = metadataText.match(/(?:^|\n)\s*Year\s*:\s*([^\n]+)/i);
  const answerMatch = metadataText.match(/(?:^|\n)\s*Ans(?:wer)?\s*:\s*([^\n]+)/i);
  const solutionMatch = metadataText.match(/(?:^|\n)\s*Sol(?:ution)?\s*:\s*([\s\S]*)$/i);

  return {
    text: cleanText,
    answerText: answerText || answerMatch?.[1]?.trim() || "",
    solutionText: solutionText || solutionMatch?.[1]?.trim() || "",
    previousYearDateText: previousYearDateText || yearMatch?.[1]?.trim() || "",
  };
}

const choiceSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  isCorrect: z.boolean(),
  image: z.instanceof(File).optional(),
  imageUrl: z.string().optional().nullable(),
  removeImage: z.boolean().optional(),
  _localPreview: z.string().optional()
});

const questionSchema = z.object({
  subjectId: z.coerce.number().min(1, "Subject is required"),
  chapterId: z.coerce.number().min(1, "Chapter is required"),
  text: z.string(),
  type: z.enum(["MCQ", "FILLUP"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "UNLABLED"]),
  activeStatus: z.enum(["Active", "Inactive"]),
  verificationStatus: z.enum(["Verified", "Need to Verified", "Changes Needed"]),
  isPreviousYear: z.boolean().default(false),
  previousYearDateText: z.string().optional(),
  image: z.instanceof(File).optional(),
  removeImage: z.boolean().optional(),
  _localPreview: z.string().optional(),
  answerText: z.string().optional(),
  solutionText: z.string().optional(),
  solutionImage: z.instanceof(File).optional(),
  removeSolutionImage: z.boolean().optional(),
  _solutionLocalPreview: z.string().optional(),
  choices: z.array(choiceSchema).optional(),
}).superRefine((data, ctx) => {
  if (!hasText(data.text)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Question text is required.",
      path: ["text"],
    });
  }

  if (data.type === "MCQ") {
    if (!data.choices || data.choices.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MCQ questions must have at least 2 choices.",
        path: ["choices"],
      });
      return;
    }

    const correctCount = data.choices.filter(c => c.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MCQ questions must have exactly 1 correct answer.",
        path: ["choices"],
      });
    }

    data.choices.forEach((choice, index) => {
      const choiceHasImage = hasImage(
        choice.image,
        choice._localPreview ?? choice.imageUrl,
        choice.removeImage,
      );
      if (!hasText(choice.text) && !choiceHasImage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each choice needs text or an image.",
          path: ["choices", index, "text"],
        });
      }
    });
  }

  if (data.isPreviousYear) {
    if (!hasText(data.previousYearDateText)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date text is required when Previous Year Question is checked.",
        path: ["previousYearDateText"],
      });
    }
  }
});

type QuestionFormValues = z.infer<typeof questionSchema>;

export default function QuestionEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEditing = !!id && id !== "new";
  const questionId = isEditing ? parseInt(id!) : 0;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [previewMode, setPreviewMode] = useState(false);
  const [showPreviewPanel, setShowPreviewPanel] = useState(true);
  const hasAppliedSavedSelection = useRef(false);
  
  const { data: subjects } = useListSubjects();
  const { data: existingQuestion, isLoading: isLoadingQuestion } = useGetQuestion(questionId, {
    query: { enabled: isEditing, queryKey: ["getQuestion", questionId] }
  });

  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();
  const createChoice = useCreateChoice();
  const updateChoice = useUpdateChoice();
  const deleteChoice = useDeleteChoice();

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      subjectId: 0,
      chapterId: 0,
      text: "",
      answerText: "",
      solutionText: "",
      type: "MCQ",
      difficulty: "MEDIUM",
      activeStatus: "Active",
      verificationStatus: "Need to Verified",
      isPreviousYear: false,
      previousYearDateText: "",
      choices: [
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ]
    },
  });

  const { fields: choices, append: appendChoice, remove: removeChoice } = useFieldArray({
    control: form.control,
    name: "choices",
  });

  const watchSubjectId = form.watch("subjectId");
  const watchType = form.watch("type");
  const watchIsPreviousYear = form.watch("isPreviousYear");
  const watchChoices = form.watch("choices");

  const { data: allChaptersForEdit } = useListChapters({}, {
    query: { enabled: isEditing, queryKey: ["listChapters", "all-for-editor"] }
  });

  const { data: chapters } = useListChapters({
    subjectId: watchSubjectId ? Number(watchSubjectId) : undefined
  }, {
    query: { enabled: !!watchSubjectId, queryKey: ["listChapters", watchSubjectId] }
  });

  useEffect(() => {
    if (isEditing || hasAppliedSavedSelection.current) return;
    if (!subjects || subjects.length === 0) return;

    const saved = readSavedNewQuestionSelection();
    if (!saved) {
      hasAppliedSavedSelection.current = true;
      return;
    }

    const subjectExists = subjects.some((s) => s.id === saved.subjectId);
    if (subjectExists) {
      form.setValue("subjectId", saved.subjectId, { shouldDirty: false, shouldTouch: false });
      form.setValue("chapterId", saved.chapterId, { shouldDirty: false, shouldTouch: false });
    }

    hasAppliedSavedSelection.current = true;
  }, [isEditing, subjects, form]);

  useEffect(() => {
    if (isEditing) return;
    if (!watchSubjectId || !chapters) return;

    const currentChapterId = form.getValues("chapterId");
    if (currentChapterId && !chapters.some((c) => c.id === currentChapterId)) {
      form.setValue("chapterId", 0, { shouldDirty: true, shouldTouch: true });
    }
  }, [isEditing, watchSubjectId, chapters, form]);

  // Populate form when editing
  useEffect(() => {
    if (isEditing && existingQuestion) {
      const derivedSubjectId =
        existingQuestion.subjectId ??
        allChaptersForEdit?.find((c) => c.id === existingQuestion.chapterId)?.subjectId ??
        0;
      const normalizedSections = splitLeakedQuestionSections(
        existingQuestion.text,
        (existingQuestion as any).answerText,
        (existingQuestion as any).solutionText,
        (existingQuestion as any).previousYearDateText ||
          [
            (existingQuestion as any).previousYearMonth,
            (existingQuestion as any).previousYearYear,
          ].filter(Boolean).join(" "),
      );

      form.reset({
        subjectId: derivedSubjectId,
        chapterId: existingQuestion.chapterId,
        text: normalizedSections.text,
        type: existingQuestion.type,
        difficulty: existingQuestion.difficulty,
        activeStatus: (existingQuestion as any).activeStatus || "Active",
        verificationStatus: (existingQuestion as any).verificationStatus || "Need to Verified",
        isPreviousYear: Boolean((existingQuestion as any).isPreviousYear),
        previousYearDateText: normalizedSections.previousYearDateText,
        _localPreview: existingQuestion.imageUrl || undefined,
        answerText: normalizedSections.answerText,
        solutionText: normalizedSections.solutionText,
        _solutionLocalPreview: (existingQuestion as any).solutionImageUrl || undefined,
        choices: (existingQuestion as any).choices?.map((c: any) => ({
          id: c.id,
          text: c.text,
          isCorrect: c.isCorrect,
          imageUrl: c.imageUrl,
          _localPreview: c.imageUrl
        })) || []
      });
    }
  }, [isEditing, existingQuestion, allChaptersForEdit, form]);

  const subjectOptions = (() => {
    const base = subjects ? [...subjects] : [];

    if (
      isEditing &&
      existingQuestion?.subjectId &&
      !base.some((s) => s.id === existingQuestion.subjectId)
    ) {
      base.unshift({
        id: existingQuestion.subjectId,
        name: existingQuestion.subjectName || `Subject #${existingQuestion.subjectId}`,
      } as any);
    }

    return base;
  })();

  const chapterOptions = chapters && chapters.length > 0
    ? chapters
    : (isEditing && existingQuestion
      ? allChaptersForEdit?.filter((c) => c.id === existingQuestion.chapterId) || []
      : []);

  const chapterOptionsWithFallback = (() => {
    const base = chapterOptions ? [...chapterOptions] : [];

    if (
      isEditing &&
      existingQuestion?.chapterId &&
      !base.some((c) => c.id === existingQuestion.chapterId)
    ) {
      base.unshift({
        id: existingQuestion.chapterId,
        name: existingQuestion.chapterName || `Chapter #${existingQuestion.chapterId}`,
      } as any);
    }

    return base;
  })();

  const onSubmit = async (data: QuestionFormValues) => {
    try {
      if (isEditing) {
        // Update question
        const normalizedQuestionText = data.text.trim();
        const qData: any = {
          chapterId: data.chapterId,
          text: normalizedQuestionText,
          answerText: data.type === "FILLUP" ? (data.answerText || "").trim() : "",
          solutionText: (data.solutionText || "").trim(),
          type: data.type,
          difficulty: data.difficulty,
          activeStatus: data.activeStatus,
          verificationStatus: data.verificationStatus,
          isPreviousYear: data.isPreviousYear,
          previousYearDateText: data.isPreviousYear ? (data.previousYearDateText || "").trim() : undefined,
        };
        if (data.image) qData.image = data.image;
        if (data.removeImage) qData.removeImage = "true";
        if (data.solutionImage) qData.solutionImage = data.solutionImage;
        if (data.removeSolutionImage) qData.removeSolutionImage = "true";
        
        await updateQuestion.mutateAsync({ id: questionId, data: qData });

        // Manage choices if MCQ
        if (data.type === "MCQ" && data.choices) {
          const existingChoices = (existingQuestion as any).choices || [];
          
          // Delete removed choices
          const currentIds = data.choices.map(c => c.id).filter(Boolean);
          const toDelete = existingChoices.filter((c: any) => !currentIds.includes(c.id));
          for (const c of toDelete) {
            await deleteChoice.mutateAsync({ id: c.id });
          }

          // Update or create choices
          for (const c of data.choices) {
            if (c.id) {
              const cData: any = {
                text: c.text.trim(),
                isCorrect: c.isCorrect,
              };
              if (c.image) cData.image = c.image;
              if (c.removeImage) cData.removeImage = "true";
              await updateChoice.mutateAsync({ id: c.id, data: cData });
            } else {
              const cData: any = {
                questionId,
                text: c.text.trim(),
                isCorrect: c.isCorrect,
              };
              if (c.image) cData.image = c.image;
              await createChoice.mutateAsync({ data: cData });
            }
          }
        } else {
          const existingChoices = (existingQuestion as any).choices || [];
          for (const c of existingChoices) {
            await deleteChoice.mutateAsync({ id: c.id });
          }
        }
        
        toast({ title: "Question updated successfully" });
        setLocation("/questions");
      } else {
        // Create new question
        const normalizedQuestionText = data.text.trim();
        const qData: any = {
          chapterId: data.chapterId,
          text: normalizedQuestionText,
          answerText: data.type === "FILLUP" ? (data.answerText || "").trim() : "",
          solutionText: (data.solutionText || "").trim(),
          type: data.type,
          difficulty: data.difficulty,
          activeStatus: data.activeStatus,
          verificationStatus: data.verificationStatus,
          isPreviousYear: data.isPreviousYear,
          previousYearDateText: data.isPreviousYear ? (data.previousYearDateText || "").trim() : undefined,
        };
        if (data.image) qData.image = data.image;
        if (data.solutionImage) qData.solutionImage = data.solutionImage;

        const newQuestion = await createQuestion.mutateAsync({ data: qData });
        
        if (data.type === "MCQ" && data.choices) {
          for (const c of data.choices) {
            const cData: any = {
              questionId: newQuestion.id,
              text: c.text.trim(),
              isCorrect: c.isCorrect,
            };
            if (c.image) cData.image = c.image;
            await createChoice.mutateAsync({ data: cData });
          }
        }

        saveNewQuestionSelection(data.subjectId, data.chapterId);
        
        toast({ title: "Question created successfully" });
        setLocation("/questions");
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Error saving question", variant: "destructive" });
    }
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldName: any,
    rootPreviewField = "_localPreview",
    rootRemoveField = "removeImage",
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      form.setValue(fieldName, file);
      const parts: string[] = fieldName.split(".");
      const prefix = parts.slice(0, -1).join(".");
      if (prefix) {
        form.setValue(`${prefix}._localPreview` as any, URL.createObjectURL(file) as any);
        form.setValue(`${prefix}.removeImage` as any, false as any);
      } else {
        form.setValue(rootPreviewField as any, URL.createObjectURL(file) as any);
        form.setValue(rootRemoveField as any, false as any);
      }
    }
  };

  const handleRemoveImage = (
    fieldNamePrefix: string,
    rootImageField = "image",
    rootPreviewField = "_localPreview",
    rootRemoveField = "removeImage",
  ) => {
    if (fieldNamePrefix) {
      form.setValue(`${fieldNamePrefix}.image` as any, undefined);
      form.setValue(`${fieldNamePrefix}._localPreview` as any, undefined);
      form.setValue(`${fieldNamePrefix}.removeImage` as any, true);
    } else {
      form.setValue(rootImageField as any, undefined);
      form.setValue(rootPreviewField as any, undefined);
      form.setValue(rootRemoveField as any, true);
    }
  };

  const setCorrectChoice = (index: number) => {
    const currentChoices = form.getValues("choices") || [];
    currentChoices.forEach((_, i) => {
      form.setValue(`choices.${i}.isCorrect`, i === index);
    });
  };

  const { data: previewData, isLoading: isPreviewLoading, refetch: refetchPreview } = usePreviewQuestion(questionId, {
    query: { enabled: isEditing && previewMode, queryKey: getPreviewQuestionQueryKey(questionId) }
  });

  const handlePreviewClick = () => {
    if (isEditing) {
      setPreviewMode(true);
      refetchPreview();
    } else {
      // For new questions, we just use the form values for local preview
      setPreviewMode(true);
    }
  };

  if (isEditing && isLoadingQuestion) {
    return <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>;
  }

  const renderPreview = () => {
    if (!previewMode) {
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center border-l bg-muted/10">
          <div className="max-w-sm space-y-2">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">Preview Render</h3>
            <p className="text-sm">Click "Update Preview" to render LaTeX math and see how this question will appear on exports.</p>
          </div>
        </div>
      );
    }

    if (isEditing && isPreviewLoading) {
      return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
    }

    // Local preview for unsaved or current form state
    const currentValues = form.getValues();

    return (
      <div className="h-full overflow-y-auto bg-card px-6 py-4 border-l">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPreviewMode(false)}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="prose dark:prose-invert max-w-none">
              <LatexRenderer content={currentValues.text || 'No question text provided.'} />
            </div>
            
            {currentValues._localPreview && (
              <img src={currentValues._localPreview} alt="Question" className="max-w-sm rounded-md border" />
            )}

            {currentValues.type === "MCQ" && currentValues.choices && (
              <div className="space-y-3 pt-4">
                {currentValues.choices.map((choice, i) => (
                  <div key={i} className={`flex gap-3 p-3 rounded-md border ${choice.isCorrect ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
                    <div className="shrink-0 mt-0.5">
                      <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${choice.isCorrect ? 'border-primary' : 'border-input'}`}>
                        {choice.isCorrect && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <LatexRenderer content={choice.text || `Choice ${i + 1}`} />
                      {choice._localPreview && (
                        <img src={choice._localPreview} alt={`Choice ${i + 1}`} className="max-h-24 rounded border object-contain" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {currentValues.type === "MCQ" && currentValues.choices?.some((choice) => choice.isCorrect) && (
              <div className="space-y-2 pt-4 border-t">
                <h3 className="text-base font-semibold">Correct Answer</h3>
                <LatexRenderer content={currentValues.choices.find((choice) => choice.isCorrect)?.text || ""} />
              </div>
            )}

            {currentValues.type === "FILLUP" && currentValues.answerText?.trim() && (
              <div className="space-y-2 pt-4 border-t">
                <h3 className="text-base font-semibold">Answer</h3>
                <LatexRenderer content={currentValues.answerText} />
              </div>
            )}

            {(currentValues.solutionText?.trim() || currentValues._solutionLocalPreview) && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-base font-semibold">Solution</h3>
                <div className="prose dark:prose-invert max-w-none">
                  <LatexRenderer content={currentValues.solutionText || "No solution text provided."} />
                </div>
                {currentValues._solutionLocalPreview && (
                  <img src={currentValues._solutionLocalPreview} alt="Solution" className="max-w-sm rounded-md border" />
                )}
              </div>
            )}

            {currentValues.type === "FILLUP" && !currentValues.answerText?.trim() && (
              <div className="mt-8 border-b-2 border-dashed border-muted-foreground w-64" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col -m-6 md:-m-8">
      <div className="flex items-center justify-between p-4 border-b bg-card shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/questions")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-serif font-bold text-foreground">
              {isEditing ? "Edit Question" : "New Question"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handlePreviewClick}>
            <Eye className="h-4 w-4 mr-2" />
            Update Preview
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={createQuestion.isPending || updateQuestion.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Question
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full overflow-y-auto p-6 bg-muted/10">
              <Form {...form}>
                <form className="space-y-8 max-w-3xl mx-auto">
                  <Card>
                    <CardContent className="pt-6 space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="subjectId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Subject</FormLabel>
                              <FormControl>
                                <SearchableSelect
                                  value={field.value || 0}
                                  onChange={(v) => {
                                    field.onChange(v);
                                    const currentChapterId = form.getValues("chapterId");
                                    if (currentChapterId && !chapters?.some((c) => c.id === currentChapterId)) {
                                      form.setValue("chapterId", 0, { shouldDirty: true, shouldTouch: true });
                                    }
                                  }}
                                  options={subjectOptions}
                                  placeholder="Select subject"
                                  searchPlaceholder="Type subject name..."
                                  emptyText="No subject found."
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="chapterId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chapter</FormLabel>
                              <FormControl>
                                <SearchableSelect
                                  value={field.value || 0}
                                  onChange={field.onChange}
                                  options={chapterOptionsWithFallback}
                                  placeholder="Select chapter"
                                  searchPlaceholder="Type chapter name..."
                                  emptyText="No chapter found."
                                  disabled={!watchSubjectId || chapterOptionsWithFallback.length === 0}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Question Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="MCQ">Multiple Choice</SelectItem>
                                  <SelectItem value="FILLUP">Fill in the Blanks</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="difficulty"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Difficulty</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="EASY">Easy</SelectItem>
                                  <SelectItem value="MEDIUM">Medium</SelectItem>
                                  <SelectItem value="HARD">Hard</SelectItem>
                                  <SelectItem value="UNLABLED">Unlabled</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="activeStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Active">Active</SelectItem>
                                  <SelectItem value="Inactive">Inactive</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="verificationStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Verification Tag</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Verified">Verified</SelectItem>
                                  <SelectItem value="Need to Verified">Need to Verified</SelectItem>
                                  <SelectItem value="Changes Needed">Changes Needed</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="isPreviousYear"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-3 rounded-md border p-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={(checked) => {
                                    const nextValue = Boolean(checked);
                                    field.onChange(nextValue);
                                    if (!nextValue) {
                                      form.setValue("previousYearDateText", "", { shouldDirty: true, shouldTouch: true });
                                    }
                                  }}
                                />
                              </FormControl>
                              <div>
                                <FormLabel>Is Previous Year Question</FormLabel>
                                <FormDescription className="mt-1">Enable to enter exam date info as free text.</FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />

                        {watchIsPreviousYear && (
                          <div className="grid grid-cols-1 gap-4">
                            <FormField
                              control={form.control}
                              name="previousYearDateText"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Previous Year Date (Free Text)</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., March 2024 or 12-03-2024"
                                      {...field}
                                      value={field.value || ""}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Enter any format you prefer. This value is stored exactly as typed.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                      </div>

                      <Separator />

                      <FormField
                        control={form.control}
                        name="text"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Question Text</FormLabel>
                            <FormDescription>
                              Use $...$ for inline math and $$...$$ for block math. Text is optional if you upload a question image.
                            </FormDescription>
                            <FormControl>
                              <Textarea 
                                placeholder="e.g., What is the derivative of $x^2$?" 
                                className="min-h-[150px] font-mono text-sm"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-2">
                        <Label>Question Image (Optional)</Label>
                        <div className="flex items-start gap-4">
                          {form.watch("_localPreview") ? (
                            <div className="relative inline-block border rounded-md p-1">
                              <img 
                                src={form.watch("_localPreview")} 
                                alt="Preview" 
                                className="h-32 object-contain rounded"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                onClick={() => handleRemoveImage("")}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg"
                                className="w-auto"
                                onChange={(e) => handleImageChange(e, "image")}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {watchType === "MCQ" && (
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Answer Choices</Label>
                        </div>
                        
                        {form.formState.errors.choices?.root && (
                          <p className="text-sm font-medium text-destructive">
                            {form.formState.errors.choices.root.message}
                          </p>
                        )}

                        <div className="space-y-4">
                          {choices.map((field, index) => (
                            <div key={field.id} className="flex gap-4 items-start p-4 border rounded-lg bg-card relative group">
                              <div className="pt-2">
                                <Checkbox 
                                  checked={form.watch(`choices.${index}.isCorrect`)}
                                  onCheckedChange={() => setCorrectChoice(index)}
                                />
                              </div>
                              <div className="flex-1 space-y-3">
                                <FormField
                                  control={form.control}
                                  name={`choices.${index}.text`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input placeholder={`Choice ${index + 1} text (optional if image is uploaded)...`} {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                {form.watch(`choices.${index}._localPreview`) ? (
                                  <div className="relative inline-block border rounded-md p-1">
                                    <img 
                                      src={form.watch(`choices.${index}._localPreview`)} 
                                      alt="Preview" 
                                      className="h-16 object-contain rounded"
                                    />
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                                      onClick={() => handleRemoveImage(`choices.${index}`)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs font-normal text-muted-foreground cursor-pointer flex items-center gap-1">
                                      <ImageIcon className="h-3 w-3" /> Add Image
                                      <Input
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg"
                                        className="hidden"
                                        onChange={(e) => handleImageChange(e, `choices.${index}.image`)}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => removeChoice(index)}
                                disabled={choices.length <= 2}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendChoice({ text: "", isCorrect: false })}
                            disabled={choices.length >= 6}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add Choice
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent className="pt-6 space-y-6">
                      {watchType === "FILLUP" && (
                        <FormField
                          control={form.control}
                          name="answerText"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Answer (Optional)</FormLabel>
                              <FormDescription>
                                Store the final answer separately from the solution. LaTeX math is supported.
                              </FormDescription>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g., $v = 0.35\\,\\mathrm{m\\,s^{-1}}$"
                                  className="min-h-[90px] font-mono text-sm"
                                  {...field}
                                  value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="solutionText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Solution (Optional)</FormLabel>
                            <FormDescription>
                              Use $...$ for inline math and $$...$$ for block math. Add explanation steps or final answer here.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                placeholder="e.g., Differentiate using power rule: $$\\frac{d}{dx}x^2 = 2x$$"
                                className="min-h-[140px] font-mono text-sm"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-2">
                        <Label>Solution Image (Optional)</Label>
                        <div className="flex items-start gap-4">
                          {form.watch("_solutionLocalPreview") ? (
                            <div className="relative inline-block border rounded-md p-1">
                              <img
                                src={form.watch("_solutionLocalPreview")}
                                alt="Solution preview"
                                className="h-32 object-contain rounded"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                onClick={() => handleRemoveImage("", "solutionImage", "_solutionLocalPreview", "removeSolutionImage")}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg"
                                className="w-auto"
                                onChange={(e) => handleImageChange(e, "solutionImage", "_solutionLocalPreview", "removeSolutionImage")}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              </Form>
            </div>
          </Panel>
          
          {showPreviewPanel && (
            <>
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
              <Panel defaultSize={50} minSize={30}>
                {renderPreview()}
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
