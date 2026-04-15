type Subject = { id: number; name: string };
type Chapter = { id: number; name: string };
type Question = { id: number; text: string; difficulty: string };

type ExportHealth = {
  canGeneratePdf: boolean;
  browserPath: string | null;
};

const API_BASE = process.env["API_BASE"] ?? "http://127.0.0.1:3000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function requestPdf(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/pdf")) {
    throw new Error(`Expected application/pdf for ${path}, received: ${contentType}`);
  }
}

async function main() {
  const ts = Date.now();

  console.log(`Using API_BASE=${API_BASE}`);

  const exportHealth = await request<ExportHealth>("/export/health", {
    method: "GET",
    headers: {},
  });

  if (!exportHealth.canGeneratePdf) {
    throw new Error("Export runtime not ready. Install Chrome/Edge and restart API server.");
  }

  console.log(`Export runtime OK (${exportHealth.browserPath ?? "default browser"})`);

  const subject = await request<Subject>("/subjects", {
    method: "POST",
    body: JSON.stringify({ name: `SmokeSub-${ts}` }),
  });

  const chapter = await request<Chapter>("/chapters", {
    method: "POST",
    body: JSON.stringify({ subjectId: subject.id, name: `SmokeChap-${ts}` }),
  });

  const question = await request<Question>("/questions", {
    method: "POST",
    body: JSON.stringify({
      chapterId: chapter.id,
      text: "Smoke test: $e^{i\\pi}+1=0$ and \\(a^2+b^2=c^2\\).",
      type: "FILLUP",
      difficulty: "MEDIUM",
    }),
  });

  const preview = await request<{ text: string }>(`/questions/${question.id}/preview`, {
    method: "GET",
    headers: {},
  });

  if (!preview.text.includes("$") && !preview.text.includes("\\(")) {
    throw new Error("Preview payload did not include expected LaTeX delimiters");
  }

  await requestPdf(`/export/pdf/question/${question.id}`);
  await requestPdf(`/export/pdf/chapter/${chapter.id}`);
  await requestPdf(`/export/pdf/subject/${subject.id}`);
  await requestPdf("/export/pdf/selected", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questionIds: [question.id], title: "Smoke Selection" }),
  });

  await request<void>(`/questions/${question.id}`, { method: "DELETE", headers: {} });
  await request<void>(`/chapters/${chapter.id}`, { method: "DELETE", headers: {} });
  await request<void>(`/subjects/${subject.id}`, { method: "DELETE", headers: {} });

  console.log("Runtime smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
