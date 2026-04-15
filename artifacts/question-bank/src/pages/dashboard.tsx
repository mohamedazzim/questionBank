import { useGetDashboardStats, useGetSubjectBreakdown, useGetDifficultyBreakdown, useGetRecentQuestions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Library, BookOpen, FileQuestion, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LatexRenderer } from "@/components/latex-renderer";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: 'hsl(var(--chart-5))',
  MEDIUM: 'hsl(var(--chart-4))',
  HARD: 'hsl(var(--destructive))',
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: subjectBreakdown, isLoading: subjectLoading } = useGetSubjectBreakdown();
  const { data: difficultyBreakdown, isLoading: difficultyLoading } = useGetDifficultyBreakdown();
  const { data: recentQuestions, isLoading: recentLoading } = useGetRecentQuestions();

  const safeSubjectBreakdown = Array.isArray(subjectBreakdown) ? subjectBreakdown : [];
  const safeDifficultyBreakdown = Array.isArray(difficultyBreakdown) ? difficultyBreakdown : [];
  const safeRecentQuestions = Array.isArray(recentQuestions) ? recentQuestions : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your question bank repository.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Subjects" value={stats?.totalSubjects} icon={Library} loading={statsLoading} />
        <StatCard title="Total Chapters" value={stats?.totalChapters} icon={BookOpen} loading={statsLoading} />
        <StatCard title="Total Questions" value={stats?.totalQuestions} icon={FileQuestion} loading={statsLoading} />
        <StatCard title="MCQ / Fill-up" value={stats ? `${stats.totalMCQ} / ${stats.totalFillup}` : undefined} icon={CheckCircle2} loading={statsLoading} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Questions by Subject</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {subjectLoading ? (
              <Skeleton className="w-full h-full" />
            ) : safeSubjectBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safeSubjectBreakdown}>
                  <XAxis dataKey="subjectName" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Bar dataKey="questionCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questions by Difficulty</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            {difficultyLoading ? (
              <Skeleton className="w-full h-full" />
            ) : safeDifficultyBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safeDifficultyBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="difficulty"
                  >
                    {safeDifficultyBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={DIFFICULTY_COLORS[entry.difficulty] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently Added Questions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : safeRecentQuestions.length > 0 ? (
            <div className="space-y-4">
              {safeRecentQuestions.map(q => (
                <div key={q.id} className="flex items-start justify-between p-4 border rounded-lg bg-card">
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{q.subjectName}</Badge>
                      <Badge variant="secondary" className="text-xs">{q.chapterName}</Badge>
                    </div>
                    <LatexRenderer content={q.text} className="text-sm line-clamp-2" />
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4 shrink-0">
                    <Badge variant={q.difficulty === 'HARD' ? 'destructive' : q.difficulty === 'MEDIUM' ? 'default' : 'secondary'}>
                      {q.difficulty}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{q.type}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No recent questions</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, loading }: { title: string, value?: number | string, icon: any, loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
