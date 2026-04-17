import { useEffect, useMemo, useState } from "react";
import {
  getListQuestionsQueryKey,
  getPreviewQuestionQueryKey,
  useListChapters,
  useListQuestions,
  useListSubjects,
  usePreviewQuestion,
  useUpdateQuestion,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LatexRenderer } from "@/components/latex-renderer";

const toDataUri = (imageData: string | null | undefined, imageType: string | null | undefined): string | null => {
  if (!imageData || !imageType) return null;
  return `data:${imageType};base64,${imageData}`;
};

const sortQuestions = (questions: any[]) => {
  return [...questions].sort((a, b) => {
    const subjectCompare = (a.subjectName || "").localeCompare(b.subjectName || "");
    if (subjectCompare !== 0) return subjectCompare;
    const chapterCompare = (a.chapterName || "").localeCompare(b.chapterName || "");
    if (chapterCompare !== 0) return chapterCompare;
    return a.id - b.id;
  });
};

export default function PreviewAndLabelling() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterSubjectId, setFilterSubjectId] = useState<string>("all");
  const [filterChapterId, setFilterChapterId] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterVerificationStatus, setFilterVerificationStatus] = useState<string>("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState<number>(0);
  const [labelDifficulty, setLabelDifficulty] = useState<"EASY" | "MEDIUM" | "HARD" | "UNLABLED">("UNLABLED");
  const [labelVerificationStatus, setLabelVerificationStatus] = useState<"Verified" | "Need to Verified" | "Changes Needed">("Verified");

  const { data: subjects } = useListSubjects();
  const { data: chapters } = useListChapters({
    subjectId: filterSubjectId !== "all" ? Number(filterSubjectId) : undefined,
  });

  const { data: questionsData, isLoading: isQuestionsLoading } = useListQuestions(
    {
      subjectId: filterSubjectId !== "all" ? Number(filterSubjectId) : undefined,
      chapterId: filterChapterId !== "all" ? Number(filterChapterId) : undefined,
      type: filterType !== "all" ? (filterType as any) : undefined,
      verificationStatus: filterVerificationStatus !== "all" ? (filterVerificationStatus as any) : undefined,
      limit: 1000,
      page: 1,
    },
    {
      query: {
        queryKey: ["listQuestions", "preview-labelling", filterSubjectId, filterChapterId, filterType, filterVerificationStatus],
      },
    },
  );

  const orderedQuestions = useMemo(() => sortQuestions(questionsData?.questions ?? []), [questionsData?.questions]);

  useEffect(() => {
    if (orderedQuestions.length === 0) {
      setSelectedQuestionId(0);
      return;
    }

    if (!orderedQuestions.some((q) => q.id === selectedQuestionId)) {
      setSelectedQuestionId(orderedQuestions[0].id);
    }
  }, [orderedQuestions, selectedQuestionId]);

  const selectedQuestionSummary = orderedQuestions.find((q) => q.id === selectedQuestionId);

  const { data: previewQuestion, isLoading: isPreviewLoading } = usePreviewQuestion(selectedQuestionId, {
    query: {
      enabled: selectedQuestionId > 0,
      queryKey: getPreviewQuestionQueryKey(selectedQuestionId),
    },
  });

  useEffect(() => {
    if (previewQuestion?.difficulty) {
      setLabelDifficulty(previewQuestion.difficulty as "EASY" | "MEDIUM" | "HARD" | "UNLABLED");
    }
    setLabelVerificationStatus("Verified");
  }, [previewQuestion?.id, previewQuestion?.difficulty, (previewQuestion as any)?.verificationStatus]);

  const updateQuestion = useUpdateQuestion();

  const currentIndex = orderedQuestions.findIndex((q) => q.id === selectedQuestionId);
  const hasNext = currentIndex >= 0 && currentIndex < orderedQuestions.length - 1;

  const handleSaveLabel = async (moveNext = false) => {
    if (!selectedQuestionId) return;

    try {
      await updateQuestion.mutateAsync({
        id: selectedQuestionId,
        data: {
          difficulty: labelDifficulty,
          verificationStatus: labelVerificationStatus,
        } as any,
      });
      queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getPreviewQuestionQueryKey(selectedQuestionId) });
      toast({ title: "Label saved" });

      if (moveNext && hasNext) {
        setSelectedQuestionId(orderedQuestions[currentIndex + 1].id);
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Failed to save label", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid mt-3 grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Select
              value={filterSubjectId}
              onValueChange={(val) => {
                setFilterSubjectId(val);
                setFilterChapterId("all");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Chapter</label>
            <Select value={filterChapterId} onValueChange={setFilterChapterId}>
              <SelectTrigger>
                <SelectValue placeholder="All Chapters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chapters</SelectItem>
                {chapters?.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Question Type</label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="MCQ">Multiple Choice</SelectItem>
                <SelectItem value="FILLUP">Fill in the Blanks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Verification Status</label>
            <Select value={filterVerificationStatus} onValueChange={setFilterVerificationStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Verified">Verified</SelectItem>
                <SelectItem value="Need to Verified">Need to Verified</SelectItem>
                <SelectItem value="Changes Needed">Changes Needed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Question List</CardTitle>
            <CardDescription>{orderedQuestions.length} question(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[60vh] pr-2">
              {isQuestionsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : orderedQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions found for selected filters.</p>
              ) : (
                <div className="space-y-2">
                  {orderedQuestions.map((q, index) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSelectedQuestionId(q.id)}
                      className={`w-full text-left p-3 rounded-md border transition-colors ${selectedQuestionId === q.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                    >
                      <div className="text-xs text-muted-foreground">#{index + 1}</div>
                      <LatexRenderer content={q.text || "(Image-only question)"} className="text-sm line-clamp-2" />
                      <div className="text-xs text-muted-foreground mt-1">{q.subjectName} • {q.chapterName}</div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-4">
            {isPreviewLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !previewQuestion ? (
              <p className="text-sm text-muted-foreground">Select a question to preview.</p>
            ) : (
              <>
                <div className="space-y-4 mt-5 border rounded-md p-4">
                  <LatexRenderer content={previewQuestion.text || "(Image-only question)"} className="text-base" />

                  {toDataUri(previewQuestion.imageData, previewQuestion.imageType) && (
                    <img
                      src={toDataUri(previewQuestion.imageData, previewQuestion.imageType) as string}
                      alt="Question"
                      className="max-h-72 rounded border object-contain"
                    />
                  )}

                  {previewQuestion.type === "MCQ" && previewQuestion.choices.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {previewQuestion.choices.map((choice, idx) => {
                        const choiceImage = toDataUri(choice.imageData, choice.imageType);
                        return (
                          <div key={choice.id} className={`p-3 border rounded-md ${choice.isCorrect ? "bg-primary/5 border-primary/20" : ""}`}>
                            <div className="flex gap-2 items-start">
                              <span className="text-sm font-semibold">{String.fromCharCode(65 + idx)}.</span>
                              <div className="space-y-2 flex-1">
                                <LatexRenderer content={choice.text || "(Image-only choice)"} className="text-sm" />
                                {choiceImage && (
                                  <img src={choiceImage} alt={`Choice ${idx + 1}`} className="max-h-28 rounded border object-contain" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between border rounded-md p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-[520px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Label Question (Difficulty)</label>
                      <Select value={labelDifficulty} onValueChange={(val: any) => setLabelDifficulty(val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EASY">Easy</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HARD">Hard</SelectItem>
                          <SelectItem value="UNLABLED">Unlabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Label Question (Verification)</label>
                      <Select value={labelVerificationStatus} onValueChange={(val: any) => setLabelVerificationStatus(val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Verified">Verified</SelectItem>
                          <SelectItem value="Need to Verified">Need to Verified</SelectItem>
                          <SelectItem value="Changes Needed">Changes Needed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => handleSaveLabel(false)} disabled={updateQuestion.isPending}>
                      Save Label
                    </Button>
                    <Button onClick={() => handleSaveLabel(true)} disabled={updateQuestion.isPending || !hasNext}>
                      Save and Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
