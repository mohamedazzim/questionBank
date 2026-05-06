import { useState } from "react";
import { useListChapters, useListSubjects } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IngestionResult {
  success: boolean;
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

export default function BulkUpload() {
  const { toast } = useToast();
  const { data: subjects } = useListSubjects();

  const [subjectId, setSubjectId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const { data: chapters } = useListChapters({
    subjectId: subjectId ? Number(subjectId) : undefined,
  });

  const isAllowedArchive = (file: File): boolean => {
    const lowerName = file.name.toLowerCase();
    const isZip = file.type === "application/zip" || file.type === "application/x-zip-compressed" || lowerName.endsWith(".zip");
    const isRar =
      file.type === "application/vnd.rar" ||
      file.type === "application/x-rar-compressed" ||
      file.type === "application/octet-stream" ||
      lowerName.endsWith(".rar");
    return isZip || isRar;
  };

  // Reset chapter when subject changes
  const handleSubjectChange = (value: string) => {
    setSubjectId(value);
    setChapterId("");
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isAllowedArchive(file)) {
        setArchiveFile(file);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a ZIP or RAR file",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isAllowedArchive(file)) {
        setArchiveFile(file);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a ZIP or RAR file",
          variant: "destructive",
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!archiveFile || !chapterId) {
      toast({
        title: "Missing information",
        description: "Please select a chapter and archive file",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("zipFile", archiveFile);
      formData.append("chapterId", chapterId);

      const response = await fetch("/api/questions/bulk/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data: IngestionResult = await response.json();
      setResult(data);

      if (data.success) {
        toast({
          title: "Bulk upload successful",
          description: `${data.stats.questionsInserted} questions imported successfully`,
        });
      } else {
        toast({
          title: "Bulk upload completed with errors",
          description: `${data.stats.questionsInserted} questions imported, ${data.stats.errors} errors`,
          variant: "destructive",
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Upload failed",
        description: errorMsg,
        variant: "destructive",
      });
      setResult({
        success: false,
        stats: {
          totalFiles: 0,
          texFilesFound: 0,
          imagesFound: 0,
          questionsExtracted: 0,
          questionsInserted: 0,
          choicesInserted: 0,
          errors: 1,
        },
        questionsCreated: [],
        warnings: [],
        errors: [{ message: errorMsg }],
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Bulk Question Import</h1>
        <p className="text-muted-foreground mt-1">Import questions in bulk from LaTeX-formatted ZIP or RAR archives.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload Archive</CardTitle>
            <CardDescription>ZIP/RAR file with LaTeX source and images</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Subject and Chapter Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Subject</label>
                <Select value={subjectId} onValueChange={handleSubjectChange}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects?.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Chapter</label>
                <Select value={chapterId} onValueChange={setChapterId} disabled={!subjectId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    {chapters?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <input
                type="file"
                accept=".zip,.rar"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-2">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">
                    {archiveFile ? archiveFile.name : "Drag and drop ZIP/RAR file here"}
                  </p>
                  <p className="text-sm text-muted-foreground">or click to select</p>
                </div>
              </div>
            </div>

            {archiveFile && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">{archiveFile.name}</span>
                <button
                  onClick={() => setArchiveFile(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              disabled={!archiveFile || !chapterId || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Questions
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Format Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Supported LaTeX Commands:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>{"• \\section{} - Section headers"}</li>
                <li>{"• \\question{} - Question text"}</li>
                <li>{"• \\option{} - Multiple choice"}</li>
                <li>{"• \\includegraphics{} - Images"}</li>
                <li>
                  {"• \\metadata"}
                  {"{"}key{"}"}
                  {"{"}value{"}"}
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">ZIP Structure:</h4>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• Single or multiple .tex files</li>
                <li>• Images in any subdirectory</li>
                <li>• Supports .png, .jpg, .svg</li>
                <li>• Build artifacts ignored</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {result.success ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Import Successful
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      Import Completed with Issues
                    </>
                  )}
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBox
                label="Files Scanned"
                value={result.stats.totalFiles}
                icon={<FileText className="h-4 w-4" />}
              />
              <StatBox
                label="LaTeX Files"
                value={result.stats.texFilesFound}
                icon={<FileText className="h-4 w-4" />}
              />
              <StatBox
                label="Images Found"
                value={result.stats.imagesFound}
                icon={<ImageIcon className="h-4 w-4" />}
              />
              <StatBox
                label="Extracted"
                value={result.stats.questionsExtracted}
                icon={<Download className="h-4 w-4" />}
              />
              <StatBox
                label="Inserted"
                value={result.stats.questionsInserted}
                variant="success"
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
              <StatBox
                label="Choices"
                value={result.stats.choicesInserted}
                icon={<FileText className="h-4 w-4" />}
              />
              <StatBox
                label="Warnings"
                value={result.warnings.length}
                variant={result.warnings.length > 0 ? "warning" : "default"}
              />
              <StatBox
                label="Errors"
                value={result.stats.errors}
                variant={result.stats.errors > 0 ? "destructive" : "default"}
              />
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warnings ({result.warnings.length})</AlertTitle>
                <AlertDescription>
                  <ul className="space-y-2 mt-2">
                    {result.warnings.slice(0, 5).map((warning, idx) => (
                      <li key={idx} className="text-sm">
                        {warning.message}
                        {warning.questionIndex !== undefined && ` [Question #${warning.questionIndex}]`}
                      </li>
                    ))}
                    {result.warnings.length > 5 && (
                      <li className="text-sm text-muted-foreground">
                        ... and {result.warnings.length - 5} more warnings
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Errors ({result.errors.length})</AlertTitle>
                <AlertDescription>
                  <ul className="space-y-2 mt-2">
                    {result.errors.slice(0, 5).map((error, idx) => (
                      <li key={idx} className="text-sm">
                        {error.message}
                        {error.questionIndex !== undefined && ` [Question #${error.questionIndex}]`}
                      </li>
                    ))}
                    {result.errors.length > 5 && (
                      <li className="text-sm text-muted-foreground">
                        ... and {result.errors.length - 5} more errors
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Questions Created */}
            {result.questionsCreated.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Questions Created ({result.questionsCreated.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.questionsCreated.slice(0, 10).map((q) => (
                    <div key={q.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">Q#{q.id}: {q.text}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Type: {q.type} | Choices: {q.choiceCount} | Images: {q.imageCount}
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      </div>
                    </div>
                  ))}
                  {result.questionsCreated.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {result.questionsCreated.length - 10} more questions
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: number | string;
  variant?: "default" | "success" | "warning" | "destructive";
  icon?: React.ReactNode;
}

function StatBox({ label, value, variant = "default", icon }: StatBoxProps) {
  const bgClass = {
    default: "bg-muted",
    success: "bg-green-50 dark:bg-green-950",
    warning: "bg-yellow-50 dark:bg-yellow-950",
    destructive: "bg-red-50 dark:bg-red-950",
  }[variant];

  const textClass = {
    default: "text-foreground",
    success: "text-green-900 dark:text-green-100",
    warning: "text-yellow-900 dark:text-yellow-100",
    destructive: "text-red-900 dark:text-red-100",
  }[variant];

  return (
    <div className={`p-3 rounded-lg ${bgClass}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {icon && <span className={textClass}>{icon}</span>}
        <p className={`text-2xl font-bold ${textClass}`}>{value}</p>
      </div>
    </div>
  );
}
