import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Rocket, BookOpen, Upload, Sparkles, ArrowRight, Code2, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resumeApi } from "@/api/resume";
import type { Resume, CareerGrowth, ProjectSuggestion } from "@/types";

export function CareerHubPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [career, setCareer] = useState<CareerGrowth | null>(null);
  const [projects, setProjects] = useState<ProjectSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCareerLoading, setIsCareerLoading] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);

  // Find the selected resume object for analysis-status checks
  const selectedResume = resumes.find((r) => r.id === selectedResumeId);
  const hasAnalysis = !!selectedResume?.analysis;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    resumeApi.getHistory().then((data) => {
      if (cancelled) return;
      setResumes(data);
      // Prefer the first resume that already has analysis data
      const analyzed = data.find((r) => r.analysis);
      setSelectedResumeId(analyzed?.id || data[0]?.id || "");
    }).catch(() => {}).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCareer = async () => {
    if (!selectedResumeId) return;
    if (!hasAnalysis) {
      toast.error("Please analyze this resume first (go to Analysis page), then come back here.");
      return;
    }
    setIsCareerLoading(true);
    try { const r = await resumeApi.getCareerGrowth(selectedResumeId); setCareer(r); toast.success(`Next role: ${r.nextRole}`); }
    catch { toast.error("Career analysis failed. Please try again."); } finally { setIsCareerLoading(false); }
  };

  const handleProjects = async () => {
    if (!selectedResumeId) return;
    if (!hasAnalysis) {
      toast.error("Please analyze this resume first (go to Analysis page), then come back here.");
      return;
    }
    setIsProjectsLoading(true);
    try { const r = await resumeApi.suggestProjects(selectedResumeId); setProjects(r.projects); toast.success(`${r.projects.length} projects suggested!`); }
    catch { toast.error("Project suggestions failed. Please try again."); } finally { setIsProjectsLoading(false); }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>;

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Rocket className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">No Resumes Found</h2>
        <Link to="/upload"><Button className="gap-2"><Upload className="h-4 w-4" /> Upload Resume</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Career Hub</h1>
        <p className="text-gray-500 dark:text-gray-400">Career growth path & AI project suggestions based on your resume</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select value={selectedResumeId} onChange={(e) => { setSelectedResumeId(e.target.value); setCareer(null); setProjects([]); }}
            className="flex h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fileName} {r.analysis ? `(ATS: ${r.atsScore ?? "–"}%)` : "(not analyzed)"}
              </option>
            ))}
          </select>
          {!hasAnalysis && selectedResumeId && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ This resume hasn't been analyzed yet — <Link to={`/analysis?resumeId=${selectedResumeId}`} className="underline font-medium">analyze it first</Link>
            </span>
          )}
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ═══ CAREER GROWTH ═══ */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-500" /> Career Growth</CardTitle>
                {!career && <Button size="sm" isLoading={isCareerLoading} onClick={handleCareer} className="gap-1 shadow-lg shadow-brand-500/25"><Sparkles className="h-3 w-3" /> Analyze</Button>}
              </div>
              <CardDescription>Your career progression roadmap</CardDescription>
            </CardHeader>
            <CardContent>
              {career ? (
                <div className="space-y-4">
                  {/* Current → Next */}
                  <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-900/20 dark:to-purple-900/20">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Current</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{career.currentLevel}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 flex-shrink-0 text-brand-500" />
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Next Role</p>
                      <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{career.nextRole}</p>
                    </div>
                    <Badge variant="default" className="ml-auto">{career.timeframe}</Badge>
                  </div>

                  {/* Skills to Learn */}
                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Skills to Learn for {career.nextRole}:</p>
                    <div className="space-y-2">
                      {career.skillsToLearn.map((skill, i) => (
                        <motion.div key={skill} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-2 rounded-lg border border-gray-100 p-2.5 dark:border-gray-700">
                          <BookOpen className="h-4 w-4 text-brand-500" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{skill}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Alternative Paths */}
                  {career.allPaths.length > 1 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Other Career Paths</p>
                      {career.allPaths.slice(1).map((p) => (
                        <div key={p.to} className="mb-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-600 dark:text-gray-400">{p.from}</span>
                            <ArrowRight className="h-3 w-3 text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-white">{p.to}</span>
                            <Badge variant="secondary" className="ml-auto text-[10px]">{p.timeframe}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-center"><span className="mb-2 text-4xl">📈</span><p className="text-xs text-gray-500">Click "Analyze" to see your career path</p></div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ PROJECT SUGGESTIONS ═══ */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 text-purple-500" /> Project Ideas</CardTitle>
                {projects.length === 0 && <Button size="sm" isLoading={isProjectsLoading} onClick={handleProjects} className="gap-1 shadow-lg shadow-brand-500/25"><Sparkles className="h-3 w-3" /> Suggest</Button>}
              </div>
              <CardDescription>AI-suggested projects to boost your resume</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length > 0 ? (
                <div className="space-y-3">
                  {projects.map((p, i) => (
                    <motion.div key={p.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      className="rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-md dark:border-gray-700">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{p.title}</h4>
                          <p className="text-xs text-gray-500">{p.description}</p>
                        </div>
                        <Badge variant={p.relevance >= 70 ? "success" : p.relevance >= 40 ? "warning" : "secondary"}>
                          {p.relevance}% match
                        </Badge>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {p.techStack.map((t) => <Badge key={t} variant="default" className="text-[10px]">{t}</Badge>)}
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{p.difficulty}</Badge>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-center"><span className="mb-2 text-4xl">💡</span><p className="text-xs text-gray-500">Click "Suggest" to get project ideas</p></div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
