import { useEffect, useState } from "react";
import { useListSubjects, useListChapters, useListQuestions } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, FileText, Library, BookOpen, ListChecks } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LatexRenderer } from "@/components/latex-renderer";

type ExportHealth = {
  canGeneratePdf: boolean;
  browserPath: string | null;
};

export default function Export() {
  const { toast } = useToast();
  
  const [exportType, setExportType] = useState<"subject" | "chapter" | "selected">("subject");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  
  // For selected questions
  const [filterSubjectId, setFilterSubjectId] = useState<string>("all");
  const [filterChapterId, setFilterChapterId] = useState<string>("all");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportHealth, setExportHealth] = useState<ExportHealth | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadExportHealth = async () => {
      try {
        const res = await fetch("/api/export/health");
        if (!res.ok) throw new Error("Failed to load export health");
        const data = (await res.json()) as ExportHealth;
        if (active) setExportHealth(data);
      } catch (error) {
        console.error(error);
        if (active) setExportHealth({ canGeneratePdf: false, browserPath: null });
      } finally {
        if (active) setIsHealthLoading(false);
      }
    };

    loadExportHealth();
    return () => {
      active = false;
    };
  }, []);

  const { data: subjects } = useListSubjects();
  const { data: exportChapters } = useListChapters({ 
    subjectId: selectedSubjectId ? Number(selectedSubjectId) : undefined 
  });
  
  const { data: filterChapters } = useListChapters({ 
    subjectId: filterSubjectId !== "all" ? Number(filterSubjectId) : undefined 
  });
  
  const { data: questionsData } = useListQuestions({
    subjectId: filterSubjectId !== "all" ? Number(filterSubjectId) : undefined,
    chapterId: filterChapterId !== "all" ? Number(filterChapterId) : undefined,
    limit: 100 // Loading up to 100 for easy selection in this demo
  }, {
    query: {
      enabled: exportType === "selected",
      queryKey: ["listQuestions", filterSubjectId, filterChapterId]
    }
  });

  const toggleQuestionSelection = (id: number) => {
    setSelectedQuestionIds(prev => 
      prev.includes(id) ? prev.filter(qId => qId !== id) : [...prev, id]
    );
  };

  const selectAllQuestions = () => {
    if (questionsData?.questions) {
      if (selectedQuestionIds.length === questionsData.questions.length) {
        setSelectedQuestionIds([]);
      } else {
        setSelectedQuestionIds(questionsData.questions.map(q => q.id));
      }
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      let res: Response;
      let filename = 'export.pdf';

      if (exportType === "subject") {
        if (!selectedSubjectId) {
          toast({ title: "Please select a subject", variant: "destructive" });
          return;
        }
        res = await fetch(`/api/export/pdf/subject/${selectedSubjectId}`);
        const sub = subjects?.find(s => s.id === Number(selectedSubjectId));
        if (sub) filename = `${sub.name.replace(/\s+/g, '_')}_Questions.pdf`;
      } else if (exportType === "chapter") {
        if (!selectedChapterId) {
          toast({ title: "Please select a chapter", variant: "destructive" });
          return;
        }
        res = await fetch(`/api/export/pdf/chapter/${selectedChapterId}`);
        const ch = exportChapters?.find(c => c.id === Number(selectedChapterId));
        if (ch) filename = `${ch.name.replace(/\s+/g, '_')}_Questions.pdf`;
      } else {
        if (selectedQuestionIds.length === 0) {
          toast({ title: "Please select at least one question", variant: "destructive" });
          return;
        }
        res = await fetch(`/api/export/pdf/selected`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionIds: selectedQuestionIds, title: "Custom Question Bank" })
        });
        filename = `Custom_Selection_${selectedQuestionIds.length}_Questions.pdf`;
      }

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Export completed successfully" });
    } catch (error) {
      console.error(error);
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Export PDF</h1>
        <p className="text-muted-foreground mt-1">Generate beautifully formatted PDF documents of your question banks.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className={`cursor-pointer transition-colors ${exportType === 'subject' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
          onClick={() => setExportType('subject')}
        >
          <CardHeader>
            <Library className={`h-8 w-8 mb-2 ${exportType === 'subject' ? 'text-primary' : 'text-muted-foreground'}`} />
            <CardTitle className="text-lg">Entire Subject</CardTitle>
            <CardDescription>Export all chapters and questions within a subject.</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${exportType === 'chapter' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
          onClick={() => setExportType('chapter')}
        >
          <CardHeader>
            <BookOpen className={`h-8 w-8 mb-2 ${exportType === 'chapter' ? 'text-primary' : 'text-muted-foreground'}`} />
            <CardTitle className="text-lg">Single Chapter</CardTitle>
            <CardDescription>Export a specific chapter.</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${exportType === 'selected' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
          onClick={() => setExportType('selected')}
        >
          <CardHeader>
            <ListChecks className={`h-8 w-8 mb-2 ${exportType === 'selected' ? 'text-primary' : 'text-muted-foreground'}`} />
            <CardTitle className="text-lg">Custom Selection</CardTitle>
            <CardDescription>Hand-pick specific questions to export.</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isHealthLoading && !exportHealth?.canGeneratePdf && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>PDF runtime is not ready</AlertTitle>
              <AlertDescription>
                Install Google Chrome or Microsoft Edge on this machine, then restart the API server. Export is disabled until a browser runtime is detected.
              </AlertDescription>
            </Alert>
          )}

          {exportType === "subject" && (
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Subject</label>
                <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a subject..." />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects?.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {exportType === "chapter" && (
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-medium">1. Select Subject</label>
                <Select value={selectedSubjectId} onValueChange={(val) => {
                  setSelectedSubjectId(val);
                  setSelectedChapterId("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a subject..." />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects?.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">2. Select Chapter</label>
                <Select value={selectedChapterId} onValueChange={setSelectedChapterId} disabled={!selectedSubjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a chapter..." />
                  </SelectTrigger>
                  <SelectContent>
                    {exportChapters?.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {exportType === "selected" && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">Filter by Subject</label>
                  <Select value={filterSubjectId} onValueChange={(val) => {
                    setFilterSubjectId(val);
                    setFilterChapterId("all");
                  }}>
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
                </div>
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">Filter by Chapter</label>
                  <Select value={filterChapterId} onValueChange={setFilterChapterId} disabled={filterSubjectId === "all" && filterChapters?.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Chapters" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Chapters</SelectItem>
                      {filterChapters?.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="bg-muted px-4 py-3 flex items-center justify-between border-b">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={questionsData?.questions && questionsData.questions.length > 0 && selectedQuestionIds.length === questionsData.questions.length}
                      onCheckedChange={selectAllQuestions}
                    />
                    <span className="text-sm font-medium">Select All</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{selectedQuestionIds.length} selected</span>
                </div>
                <ScrollArea className="h-[300px]">
                  <div className="p-4 space-y-3">
                    {questionsData?.questions?.map(q => (
                      <div key={q.id} className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-md">
                        <Checkbox 
                          className="mt-1"
                          checked={selectedQuestionIds.includes(q.id)}
                          onCheckedChange={() => toggleQuestionSelection(q.id)}
                        />
                        <div className="flex-1 space-y-1">
                          <LatexRenderer content={q.text} className="text-sm line-clamp-2" />
                          <div className="text-xs text-muted-foreground flex gap-2">
                            <span>{q.subjectName}</span>
                            <span>&bull;</span>
                            <span>{q.chapterName}</span>
                            <span>&bull;</span>
                            <span>{q.difficulty}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {questionsData?.questions?.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">No questions found matching the filters.</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleExport}
          disabled={isExporting || isHealthLoading || !exportHealth?.canGeneratePdf}
          className="w-full sm:w-auto"
        >
          {isExporting ? (
            <span className="flex items-center">Generating PDF...</span>
          ) : (
            <span className="flex items-center"><FileText className="mr-2 h-5 w-5" /> Generate PDF</span>
          )}
        </Button>
      </div>
    </div>
  );
}
