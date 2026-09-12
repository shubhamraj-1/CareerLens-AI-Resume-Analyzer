import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GitCompareArrows, TrendingUp, TrendingDown, Minus, Upload, AlertTriangle, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resumeApi } from "@/api/resume";
import type { Resume, ResumeComparison } from "@/types";

export function ResumeComparePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [oldId, setOldId] = useState("");
  const [newId, setNewId] = useState("");
  const [result, setResult] = useState<ResumeComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    resumeApi.getHistory()
      .then((data) => {
        if (cancelled) return;
        setResumes(data);
        // Auto-select the two most recent DIFFERENT resumes
        if (data.length >= 2) { setOldId(data[1].id); setNewId(data[0].id); }
        else if (data.length === 1) { setOldId(data[0].id); setNewId(""); }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isSameResume = oldId !== "" && newId !== "" && oldId === newId;

  const handleCompare = async () => {
    if (!oldId || !newId) return;
    if (isSameResume) { toast.error("Please select two different resumes"); return; }
    setIsComparing(true);
    toast.loading("Comparing resumes...", { id: "compare" });
    try {
      const res = await resumeApi.compareResumes(oldId, newId);
      setResult(res);
      toast.success("Comparison complete!", { id: "compare" });
    } catch {
      toast.error("Comparison failed", { id: "compare" });
    } finally {
      setIsComparing(false);
    }
  };

  // When oldId changes, if newId is the same, auto-pick the next available
  const handleOldChange = (id: string) => {
    setOldId(id);
    setResult(null);
    if (id === newId) {
      const alt = resumes.find((r) => r.id !== id);
      if (alt) setNewId(alt.id);
      else setNewId("");
    }
  };

  const handleNewChange = (id: string) => {
    setNewId(id);
    setResult(null);
    if (id === oldId) {
      const alt = resumes.find((r) => r.id !== id);
      if (alt) setOldId(alt.id);
      else setOldId("");
    }
  };

  // Helper: get display label for a resume
  const label = (r: Resume) => {
    const score = r.atsScore != null ? ` (ATS: ${r.atsScore}%)` : "";
    return `${r.fileName}${score} — ${new Date(r.createdAt).toLocaleDateString()}`;
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>;
  }

  if (resumes.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <GitCompareArrows className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Need 2+ Resumes</h2>
        <p className="mb-6 text-gray-500">Upload at least 2 resumes to compare them</p>
        <Link to="/upload"><Button className="gap-2"><Upload className="h-4 w-4" /> Upload Resume</Button></Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Resume Comparison</h1>
        <p className="text-gray-500 dark:text-gray-400">Compare your old resume with the improved version</p>
      </motion.div>

      {/* Selector */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-6">
            <div className="grid w-full min-w-0 items-end gap-4 sm:grid-cols-[1fr_auto_1fr_auto]">
              <div className="min-w-0 space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">📄 Old Resume</label>
                <select value={oldId} onChange={(e) => handleOldChange(e.target.value)}
                  className="flex h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.id === newId}>
                      {label(r)}{r.id === newId ? " (selected as New)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-center pb-1">
                <span className="text-xl text-gray-400">→</span>
              </div>
              <div className="min-w-0 space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">📄 New Resume</label>
                <select value={newId} onChange={(e) => handleNewChange(e.target.value)}
                  className="flex h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.id === oldId}>
                      {label(r)}{r.id === oldId ? " (selected as Old)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleCompare} isLoading={isComparing} disabled={isSameResume || !oldId || !newId}
                className="w-full gap-2 shadow-lg shadow-brand-500/25 sm:w-auto">
                <GitCompareArrows className="h-4 w-4" /> Compare
              </Button>
            </div>

            {/* Same-resume warning */}
            {isSameResume && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-800 dark:bg-amber-900/20"
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  You've selected the same resume for both fields. Please pick two different versions to compare.
                </p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Results */}
      {result && (() => {
        const rawDelta = result.rawAtsDelta ?? result.newScore - result.oldScore;
        const rowDeltasOk = result.fullComparisonReliable ?? result.comparisonReliable !== false;
        const headlineOk =
          result.atsHeadlineValid === true ||
          (result.atsHeadlineValid === undefined && result.comparisonReliable !== false);
        const showSevereWarning = !headlineOk;
        return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {showSevereWarning && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-900/10"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-100">Comparison not available</p>
                <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
                  {result.verdict}
                  <span className="mt-2 block text-amber-700/80 dark:text-amber-300/80">
                    Raw ATS difference (informational only): {rawDelta > 0 ? "+" : ""}{rawDelta} percentage points.
                  </span>
                </p>
              </div>
            </motion.div>
          )}
          {headlineOk && !rowDeltasOk && result.unreliableSide === "old" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900/40 dark:bg-sky-900/10"
            >
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
              <p className="text-xs text-sky-900 dark:text-sky-100">
                The <strong>ATS improvement</strong> above compares stored headline scores. The <strong>older</strong> resume’s
                section scores may be from a failed or partial run (e.g. 1% with zeros). Use the table as a guide only, or
                re-analyze the old file if you still have it.
              </p>
            </motion.div>
          )}
          {/* Score Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col items-center p-6 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Old Score</p>
                <p className="text-4xl font-bold text-gray-400">{result.oldScore}%</p>
              </CardContent>
            </Card>
            <Card className="border-brand-200 bg-gradient-to-br from-brand-50 to-purple-50 dark:border-brand-800 dark:from-brand-900/20 dark:to-purple-900/20">
              <CardContent className="flex flex-col items-center p-6 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Improvement</p>
                {headlineOk ? (
                  <p className={`text-4xl font-bold ${result.improvement > 0 ? "text-green-500" : result.improvement < 0 ? "text-red-500" : "text-gray-500"}`}>
                    {result.improvement > 0 ? "+" : ""}{result.improvement}%
                  </p>
                ) : (
                  <p className="text-4xl font-bold text-gray-400 dark:text-gray-500" title="Headline improvement hidden when the new resume’s analysis is unreliable">
                    —
                  </p>
                )}
                <p className="mt-1 text-sm font-medium text-brand-600 dark:text-brand-400">{result.verdict}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center p-6 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">New Score</p>
                <p className="text-4xl font-bold text-brand-600">{result.newScore}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Comparison</CardTitle>
              <CardDescription>Side-by-side metric breakdown</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="min-w-[20rem]">
                  <div className="grid grid-cols-4 gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:gap-4 sm:px-4 dark:border-gray-700 dark:bg-gray-800/50">
                    <span>Metric</span>
                    <span className="text-center">Old</span>
                    <span className="text-center">New</span>
                    <span className="text-center">Change</span>
                  </div>
                  {result.comparisons.map((c, i) => {
                    const diff = c.new - c.old;
                    return (
                      <motion.div key={c.label}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="grid grid-cols-4 items-center gap-2 border-b border-gray-100 px-3 py-3 last:border-0 sm:gap-4 sm:px-4 dark:border-gray-800">
                      <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">{c.label}</span>
                      <span className="text-center text-sm text-gray-500">{c.old}{c.unit}</span>
                      <span className="text-center text-sm font-semibold text-gray-900 dark:text-white">{c.new}{c.unit}</span>
                      <div className="flex items-center justify-center">
                        {!rowDeltasOk ? (
                          <Badge variant="secondary" className="gap-1">—</Badge>
                        ) : diff > 0 ? (
                          <Badge variant="success" className="gap-1">
                            <TrendingUp className="h-3 w-3" /> +{diff}
                          </Badge>
                        ) : diff < 0 ? (
                          <Badge variant="danger" className="gap-1">
                            <TrendingDown className="h-3 w-3" /> {diff}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Minus className="h-3 w-3" /> 0
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        );
      })()}
    </div>
  );
}
