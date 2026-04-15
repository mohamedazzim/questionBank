import { useState, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Eye, Trash2, Plus, Image as ImageIcon, X } from "lucide-react";
import { LatexRenderer } from "@/components/latex-renderer";

const choiceSchema = z.object({
  id: z.number().optional(),
  text: z.string().min(1, "Choice text is required"),
  isCorrect: z.boolean(),
  image: z.instanceof(File).optional(),
  imageUrl: z.string().optional().nullable(),
  removeImage: z.boolean().optional(),
  _localPreview: z.string().optional()
});

const questionSchema = z.object({
  subjectId: z.coerce.number().min(1, "Subject is required"),
  chapterId: z.coerce.number().min(1, "Chapter is required"),
  text: z.string().min(1, "Question text is required"),
  type: z.enum(["MCQ", "FILLUP"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  image: z.instanceof(File).optional(),
  removeImage: z.boolean().optional(),
  _localPreview: z.string().optional(),
  choices: z.array(choiceSchema).optional(),
}).refine(data => {
  if (data.type === "MCQ") {
    if (!data.choices || data.choices.length < 2) return false;
    const correctCount = data.choices.filter(c => c.isCorrect).length;
    if (correctCount !== 1) return false;
  }
  return true;
}, {
  message: "MCQ questions must have at least 2 choices and exactly 1 correct answer.",
  path: ["choices"]
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
      type: "MCQ",
      difficulty: "MEDIUM",
      choices: [
        { text: "", isCorrect: true },
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
  const watchChoices = form.watch("choices");

  const { data: chapters } = useListChapters({
    subjectId: watchSubjectId ? Number(watchSubjectId) : undefined
  }, {
    query: { enabled: !!watchSubjectId, queryKey: ["listChapters", watchSubjectId] }
  });

  // Populate form when editing
  useEffect(() => {
    if (isEditing && existingQuestion) {
      form.reset({
        subjectId: existingQuestion.subjectId || 0,
        chapterId: existingQuestion.chapterId,
        text: existingQuestion.text,
        type: existingQuestion.type,
        difficulty: existingQuestion.difficulty,
        _localPreview: existingQuestion.imageUrl || undefined,
        choices: (existingQuestion as any).choices?.map((c: any) => ({
          id: c.id,
          text: c.text,
          isCorrect: c.isCorrect,
          imageUrl: c.imageUrl,
          _localPreview: c.imageUrl
        })) || []
      });
    }
  }, [isEditing, existingQuestion, form]);

  const onSubmit = async (data: QuestionFormValues) => {
    try {
      if (isEditing) {
        // Update question
        const qData: any = {
          chapterId: data.chapterId,
          text: data.text,
          type: data.type,
          difficulty: data.difficulty,
        };
        if (data.image) qData.image = data.image;
        if (data.removeImage) qData.removeImage = "true";
        
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
                text: c.text,
                isCorrect: c.isCorrect,
              };
              if (c.image) cData.image = c.image;
              if (c.removeImage) cData.removeImage = "true";
              await updateChoice.mutateAsync({ id: c.id, data: cData });
            } else {
              const cData: any = {
                questionId,
                text: c.text,
                isCorrect: c.isCorrect,
              };
              if (c.image) cData.image = c.image;
              await createChoice.mutateAsync({ data: cData });
            }
          }
        }
        
        toast({ title: "Question updated successfully" });
        setLocation("/questions");
      } else {
        // Create new question
        const qData: any = {
          chapterId: data.chapterId,
          text: data.text,
          type: data.type,
          difficulty: data.difficulty,
        };
        if (data.image) qData.image = data.image;

        const newQuestion = await createQuestion.mutateAsync({ data: qData });
        
        if (data.type === "MCQ" && data.choices) {
          for (const c of data.choices) {
            const cData: any = {
              questionId: newQuestion.id,
              text: c.text,
              isCorrect: c.isCorrect,
            };
            if (c.image) cData.image = c.image;
            await createChoice.mutateAsync({ data: cData });
          }
        }
        
        toast({ title: "Question created successfully" });
        setLocation("/questions");
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Error saving question", variant: "destructive" });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: any) => {
    const file = e.target.files?.[0];
    if (file) {
      form.setValue(fieldName, file);
      const parts: string[] = fieldName.split(".");
      const prefix = parts.slice(0, -1).join(".");
      if (prefix) {
        form.setValue(`${prefix}._localPreview` as any, URL.createObjectURL(file) as any);
        form.setValue(`${prefix}.removeImage` as any, false as any);
      } else {
        form.setValue("_localPreview" as any, URL.createObjectURL(file) as any);
        form.setValue("removeImage" as any, false as any);
      }
    }
  };

  const handleRemoveImage = (fieldNamePrefix: string) => {
    if (fieldNamePrefix) {
      form.setValue(`${fieldNamePrefix}.image` as any, undefined);
      form.setValue(`${fieldNamePrefix}._localPreview` as any, undefined);
      form.setValue(`${fieldNamePrefix}.removeImage` as any, true);
    } else {
      form.setValue("image" as any, undefined);
      form.setValue("_localPreview" as any, undefined);
      form.setValue("removeImage" as any, true);
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
    const sub = subjects?.find(s => s.id === currentValues.subjectId);
    const ch = chapters?.find(c => c.id === currentValues.chapterId);

    return (
      <div className="h-full overflow-y-auto bg-card p-8 border-l">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <div className="text-sm text-muted-foreground">{sub?.name || 'Subject'} &gt; {ch?.name || 'Chapter'}</div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">{currentValues.type}</Badge>
                <Badge variant={currentValues.difficulty === 'HARD' ? 'destructive' : currentValues.difficulty === 'MEDIUM' ? 'default' : 'secondary'}>
                  {currentValues.difficulty}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)}>
              <X className="h-4 w-4 mr-2" /> Close
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

            {currentValues.type === "FILLUP" && (
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
                              <Select 
                                onValueChange={(v) => field.onChange(Number(v))} 
                                value={field.value ? field.value.toString() : ""}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select subject" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {subjects?.map(s => (
                                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                              <Select 
                                onValueChange={(v) => field.onChange(Number(v))} 
                                value={field.value ? field.value.toString() : ""}
                                disabled={!watchSubjectId || chapters?.length === 0}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select chapter" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {chapters?.map(c => (
                                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <Separator />

                      <FormField
                        control={form.control}
                        name="text"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Question Text</FormLabel>
                            <FormDescription>
                              Use $...$ for inline math and $$...$$ for block math.
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
                                        <Input placeholder={`Choice ${index + 1} text...`} {...field} />
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
                      </CardContent>
                    </Card>
                  )}
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
