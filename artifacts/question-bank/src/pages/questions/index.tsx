import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListQuestions, 
  useListSubjects,
  useListChapters,
  useDeleteQuestion,
  getListQuestionsQueryKey
} from "@workspace/api-client-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit2, Trash2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { LatexRenderer } from "@/components/latex-renderer";

export default function Questions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [chapterId, setChapterId] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [verificationStatus, setVerificationStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const getDifficultyBadgeVariant = (difficultyValue: string): "default" | "secondary" | "destructive" | "outline" => {
    if (difficultyValue === "HARD") return "destructive";
    if (difficultyValue === "MEDIUM") return "default";
    if (difficultyValue === "UNLABLED") return "outline";
    return "secondary";
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // When subject changes, reset chapter
  useEffect(() => {
    setChapterId("all");
    setPage(1);
  }, [subjectId]);

  const { data: subjects } = useListSubjects();
  const { data: chapters } = useListChapters({ 
    subjectId: subjectId !== "all" ? Number(subjectId) : undefined 
  });

  const queryParams = {
    search: debouncedSearch || undefined,
    subjectId: subjectId !== "all" ? Number(subjectId) : undefined,
    chapterId: chapterId !== "all" ? Number(chapterId) : undefined,
    difficulty: difficulty !== "all" ? difficulty as any : undefined,
    type: type !== "all" ? type as any : undefined,
    verificationStatus: verificationStatus !== "all" ? verificationStatus as any : undefined,
    page,
    limit: 10
  };

  const { data: questionsData, isLoading } = useListQuestions(queryParams);
  const deleteQuestion = useDeleteQuestion();

  const confirmDelete = () => {
    if (!deletingId) return;
    deleteQuestion.mutate(
      { id: deletingId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey() });
          setDeletingId(null);
          toast({ title: "Question deleted successfully" });
        },
        onError: () => toast({ title: "Error deleting question", variant: "destructive" })
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Questions</h1>
          <p className="text-muted-foreground mt-1">Manage the master question repository.</p>
        </div>
        <Link href="/questions/new">
          <Button className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger>
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {subjects?.map(s => (
              <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={chapterId} onValueChange={(val) => { setChapterId(val); setPage(1); }}>
          <SelectTrigger disabled={subjectId === "all" && chapters?.length === 0}>
            <SelectValue placeholder="All Chapters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Chapters</SelectItem>
            {chapters?.map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={difficulty} onValueChange={(val) => { setDifficulty(val); setPage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="All Difficulties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Difficulties</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
            <SelectItem value="UNLABLED">Unlabled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(val) => { setType(val); setPage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MCQ">Multiple Choice</SelectItem>
            <SelectItem value="FILLUP">Fill in the Blanks</SelectItem>
          </SelectContent>
        </Select>

        <Select value={verificationStatus} onValueChange={(val) => { setVerificationStatus(val); setPage(1); }}>
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

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Question</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Type/Difficulty</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : questionsData?.questions && questionsData.questions.length > 0 ? (
              questionsData.questions.map((question) => (
                <TableRow key={question.id}>
                  <TableCell>
                    <div className="flex items-start gap-2 max-w-xl">
                      {question.imageUrl && <ImageIcon className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />}
                      <LatexRenderer content={question.text} className="line-clamp-2 text-sm" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{question.subjectName}</span>
                      <span className="text-xs text-muted-foreground">{question.chapterName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="outline">{question.type}</Badge>
                      <Badge variant={getDifficultyBadgeVariant(question.difficulty)} className="text-[10px] h-4 px-1">
                        {question.difficulty}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(question.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => setLocation(`/questions/${question.id}/edit`)}>
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletingId(question.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No questions found matching your criteria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {questionsData && questionsData.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, questionsData.total)} of {questionsData.total} entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="text-sm font-medium">Page {page} of {questionsData.totalPages}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(questionsData.totalPages, p + 1))}
              disabled={page === questionsData.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the question and its choices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
