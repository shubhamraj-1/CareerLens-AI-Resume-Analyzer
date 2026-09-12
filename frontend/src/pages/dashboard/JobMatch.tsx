import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Upload,
  TrendingUp,
  Link2,
  FileText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobMatchBarChart } from "@/components/charts/JobMatchBarChart";
import { resumeApi } from "@/api/resume";
import type { Resume, JobMatch } from "@/types";
import { Skeleton, SkeletonCard, SkeletonText } from "@/components/ui/skeleton";

function SkillGapCircle({ percent, label }: { percent: number; label: string }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (percent / 100) * circumference;
  const color =
    percent >= 80
      ? "#22c55e"
      : percent >= 60
        ? "#84cc16"
        : percent >= 40
          ? "#eab308"
          : "#ef4444";

  return (
    <div className="relative inline-flex">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r="40"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        <motion.circle
          cx="50"
          cy="50"
          r="40"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>
          {percent}%
        </span>
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
    </div>
  );
}

export function JobMatchPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [matchResult, setMatchResult] = useState<JobMatch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [inputMode, setInputMode] = useState<"paste" | "url">("paste");
  const [jobUrl, setJobUrl] = useState("");
  const [urlResult, setUrlResult] = useState<{ matchPercentage: number; missingKeywords: string[]; recommendation: string } | null>(null);
  const [isUrlMatching, setIsUrlMatching] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    resumeApi
      .getHistory()
      .then((data) => {
        setResumes(data);
        if (data.length > 0) setSelectedResumeId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleMatch = async () => {
    if (!selectedResumeId || !jobDescription.trim()) return;
    setIsMatching(true);
    toast.loading("Analyzing skill gap...", { id: "matching" });
    try {
      const result = await resumeApi.matchJob(
        selectedResumeId,
        jobDescription
      );
      setMatchResult(result);
      toast.success("Skill Gap Analysis complete!", {
        id: "matching",
        description: `Skill match: ${result.skillMatch}%`,
      });
    } catch {
      toast.error("Matching failed", { id: "matching" });
    } finally {
      setIsMatching(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <SkeletonCard className="h-48" />
        <SkeletonText lines={3} />
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Briefcase className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
          No Resumes Found
        </h2>
        <p className="mb-6 text-gray-500">Upload a resume first</p>
        <Link to="/upload">
          <Button className="gap-2">
            <Upload className="h-4 w-4" /> Upload Resume
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Job Match & Skill Gap Analysis
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Compare your resume skills against any job description
        </p>
      </motion.div>

      {/* Input Section — Tabbed: Paste JD vs URL */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {([
              { key: "paste" as const, label: "Paste Job Description", icon: FileText },
              { key: "url" as const, label: "Paste Job URL", icon: Link2 },
            ]).map((tab) => (
              <button key={tab.key} onClick={() => { setInputMode(tab.key); setMatchResult(null); setUrlResult(null); }}
                className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  inputMode === tab.key ? "text-brand-600 dark:text-brand-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}>
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {inputMode === tab.key && (
                  <motion.div layoutId="jm-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-purple-500"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }} />
                )}
              </button>
            ))}
          </div>

          <CardContent className="p-6">
            {/* Resume selector — shared */}
            <div className="mb-4 space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Resume</label>
              <select value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.fileName} — {new Date(r.createdAt).toLocaleDateString()}</option>
                ))}
              </select>
            </div>

            <AnimatePresence mode="wait">
              {inputMode === "paste" ? (
                <motion.div key="paste" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Job Description</label>
                    <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the full job description here..."
                      rows={4}
                      className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                  </div>
                  <Button className="gap-2 shadow-lg shadow-brand-500/25" onClick={handleMatch}
                    isLoading={isMatching} disabled={!selectedResumeId || !jobDescription.trim()}>
                    <Send className="h-4 w-4" /> Analyze
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="url" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Job Posting URL</label>
                    <input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)}
                      placeholder="https://linkedin.com/jobs/... or https://indeed.com/..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    <p className="text-xs text-gray-500 dark:text-gray-500">Works with LinkedIn, Indeed, Glassdoor, and most job boards</p>
                  </div>
                  <Button className="gap-2 shadow-lg shadow-brand-500/25"
                    isLoading={isUrlMatching}
                    disabled={!selectedResumeId || !jobUrl.trim()}
                    onClick={async () => {
                      if (!selectedResumeId || !jobUrl.trim()) return;
                      setIsUrlMatching(true);
                      setUrlResult(null);
                      toast.loading("Fetching job page & analyzing...", { id: "url-match" });
                      try {
                        const result = await resumeApi.matchUrl(selectedResumeId, jobUrl);
                        setUrlResult(result);
                        toast.success(`Match: ${result.matchPercentage}%`, { id: "url-match" });
                      } catch (err: unknown) {
                        const error = err as { response?: { data?: { message?: string } } };
                        toast.error(error.response?.data?.message || "Failed to analyze URL", { id: "url-match" });
                      } finally {
                        setIsUrlMatching(false);
                      }
                    }}>
                    <Link2 className="h-4 w-4" /> {isUrlMatching ? "Analyzing..." : "Calculate Match"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* URL Match Results */}
      {urlResult && inputMode === "url" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                {/* Score Circle */}
                <SkillGapCircle
                  percent={urlResult.matchPercentage}
                  label="Match"
                />
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                    {urlResult.matchPercentage >= 80 ? "Great Match! 🎉" : urlResult.matchPercentage >= 50 ? "Decent Match 👍" : "Needs Work 📝"}
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    {urlResult.recommendation}
                  </p>
                </div>
              </div>

              {/* Missing Keywords */}
              {urlResult.missingKeywords.length > 0 && (
                <div className="mt-6">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                    Missing Keywords ({urlResult.missingKeywords.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {urlResult.missingKeywords.map((kw) => (
                      <span key={kw}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {matchResult ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* ═══ SKILL GAP ANALYSIS CARD ═══ */}
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-brand-50 to-purple-50 dark:border-gray-700 dark:from-brand-900/20 dark:to-purple-900/20">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <TrendingUp className="h-5 w-5 text-brand-500" />
                      Skill Gap Analysis
                    </CardTitle>
                    <CardDescription>
                      Your resume skills vs job requirements
                    </CardDescription>
                  </div>
                  {/* Dual dials: computed ratio + AI weighted score */}
                  <div className="flex items-center gap-3">
                    <SkillGapCircle
                      percent={
                        matchResult.keywordsFound.length + matchResult.missingKeywords.length > 0
                          ? Math.round((matchResult.keywordsFound.length / (matchResult.keywordsFound.length + matchResult.missingKeywords.length)) * 100)
                          : 0
                      }
                      label="Coverage"
                    />
                    <SkillGapCircle percent={matchResult.overallScore} label="Weighted" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {/* Summary Stats */}
                <div className="mb-6 grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:gap-4">
                  <div className="rounded-xl bg-green-50 p-4 text-center dark:bg-green-900/20">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {matchResult.keywordsFound.length}
                    </p>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300">
                      Matched Skills
                    </p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-4 text-center dark:bg-red-900/20">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {matchResult.missingKeywords.length}
                    </p>
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">
                      Missing Skills
                    </p>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-4 text-center dark:bg-blue-900/20">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {matchResult.keywordsFound.length +
                        matchResult.missingKeywords.length}
                    </p>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Total Required
                    </p>
                  </div>
                </div>

                {/* Skill Comparison Table */}
                <div className="mb-6">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                    Skill-by-Skill Comparison
                  </h4>
                  <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="min-w-[18rem]">
                      {/* Header */}
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:gap-4 sm:px-4 dark:border-gray-700 dark:bg-gray-800/50">
                        <span className="min-w-0">Skill</span>
                        <span className="w-20 shrink-0 text-center">Status</span>
                        <span className="w-24 shrink-0 text-center">Action</span>
                      </div>

                      {/* Matched Skills */}
                      {matchResult.keywordsFound.map((skill, i) => (
                        <motion.div
                          key={`match-${skill}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-gray-100 px-3 py-3 last:border-0 sm:gap-4 sm:px-4 dark:border-gray-800"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                            <span className="truncate text-sm font-medium capitalize text-gray-900 dark:text-white">
                              {skill}
                            </span>
                          </div>
                          <Badge variant="success" className="w-20 shrink-0 justify-center">
                            Matched
                          </Badge>
                          <span className="w-24 shrink-0 text-center text-xs text-green-600 dark:text-green-400">
                            ✓ You have this
                          </span>
                        </motion.div>
                      ))}

                      {/* Missing Skills */}
                      {matchResult.missingKeywords.map((skill, i) => (
                        <motion.div
                          key={`miss-${skill}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay:
                              matchResult.keywordsFound.length * 0.03 + i * 0.03,
                          }}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-gray-100 bg-red-50/30 px-3 py-3 last:border-0 sm:gap-4 sm:px-4 dark:border-gray-800 dark:bg-red-900/5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                            <span className="truncate text-sm font-medium capitalize text-gray-900 dark:text-white">
                              {skill}
                            </span>
                          </div>
                          <Badge variant="danger" className="w-20 shrink-0 justify-center">
                            Missing
                          </Badge>
                          <span className="w-24 shrink-0 text-center text-xs text-red-600 dark:text-red-400">
                            ⚡ Learn this
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Visual Skill Match Bar — uses computed ratio (matched / total) */}
                {(() => {
                  const matched = matchResult.keywordsFound.length;
                  const total = matched + matchResult.missingKeywords.length;
                  const coveragePercent = total > 0 ? Math.round((matched / total) * 100) : 0;
                  return (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            Skill Coverage ({matched}/{total} skills)
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {coveragePercent}%
                          </span>
                        </div>
                        <div className="h-4 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <motion.div
                            className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-brand-500 to-purple-500 pr-2"
                            initial={{ width: 0 }}
                            animate={{ width: `${coveragePercent}%` }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                          >
                            {coveragePercent > 20 && (
                              <span className="text-[10px] font-bold text-white">
                                {matched}/{total} skills
                              </span>
                            )}
                          </motion.div>
                        </div>
                      </div>
                      {/* Explain the weighted score if it differs from coverage */}
                      {Math.abs(coveragePercent - matchResult.overallScore) > 5 && (
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">
                          💡 <strong>Weighted Score ({matchResult.overallScore}%)</strong> factors in experience match ({matchResult.experienceMatch}%) and education ({matchResult.educationMatch}%), so it may differ from raw skill coverage.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Score Breakdown Chart */}
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <motion.div
                className="min-w-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <JobMatchBarChart
                  skillMatch={matchResult.skillMatch}
                  experienceMatch={matchResult.experienceMatch}
                  educationMatch={matchResult.educationMatch}
                  overallScore={matchResult.overallScore}
                />
              </motion.div>

              {/* Quick Summary Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      Priority Actions
                    </CardTitle>
                    <CardDescription>
                      Steps to improve your match score
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {matchResult.missingKeywords.length > 0 && (
                        <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/10">
                          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                          <div>
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                              Add Missing Skills
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-300">
                              Learn and add:{" "}
                              {matchResult.missingKeywords.slice(0, 4).join(", ")}
                            </p>
                          </div>
                        </div>
                      )}
                      {matchResult.suggestions.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-700"
                        >
                          <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
                          <p className="text-xs text-gray-700 dark:text-gray-300">
                            {s}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Briefcase className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
                </motion.div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                  Paste a Job Description to Start
                </h3>
                <p className="mb-1 max-w-md text-sm text-gray-500">
                  Our AI will compare your resume skills against the job
                  requirements and show you exactly which skills you have and
                  which ones you need to learn.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
