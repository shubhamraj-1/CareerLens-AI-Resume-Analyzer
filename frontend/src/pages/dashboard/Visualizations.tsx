import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Eye, Upload, Sparkles, FileText, Code2,
  CheckCircle2, Zap, Heart, BookOpen, AlertCircle, RefreshCw, FlaskConical,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resumeApi } from "@/api/resume";
import type { Resume, ResumePreview } from "@/types";
import { RechartsSafeContainer } from "@/components/charts/RechartsSafeContainer";

// ─────────────────────────────────────────────────────────────────────────────
// Demo data — used by the "Try demo data" button so users can verify the
// UI is wired correctly even when the backend hasn't returned real data yet
// (e.g. file expired on Vercel, or stored analysis is empty).
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_PREVIEW: ResumePreview = {
  fullText:
    "PROFESSIONAL SUMMARY\nFull-stack engineer with 5+ years building scalable web apps in React, Node.js and AWS. Led migration from monolith to microservices, reducing deploy time by 60%.\n\nEXPERIENCE\nSenior Software Engineer — Acme Corp (2022 – Present)\n• Architected a real-time collaboration platform using React, Socket.io and Redis serving 200K+ daily users.\n• Optimized PostgreSQL queries and added caching, cutting API p95 latency from 800ms to 120ms.\n• Mentored 4 junior engineers and led code reviews across 3 product teams.\n\nSKILLS\nReact, TypeScript, Node.js, Python, Docker, Kubernetes, AWS, PostgreSQL, Redis, GraphQL, Tailwind CSS, Git, CI/CD, Jest, Playwright\n\nEDUCATION\nB.S. Computer Science — State University, 2019\n\nPROJECTS\nOpen-source contributor to Next.js plugins; built a Tailwind-based component library used by 1.2K developers.",
  wordCount: 142,
  sections: [
    { name: "Summary", content: "Full-stack engineer with 5+ years building scalable web apps in React, Node.js and AWS. Led migration from monolith to microservices, reducing deploy time by 60%.", color: "#6366f1" },
    { name: "Experience", content: "Senior Software Engineer — Acme Corp (2022 – Present)\n• Architected a real-time collaboration platform using React, Socket.io and Redis serving 200K+ daily users.\n• Optimized PostgreSQL queries and added caching, cutting API p95 latency from 800ms to 120ms.\n• Mentored 4 junior engineers and led code reviews across 3 product teams.", color: "#22c55e" },
    { name: "Skills", content: "React, TypeScript, Node.js, Python, Docker, Kubernetes, AWS, PostgreSQL, Redis, GraphQL, Tailwind CSS, Git, CI/CD, Jest, Playwright", color: "#f59e0b" },
    { name: "Education", content: "B.S. Computer Science — State University, 2019", color: "#3b82f6" },
    { name: "Projects", content: "Open-source contributor to Next.js plugins; built a Tailwind-based component library used by 1.2K developers.", color: "#ec4899" },
  ],
  highlights: {
    techKeywords: ["React", "TypeScript", "Node.js", "Python", "Docker", "Kubernetes", "AWS", "PostgreSQL", "Redis", "GraphQL", "Tailwind CSS", "Git", "Jest", "Playwright", "Next.js", "Socket.io"],
    softSkills: ["Mentored", "Led", "Architected", "Optimized"],
    actionVerbs: ["Architected", "Optimized", "Mentored", "Led", "Built", "Reduced"],
    dynamicSkills: ["CI/CD", "Microservices", "Real-time", "Component library"],
  },
  topSkills: [
    { skill: "React", count: 8 }, { skill: "TypeScript", count: 6 }, { skill: "Node.js", count: 5 },
    { skill: "AWS", count: 5 }, { skill: "Docker", count: 4 }, { skill: "PostgreSQL", count: 4 },
    { skill: "Python", count: 3 }, { skill: "Kubernetes", count: 3 }, { skill: "Redis", count: 3 },
    { skill: "GraphQL", count: 2 }, { skill: "Tailwind CSS", count: 2 }, { skill: "Jest", count: 2 },
  ],
  industryClassification: {
    industries: [
      { name: "Software Engineering", confidence: 92, topMatches: ["React", "Node.js", "TypeScript"] },
      { name: "Cloud / DevOps", confidence: 64, topMatches: ["AWS", "Docker", "Kubernetes"] },
      { name: "Full-Stack Web", confidence: 58, topMatches: ["React", "PostgreSQL", "GraphQL"] },
    ],
    primary: "Software Engineering",
  },
  fileAvailable: true,
  needsAnalysis: false,
};

const SKILL_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#a855f7", "#d946ef", "#f59e0b", "#10b981", "#0ea5e9",
];

/** Matches backend `sectionMap` in `analysis.service.ts` `getResumePreview`. */
const CANONICAL_SECTION_COLORS: Record<string, string> = {
  summary: "#6366f1",
  experience: "#22c55e",
  skills: "#f59e0b",
  education: "#3b82f6",
  projects: "#ec4899",
  certifications: "#8b5cf6",
};

/** Same hex values as the highlight pill toggles and `HighlightedText` marks. */
const HIGHLIGHT_MODE_COLORS: Record<"tech" | "soft" | "verbs" | "dynamic", string> = {
  tech: "#6366f1",
  soft: "#22c55e",
  verbs: "#f59e0b",
  dynamic: "#ec4899",
};

function resolveSectionColor(name: string, serverFallback: string): string {
  const key = name.trim().toLowerCase();
  return CANONICAL_SECTION_COLORS[key] ?? serverFallback;
}

function countNonEmptyPreviewSections(sections: ResumePreview["sections"] | undefined): number {
  return (sections ?? []).filter((s) => (s.content ?? "").trim().length > 0).length;
}

function HighlightedText({ text, keywords, color }: { text: string; keywords: string[]; color: string }) {
  if (!keywords.length) return <span>{text}</span>;

  // Build a regex that matches WHOLE WORDS only (word boundaries prevent
  // matching "R" inside "university" or "C" inside "inci")
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Sort longest-first so "React Native" matches before "React"
  escaped.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((k) => k.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="rounded px-0.5" style={{ backgroundColor: color + "30", color, fontWeight: 600 }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

export function VisualizationsPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<"tech" | "soft" | "verbs" | "dynamic">("tech");
  // True when the user opts into demo data so they can verify the UI
  // pipeline without depending on backend response.
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    resumeApi.getHistory().then((data) => {
      if (cancelled) return;
      setResumes(data);
      if (data.length > 0) setSelectedResumeId(data[0].id);
    }).catch(() => {}).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Auto-fetch visualization when resume selection changes
  useEffect(() => {
    if (!selectedResumeId) return;
    if (isDemo) return; // skip network when in demo mode
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setIsPreviewLoading(true);
    resumeApi.getResumePreview(selectedResumeId)
      .then((r) => {
        if (cancelled) return;
        setPreview(r);
        if (r.parsingFailed) {
          toast.error("Parsing error: we could not read usable text from this resume file.", { id: "viz-parse", duration: 6500 });
          return;
        }
        const wc = r.extractedWordCount ?? r.wordCount ?? 0;
        if (!r.needsAnalysis && wc > 0 && wc <= 50) {
          toast.warning(
            `Only ${wc} words were extracted from this PDF — results may be unreliable. Try a text-based PDF from Word or Google Docs.`,
            { id: "viz-wc", duration: 6000 },
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.response?.data?.message || "Failed to load visualization data";
        setPreviewError(msg);
        toast.error(msg, { id: "viz" });
      })
      .finally(() => { if (!cancelled) setIsPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedResumeId, isDemo]);

  const handleLoad = async () => {
    if (!selectedResumeId) return;
    if (isDemo) {
      setPreview(DEMO_PREVIEW);
      toast.success("Loaded demo data — switch off to see your real resume", { id: "viz" });
      return;
    }
    setIsPreviewLoading(true);
    setPreviewError(null);
    toast.loading("Refreshing…", { id: "viz" });
    try {
      const r = await resumeApi.getResumePreview(selectedResumeId);
      setPreview(r);
      if (r.parsingFailed) {
        toast.error("Parsing error: we could not read usable text from this resume file.", { id: "viz", duration: 6500 });
      } else if (r.needsAnalysis) {
        toast.info("Analyze your resume first to unlock full visualizations", { id: "viz" });
      } else if (r.fileAvailable === false) {
        toast.success(`Loaded ${r.topSkills.length} skills from your stored analysis`, { id: "viz" });
      } else {
        const wc = r.extractedWordCount ?? r.wordCount ?? 0;
        if (wc > 0 && wc <= 50) {
          toast.warning(
            `Only ${wc} words were extracted — visualization quality may be poor. Prefer a text-based PDF.`,
            { id: "viz-wc", duration: 6000 },
          );
        }
        toast.success(
          `${r.wordCount} words parsed, ${countNonEmptyPreviewSections(r.sections)} sections found!`,
          { id: "viz" },
        );
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      const msg = e?.response?.data?.message || "Failed to load visualization data";
      setPreviewError(msg);
      toast.error(msg, { id: "viz" });
    }
    finally { setIsPreviewLoading(false); }
  };

  const toggleDemo = () => {
    setIsDemo((prev) => {
      const next = !prev;
      if (next) {
        setPreview(DEMO_PREVIEW);
        setPreviewError(null);
        toast.success("Demo data on — UI rendering with sample resume", { id: "viz" });
      } else {
        setPreview(null);
        toast.message("Demo data off — fetching your real resume", { id: "viz" });
      }
      return next;
    });
  };

  // ── Empty-state detection ──
  // The backend can legitimately return an "empty" preview in two cases:
  //   1) `needsAnalysis: true` (no analysis yet) → handled with its own card below
  //   2) `fileAvailable: false` + populated stored keywords → handled with a banner
  // But there's a third "broken" case the screenshots showed: response has no
  // skills, no text, no sections, AND no fileAvailable/needsAnalysis flags
  // (e.g. legacy backend deploy, or extraction succeeded with junk content).
  // In that case we render a single helpful empty state instead of four
  // separate sub-cards each saying "no data" — which looked broken to users.
  const isEffectivelyEmpty = useMemo(() => {
    if (!preview) return false;
    if (preview.parsingFailed) return false;
    if (preview.needsAnalysis) return false;
    const noSkills = (preview.topSkills?.length ?? 0) === 0;
    const noText = !preview.fullText || preview.fullText.trim().length === 0;
    const noSections = countNonEmptyPreviewSections(preview.sections) === 0;
    const noHighlights =
      (preview.highlights?.techKeywords?.length ?? 0) === 0 &&
      (preview.highlights?.softSkills?.length ?? 0) === 0 &&
      (preview.highlights?.actionVerbs?.length ?? 0) === 0 &&
      (preview.highlights?.dynamicSkills?.length ?? 0) === 0;
    return noSkills && noText && noSections && noHighlights;
  }, [preview]);

  // Skills for highlighting (safe access)
  const highlightKeywords = useMemo(() => {
    if (!preview?.highlights) return [];
    switch (activeHighlight) {
      case "tech": return preview.highlights.techKeywords ?? [];
      case "soft": return preview.highlights.softSkills ?? [];
      case "verbs": return preview.highlights.actionVerbs ?? [];
      case "dynamic": return preview.highlights.dynamicSkills ?? [];
    }
  }, [preview, activeHighlight]);

  const displayedSections = useMemo(
    () => (preview?.sections ?? []).filter((s) => (s.content ?? "").trim().length > 0),
    [preview?.sections],
  );

  const topBarSkills = useMemo(() => {
    const raw = preview?.topSkills ?? [];
    return raw.slice(0, 10).map((t) => ({
      skill: t.skill,
      count: Math.max(0, Math.round(Number(t.count)) || 0),
    }));
  }, [preview?.topSkills]);

  const barCountMax = useMemo(
    () => Math.max(1, ...topBarSkills.map((d) => d.count)),
    [topBarSkills],
  );

  const barXTicks = useMemo(() => {
    const m = barCountMax;
    if (m <= 10) return Array.from({ length: m + 1 }, (_, i) => i);
    const step = Math.max(1, Math.ceil(m / 8));
    const ticks: number[] = [0];
    for (let v = step; v < m; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== m) ticks.push(m);
    return ticks;
  }, [barCountMax]);

  const highlightColor = HIGHLIGHT_MODE_COLORS[activeHighlight];

  if (isLoading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>;

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Eye className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">No Resumes Found</h2>
        <Link to="/upload"><Button className="gap-2"><Upload className="h-4 w-4" /> Upload Resume</Button></Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Resume Visualizations</h1>
        <p className="text-gray-500 dark:text-gray-400">Skills cloud, top technologies, and highlighted resume preview</p>
      </motion.div>

      {/* Controls */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <label className="text-xs font-medium text-gray-500">Select Resume</label>
              <select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                disabled={isDemo}
                className="flex h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName} — {new Date(r.createdAt).toLocaleDateString()}</option>)}
              </select>
            </div>
            <Button
              onClick={toggleDemo}
              variant={isDemo ? "default" : "outline"}
              className="w-full gap-2 sm:w-auto sm:shrink-0"
              title="Render the page with sample data so you can verify UI components"
            >
              <FlaskConical className="h-4 w-4" /> {isDemo ? "Demo: ON" : "Try demo data"}
            </Button>
            <Button onClick={handleLoad} isLoading={isPreviewLoading} className="w-full gap-2 shadow-lg shadow-brand-500/25 sm:w-auto sm:shrink-0">
              <Eye className="h-4 w-4" /> {preview ? "Refresh" : "Visualize"}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Loading skeleton */}
      {isPreviewLoading && !preview && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-6">
                <div className="h-5 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Error state — request failed */}
      {!isPreviewLoading && previewError && !preview && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/20">
                <AlertCircle className="h-7 w-7 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Couldn't load visualization</h3>
              <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{previewError}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button onClick={handleLoad} variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Try again
                </Button>
                <Link to="/upload">
                  <Button className="gap-2"><Upload className="h-4 w-4" /> Upload new resume</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Needs-analysis state — resume in DB but never analyzed AND file is gone */}
      {preview && preview.needsAnalysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/20">
                <Sparkles className="h-7 w-7 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Analyze your resume first</h3>
              <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
                We couldn't read your resume file (it may have expired on the server). Run analysis once to unlock the
                skills cloud, top technologies, and AI-highlighted preview here.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Link to={`/analysis?resumeId=${selectedResumeId}`}>
                  <Button className="gap-2"><Sparkles className="h-4 w-4" /> Run analysis</Button>
                </Link>
                <Link to="/upload">
                  <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Upload new resume</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* File-unavailable banner (preview still works from stored analysis) */}
      {preview && !preview.needsAnalysis && !isEffectivelyEmpty && preview.fileAvailable === false && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-900/10">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">Limited preview (file not on server)</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                The PDF isn’t on the server anymore (common on serverless hosting). Charts use your stored analysis.
                Run <strong>Analyze</strong> on a text-based PDF so we can save full text to your profile for highlights and accurate word counts next time.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {preview?.usedStoredResumeText && preview.fileAvailable && !preview.parsingFailed && !isDemo && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900/40 dark:bg-sky-900/10">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sky-900 dark:text-sky-100">Using saved resume text</p>
              <p className="text-xs text-sky-800/90 dark:text-sky-200/90">
                Highlights and soft-skill detection use the text stored from your last analysis (same text that was scored). Re-analyze after you change the PDF to refresh this copy.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Demo-mode banner */}
      {isDemo && preview && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm dark:border-purple-900/40 dark:bg-purple-900/10">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-purple-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-purple-800 dark:text-purple-200">Demo data is active</p>
              <p className="text-xs text-purple-700/80 dark:text-purple-300/80">
                You're seeing a sample resume so you can confirm charts, skills cloud and highlights work.
                Click <span className="font-semibold">Demo: ON</span> again to switch back to your real resume.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Unified empty state — covers legacy/broken responses and ensures the
          page never shows four separate "no data" sub-cards. */}
      {preview && !preview.needsAnalysis && isEffectivelyEmpty && !isDemo && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/20">
                <AlertCircle className="h-7 w-7 text-amber-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No visualization data for this resume</h3>
                <p className="mx-auto max-w-md text-sm text-gray-500 dark:text-gray-400">
                  We couldn't load any skills, technologies or text for the selected resume. The most common causes are:
                </p>
              </div>
              <ul className="mx-auto max-w-md space-y-1.5 text-left text-xs text-gray-500 dark:text-gray-400">
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" /> The original file expired on the server (Vercel /tmp is ephemeral).</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" /> The resume is image-based / scanned and text extraction returned nothing.</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" /> The analysis hasn't completed for this resume yet.</li>
              </ul>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Link to={`/analysis?resumeId=${selectedResumeId}`}>
                  <Button className="gap-2"><Sparkles className="h-4 w-4" /> Run analysis</Button>
                </Link>
                <Link to="/upload">
                  <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Re-upload as text PDF</Button>
                </Link>
                <Button variant="ghost" onClick={toggleDemo} className="gap-2">
                  <FlaskConical className="h-4 w-4" /> Try demo data
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {preview && !preview.needsAnalysis && !isEffectivelyEmpty && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

          {!preview.parsingFailed && (
          <>
          {/* ═══ SKILLS CLOUD ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-500" /> Detected Skills Cloud</CardTitle>
              <CardDescription>{preview.topSkills.length} skills detected — size = frequency in resume</CardDescription>
            </CardHeader>
            <CardContent className="min-h-[300px]">
              {preview.topSkills.length > 0 ? (
                <div className="flex min-h-[260px] flex-wrap items-center justify-center gap-2 py-4">
                  {preview.topSkills.map((s, i) => {
                    const n = Math.max(0, Math.round(Number(s.count)) || 0);
                    const maxCount = Math.max(
                      1,
                      ...preview.topSkills.map((t) => Math.max(0, Math.round(Number(t.count)) || 0)),
                    );
                    const size = 0.75 + (n / maxCount) * 1.2; // 0.75rem to 1.95rem
                    const tip =
                      n === 1
                        ? `${s.skill}: found 1 time in this resume`
                        : `${s.skill}: found ${n} times in this resume`;
                    return (
                      <motion.span key={s.skill}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.04, type: "spring" }}
                        className="cursor-default rounded-full px-3 py-1 font-semibold transition-transform hover:scale-110"
                        style={{
                          fontSize: `${size}rem`,
                          color: SKILL_COLORS[i % SKILL_COLORS.length],
                          backgroundColor: SKILL_COLORS[i % SKILL_COLORS.length] + "15",
                        }}
                        title={tip}
                      >
                        {s.skill}
                      </motion.span>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Sparkles className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-500">No skills detected. Try analyzing your resume first, then revisit this page.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ TOP TECHNOLOGIES BAR CHART ═══ */}
          <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
            <Card className="min-h-[380px] min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 text-purple-500" /> Top Technologies</CardTitle>
              </CardHeader>
              <CardContent className="min-h-[300px] min-w-0">
                {(preview.topSkills?.length ?? 0) > 0 ? (
                  <RechartsSafeContainer>
                    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                      <BarChart data={topBarSkills} layout="vertical" barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.35} />
                        <XAxis
                          type="number"
                          domain={[0, barCountMax]}
                          ticks={barXTicks}
                          allowDecimals={false}
                          tickFormatter={(v) => String(Math.round(Number(v)))}
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                        />
                        <YAxis type="category" dataKey="skill" width={100} tick={{ fill: "#6b7280", fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: 12 }} />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Mentions">
                          {topBarSkills.map((_, i) => (
                            <Cell key={i} fill={SKILL_COLORS[i % SKILL_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </RechartsSafeContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Code2 className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500">No technology data to chart yet.</p>
                    <p className="mt-1 text-xs text-gray-400">Analyze your resume first to populate this chart.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Industry + Stats */}
            <Card className="min-h-[380px] min-w-0">
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="min-h-[300px] space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-brand-50 p-3 text-center dark:bg-brand-900/20">
                    <FileText className="mx-auto mb-1 h-5 w-5 text-brand-500" />
                    <p className="text-2xl font-bold text-brand-600">{preview.wordCount || 0}</p>
                    <p className="text-[10px] text-gray-500">Words</p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-3 text-center dark:bg-green-900/20">
                    <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-green-500" />
                    <p className="text-2xl font-bold text-green-600">{displayedSections.length}</p>
                    <p className="text-[10px] text-gray-500">Sections</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 p-3 text-center dark:bg-purple-900/20">
                    <Zap className="mx-auto mb-1 h-5 w-5 text-purple-500" />
                    <p className="text-2xl font-bold text-purple-600">{preview.highlights?.techKeywords?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Tech Skills</p>
                  </div>
                  <div className="rounded-xl bg-pink-50 p-3 text-center dark:bg-pink-900/20">
                    <Heart className="mx-auto mb-1 h-5 w-5 text-pink-500" />
                    <p className="text-2xl font-bold text-pink-600">{preview.highlights?.softSkills?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Soft Skills</p>
                  </div>
                </div>

                {/* Detected Industry */}
                <div className="rounded-xl bg-gradient-to-r from-brand-50 to-purple-50 p-4 dark:from-brand-900/20 dark:to-purple-900/20">
                  <p className="text-xs text-gray-500">Detected Field</p>
                  <p className="text-lg font-bold text-brand-600">{preview.industryClassification?.primary || "General"}</p>
                  {(preview.industryClassification?.industries ?? []).slice(0, 2).map((ind) => (
                    <div key={ind.name} className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">{ind.name}</span>
                      <Badge variant={ind.confidence >= 30 ? "success" : "secondary"}>{ind.confidence}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          </>
          )}

          {/* ═══ RESUME PREVIEW WITH HIGHLIGHTS ═══ */}
          {preview.fileAvailable !== false && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-brand-500" /> Resume Preview — AI Highlighted</CardTitle>
                  <CardDescription>
                    {preview.parsingFailed
                      ? "Parsing error — fix the PDF and re-analyze to restore highlights."
                      : "See what AI detects in your resume. Click a category to highlight."}
                  </CardDescription>
                </div>
                {/* Highlight toggles */}
                {!preview.parsingFailed && (
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "tech" as const, label: "Tech Skills", count: preview.highlights?.techKeywords?.length ?? 0, icon: Code2 },
                    { key: "soft" as const, label: "Soft Skills", count: preview.highlights?.softSkills?.length ?? 0, icon: Heart },
                    { key: "verbs" as const, label: "Action Verbs", count: preview.highlights?.actionVerbs?.length ?? 0, icon: Zap },
                    { key: "dynamic" as const, label: "NLP Detected", count: preview.highlights?.dynamicSkills?.length ?? 0, icon: Sparkles },
                  ]).map((h) => {
                    const color = HIGHLIGHT_MODE_COLORS[h.key];
                    return (
                    <button key={h.key}
                      onClick={() => setActiveHighlight(h.key)}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        activeHighlight === h.key
                          ? "shadow-md"
                          : "opacity-60 hover:opacity-100"}`}
                      style={{
                        borderColor: activeHighlight === h.key ? color : "#d1d5db",
                        backgroundColor: activeHighlight === h.key ? color + "15" : "transparent",
                        color,
                      }}>
                      <h.icon className="h-3 w-3" />
                      {h.label} ({h.count})
                    </button>
                    );
                  })}
                </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Section tabs */}
              {displayedSections.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {displayedSections.map((s) => {
                    const chipColor = resolveSectionColor(s.name, s.color);
                    return (
                      <span key={s.name} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: chipColor }}>
                        <BookOpen className="h-3 w-3" />
                        {s.name}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Resume text with highlighted sections */}
              <div className="viz-preview-scroll max-h-[600px] space-y-4 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-5 font-mono text-xs leading-relaxed dark:border-gray-700 dark:bg-gray-900">
                {displayedSections.length > 0 ? (
                  displayedSections.map((section) => {
                    const sectionColor = resolveSectionColor(section.name, section.color);
                    return (
                    <div key={section.name}>
                      {/* Section header */}
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: sectionColor }} />
                        <span className="text-sm font-bold" style={{ color: sectionColor }}>{section.name}</span>
                      </div>
                      {/* Section content with keyword highlights */}
                      <div className="ml-5 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {preview.parsingFailed ? (
                          <p className="text-sm leading-relaxed">{section.content}</p>
                        ) : (
                          <HighlightedText text={section.content} keywords={highlightKeywords} color={highlightColor} />
                        )}
                      </div>
                    </div>
                    );
                  })
                ) : (
                  /* Fallback: show full text */
                  <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                    {preview.fullText ? (
                      <HighlightedText text={preview.fullText} keywords={highlightKeywords} color={highlightColor} />
                    ) : (
                      <p className="py-4 text-center text-sm text-gray-400">No resume text available. The file may not be accessible — try re-uploading.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Legend */}
              {!preview.parsingFailed && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-500">
                <mark className="rounded px-1" style={{ backgroundColor: highlightColor + "30", color: highlightColor }}>highlighted</mark>
                = AI detected {activeHighlight === "tech" ? "technical skills" : activeHighlight === "soft" ? "soft skills" : activeHighlight === "verbs" ? "action verbs" : "NLP-extracted skills"}
              </div>
              )}
            </CardContent>
          </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
