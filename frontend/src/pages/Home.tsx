import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPlatformStatsOnce, type PlatformStatsPayload } from "@/api/platformStats";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Briefcase,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  Shield,
  Star,
  ChevronRight,
  Upload,
  BarChart3,
  Mic,
  PenLine,
  Target,
  FileText,
  AlertTriangle,
  Lock,
  Github,
  Linkedin,
  Twitter,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ═══════════════════════════════════════════════════════════════════
 * Shared animation helpers
 * ═══════════════════════════════════════════════════════════════════ */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6 } }),
};

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <motion.section
      id={id}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={[className, id ? "scroll-mt-28 sm:scroll-mt-32" : ""].filter(Boolean).join(" ")}
    >
      {children}
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * PLG Dropzone Hook — 3-state interactive component
 * ═══════════════════════════════════════════════════════════════════ */
type DropState = "idle" | "scanning" | "result";

function ResumeDropzone() {
  const [state, setState] = useState<DropState>("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (state !== "idle") return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file");
      return;
    }
    setFileName(file.name);
    setState("scanning");
    setScanProgress(0);
  }, [state]);

  // Drag & Drop handlers
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const onDragLeave = useCallback(() => setIsDragOver(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // File input handler
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Scan animation — 3 seconds
  useEffect(() => {
    if (state !== "scanning") return;
    const start = Date.now();
    const duration = 3000;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / duration, 1);
      setScanProgress(pct);
      if (pct < 1) requestAnimationFrame(tick);
      else setState("result");
    };
    requestAnimationFrame(tick);
  }, [state]);

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className="mx-auto mt-16 max-w-3xl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={onFileChange}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {/* ── STATE 1: Idle Dropzone ── */}
        {state === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`group cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
              isDragOver
                ? "border-indigo-400 bg-indigo-500/10 scale-[1.02]"
                : "border-indigo-500/30 bg-indigo-500/[0.04] hover:border-indigo-500/50 hover:bg-indigo-500/[0.07]"
            }`}
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10"
            >
              <Upload className="h-7 w-7 text-indigo-400" />
            </motion.div>
            <p className="mb-1 text-base font-semibold text-gray-200">
              {isDragOver ? "Drop your PDF here!" : "Drop your Resume PDF here for a free AI scan"}
            </p>
            <p className="text-sm text-gray-500">
              or click to browse files (PDF only)
            </p>
          </motion.div>
        )}

        {/* ── STATE 2: Scanning ── */}
        {state === "scanning" && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900/80 p-10 text-center"
          >
            {/* Laser scan line */}
            <motion.div
              className="pointer-events-none absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_15px_3px_rgba(99,102,241,0.5)]"
              animate={{ top: ["10%", "90%", "10%"] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="relative">
              <FileText className="mx-auto mb-4 h-14 w-14 text-indigo-400/60" />
              <p className="mb-1 text-base font-semibold text-gray-200">
                Scanning your resume…
              </p>
              {fileName && (
                <p className="mb-3 text-xs text-indigo-400">{fileName}</p>
              )}
              {/* Progress bar */}
              <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  style={{ width: `${scanProgress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">{Math.round(scanProgress * 100)}% — Analyzing keywords, sections, ATS compatibility…</p>
            </div>
          </motion.div>
        )}

        {/* ── STATE 3: Free teaser + blurred gated details ── */}
        {state === "result" && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4 }}
            className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900/80"
          >
            {/* ── UNBLURRED TEASER — free value ── */}
            <div className="p-6 pb-5">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex flex-col items-center gap-5 sm:flex-row sm:items-start"
              >
                {/* ATS Score Ring */}
                <div className="relative flex-shrink-0">
                  <svg width="100" height="100" className="-rotate-90">
                    <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" className="text-white/[0.06]" />
                    <motion.circle
                      cx="50" cy="50" r="40" stroke="#f97316" strokeWidth="8" fill="none" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 40}
                      initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - 0.48) }}
                      transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-orange-400">48%</span>
                    <span className="text-[9px] text-gray-500">ATS Score</span>
                  </div>
                </div>

                {/* Summary text */}
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-base font-semibold text-white">Basic scan complete</p>
                  {fileName && <p className="mt-0.5 text-xs text-indigo-400">{fileName}</p>}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-400" />
                      <span className="text-gray-300">Formatting is readable by ATS systems</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-400" />
                      <span className="text-gray-300">Contact information detected</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
                      <span className="text-gray-300">Multiple issues found — see full report below</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Divider */}
            <div className="mx-6 border-t border-white/[0.06]" />

            {/* ── BLURRED GATED SECTION — detailed errors behind paywall ── */}
            <div className="relative">
              {/* Blurred content */}
              <div className="pointer-events-none select-none space-y-3 p-6 blur-[5px]">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Detailed Analysis</p>
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3">
                  <div className="h-5 w-5 rounded-full bg-red-500/30" />
                  <span className="text-sm text-red-300">Missing 5 critical keywords (Python, React, AWS…)</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3">
                  <div className="h-5 w-5 rounded-full bg-red-500/30" />
                  <span className="text-sm text-red-300">Action verbs missing in Experience section</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3">
                  <div className="h-5 w-5 rounded-full bg-amber-500/30" />
                  <span className="text-sm text-amber-300">No quantified metrics found in bullet points</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3">
                  <div className="h-5 w-5 rounded-full bg-amber-500/30" />
                  <span className="text-sm text-amber-300">Resume exceeds recommended 2-page length</span>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="h-2 w-full rounded bg-white/10" />
                  <div className="h-2 w-4/5 rounded bg-white/10" />
                </div>
              </div>

              {/* CTA overlay — only covers the blurred section */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-[1px]">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-center"
                >
                  <p className="mb-1 text-sm font-semibold text-white">🔒 Full report locked</p>
                  <p className="mb-4 text-xs text-gray-400">Sign up to see all errors, missing keywords, and AI suggestions</p>
                  <Link to="/register">
                    <Button size="lg" className="gap-2 px-8 shadow-xl shadow-indigo-500/30 transition-shadow hover:shadow-2xl hover:shadow-indigo-500/50">
                      <Lock className="h-4 w-4" />
                      Create Free Account to Unlock Full Report
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Glow under dropzone */}
      <div className="mx-auto -mt-8 h-16 w-2/3 rounded-full bg-indigo-500/15 blur-3xl" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * Data
 * ═══════════════════════════════════════════════════════════════════ */
const features = [
  {
    icon: BarChart3,
    title: "ATS Scoring",
    desc: "Get an instant ATS compatibility score with section-by-section breakdowns, keyword analysis, and AI-powered improvement suggestions.",
    gradient: "from-indigo-500 to-blue-500",
    span: "md:col-span-2",
  },
  {
    icon: Briefcase,
    title: "Job Match & Skill Gap",
    desc: "Paste any job description and instantly see which skills you have, which you're missing, and how to close the gap.",
    gradient: "from-purple-500 to-pink-500",
    span: "",
  },
  {
    icon: PenLine,
    title: "AI Cover Letter Gen",
    desc: "One click generates a tailored, professional cover letter that references your exact skills and the target role.",
    gradient: "from-amber-500 to-orange-500",
    span: "",
  },
  {
    icon: Mic,
    title: "Mock Interview Prep",
    desc: "AI generates personalized interview questions based on your resume, then evaluates your answers with real-time coaching.",
    gradient: "from-emerald-500 to-teal-500",
    span: "md:col-span-2",
  },
];

const steps = [
  { num: "01", icon: Upload, title: "Upload Your Resume", desc: "Drag & drop your PDF — we extract every detail in seconds." },
  { num: "02", icon: Sparkles, title: "AI Analyzes It", desc: "Gemini AI scores every section, finds missing keywords, and generates improvement suggestions." },
  { num: "03", icon: Target, title: "Get Hired", desc: "Match with jobs, prep for interviews, and land offers faster." },
];

/** If /api/platform-stats fails, these values keep the section usable (not broken UI). */
const FALLBACK_PLATFORM_STATS = {
  users: 0,
  resumesAnalyzed: 0,
  accuracy: 98,
  rating: 4.9,
} as const;

/* ═══════════════════════════════════════════════════════════════════
 * Page
 * ═══════════════════════════════════════════════════════════════════ */
export function HomePage() {
  // --- Platform stats: live from GET /api/platform-stats (Prisma user + resume counts) ---
  const [platformStats, setPlatformStats] = useState<PlatformStatsPayload>({ ...FALLBACK_PLATFORM_STATS });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingStats(true);
    fetchPlatformStatsOnce()
      .then((d) => {
        if (cancelled) return;
        setPlatformStats({
          users: d.users != null && Number.isFinite(Number(d.users)) ? Number(d.users) : FALLBACK_PLATFORM_STATS.users,
          resumesAnalyzed:
            d.resumesAnalyzed != null && Number.isFinite(Number(d.resumesAnalyzed))
              ? Number(d.resumesAnalyzed)
              : FALLBACK_PLATFORM_STATS.resumesAnalyzed,
          accuracy:
            d.accuracy != null && Number.isFinite(Number(d.accuracy))
              ? Number(d.accuracy)
              : FALLBACK_PLATFORM_STATS.accuracy,
          rating:
            d.rating != null && Number.isFinite(Number(d.rating))
              ? Number(d.rating)
              : FALLBACK_PLATFORM_STATS.rating,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load platform stats:", error);
        setPlatformStats({ ...FALLBACK_PLATFORM_STATS });
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toString();
  };

  const dynamicStats: { value: string; label: string; loading?: boolean }[] = [
    {
      value: isLoadingStats ? "" : `${formatNumber(platformStats.resumesAnalyzed)}+`,
      label: "Resumes Analyzed",
      loading: isLoadingStats,
    },
    {
      value: isLoadingStats ? "" : `${platformStats.accuracy}%`,
      label: "ATS Accuracy",
      loading: isLoadingStats,
    },
    {
      value: isLoadingStats ? "" : `${formatNumber(platformStats.users)}+`,
      label: "Users",
      loading: isLoadingStats,
    },
    {
      value: isLoadingStats ? "" : `${platformStats.rating}★`,
      label: "User Rating",
      loading: isLoadingStats,
    },
  ];
  // --- Dynamic Stats End ---

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-slate-950 text-white selection:bg-indigo-500/30">
      {/* ── FLOATING NAVBAR ─────────────────────────────────────── */}
      <nav className="fixed inset-x-0 top-4 z-50 mx-auto max-w-6xl px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-slate-900/70 px-5 py-3 shadow-xl shadow-black/20 backdrop-blur-xl">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">
              Resume<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AI</span>
            </span>
          </Link>

          {/* Center links — hidden on mobile */}
          <div className="hidden items-center gap-6 text-sm text-gray-400 md:flex">
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-white">
              How it Works
            </a>
            <a href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </a>
          </div>

          {/* Auth buttons — clear Sign In + Sign Up */}
          <div className="flex items-center gap-2">
            <Link to="/login">
              <button className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white">
                Sign In
              </button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="gap-1.5 shadow-lg shadow-indigo-500/25">
                Sign Up <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-3 pb-10 pt-36 sm:px-4 md:px-6 lg:px-8 lg:pt-44">
        {/* Ambient glow orbs */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="absolute -right-40 top-40 h-[400px] w-[400px] rounded-full bg-purple-600/10 blur-[100px]" />
          <div className="absolute -left-40 bottom-0 h-[400px] w-[400px] rounded-full bg-cyan-600/10 blur-[100px]" />
        </div>

        <div className="mx-auto max-w-5xl text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-sm text-indigo-300">
            <Sparkles className="h-4 w-4" /> Powered by Gemini AI <ChevronRight className="h-3 w-3" />
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
            className="mb-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-7xl">
            Get Hired Faster with{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI-Powered
            </span>{" "}
            Resume Analysis
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
            className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-300">
            Upload your resume and instantly get an ATS compatibility score, discover missing keywords,
            generate tailored cover letters, and practice with AI mock interviews — get started for free.
          </motion.p>

          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link to="/register">
              <Button size="lg" className="group gap-2 px-8 text-base shadow-xl shadow-indigo-500/25 transition-shadow hover:shadow-2xl hover:shadow-indigo-500/40">
                Start Free Today — 1 AI Scan Included
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline" className="border-white/10 bg-white/5 text-gray-300 backdrop-blur-sm hover:bg-white/10 hover:text-white">
                View Pricing
              </Button>
            </Link>
          </motion.div>

          {/* ── PLG DROPZONE HOOK ── */}
          <ResumeDropzone />
            </div>
      </section>

      {/* ── SOCIAL PROOF (Stats) ─────────────────────────────────── */}
      <Section className="border-y border-white/[0.06] bg-white/[0.02] px-3 py-14 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.p variants={fadeUp} custom={0} className="mb-8 text-center text-sm tracking-wide text-gray-500">
            TRUSTED BY PROFESSIONALS FROM TOP TECH COMPANIES
          </motion.p>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {dynamicStats.map((s, i) => (
              <motion.div key={s.label} variants={fadeUp} custom={i * 0.5} className="text-center">
                {s.loading ? (
                  <div className="mx-auto h-9 max-w-[5.5rem] rounded-md bg-white/10 motion-safe:animate-pulse" aria-hidden />
                ) : (
                  <p className="text-3xl font-extrabold text-white tabular-nums">{s.value}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FEATURES (Bento Grid) ────────────────────────────────── */}
      <Section id="features" className="px-3 py-24 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={fadeUp} custom={0} className="mb-14 text-center">
            <span className="mb-3 inline-block rounded-full bg-indigo-500/10 px-4 py-1 text-xs font-semibold tracking-wider text-indigo-400">
              FEATURES
            </span>
            <h2 className="mt-3 text-3xl font-bold lg:text-5xl">
              Everything You Need to{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Land the Job
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-300">
              Our AI analyses every facet of your resume — from ATS keywords to interview readiness — so you stand out.
            </p>
          </motion.div>

          {/* Bento Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((f, i) => (
              <motion.div key={f.title} variants={fadeUp} custom={i}
                className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-7 transition-all duration-300 hover:scale-[1.02] hover:border-indigo-500/30 hover:bg-white/[0.05] ${f.span}`}>
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient} shadow-lg`}>
                  <f.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-300">{f.desc}</p>
                <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${f.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20`} />
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <Section id="how-it-works" className="border-t border-white/[0.06] bg-white/[0.02] px-3 py-24 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.div variants={fadeUp} custom={0} className="mb-16 text-center">
            <span className="mb-3 inline-block rounded-full bg-purple-500/10 px-4 py-1 text-xs font-semibold tracking-wider text-purple-400">
              HOW IT WORKS
            </span>
            <h2 className="mt-3 text-3xl font-bold lg:text-5xl">Three Simple Steps</h2>
          </motion.div>

          <div className="relative grid gap-10 md:grid-cols-3 md:gap-6">
            <div className="pointer-events-none absolute top-14 hidden h-px w-full bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent md:block" />

            {steps.map((s, i) => (
              <motion.div key={s.num} variants={fadeUp} custom={i} className="relative text-center">
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-slate-900 shadow-xl">
                  <s.icon className="h-7 w-7 text-indigo-400" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-500/40">
                    {i + 1}
                </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mx-auto max-w-xs text-sm text-gray-300">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <Section className="px-3 py-24 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={fadeUp} custom={0} className="mb-14 text-center">
            <span className="mb-3 inline-block rounded-full bg-amber-500/10 px-4 py-1 text-xs font-semibold tracking-wider text-amber-400">
              TESTIMONIALS
            </span>
            <h2 className="mt-3 text-3xl font-bold lg:text-5xl">Loved by Job Seekers</h2>
          </motion.div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              { name: "Sarah Chen", role: "Software Engineer @ Google", text: "This tool helped me go from a 45% ATS score to 92%. I got 3x more interview callbacks in two weeks!", avatar: "SC" },
              { name: "Ahmed Khan", role: "Data Scientist @ Meta", text: "The AI mock interviews were a game-changer. I walked into my panel round fully prepared.", avatar: "AK" },
              { name: "Emily Park", role: "Product Manager @ Amazon", text: "The skill gap analysis showed me exactly what I was missing. I landed my dream PM role.", avatar: "EP" },
            ].map((t, i) => (
              <motion.div key={t.name} variants={fadeUp} custom={i}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 transition-colors hover:border-indigo-500/20">
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, j) => <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="mb-6 text-sm leading-relaxed text-gray-300">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-bold text-white">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── PRICING (in-page anchor #pricing) ───────────────────── */}
      <Section id="pricing" className="border-t border-white/[0.06] bg-white/[0.02] px-3 py-24 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.div variants={fadeUp} custom={0} className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full bg-indigo-500/10 px-4 py-1 text-xs font-semibold tracking-wider text-indigo-400">
              PRICING
            </span>
            <h2 className="mt-3 text-3xl font-bold lg:text-5xl">
              Start free,{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                upgrade when you are ready
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-300">
              One free AI scan on signup. Pro unlocks unlimited analyses, mock interviews, job match, and more.
            </p>
          </motion.div>

          <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
            <motion.div
              variants={fadeUp}
              custom={1}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-left"
            >
              <p className="text-sm font-semibold text-gray-400">Basic</p>
              <p className="mt-2 text-3xl font-extrabold text-white">Free</p>
              <p className="mt-1 text-sm text-gray-500">Try core ATS scoring and suggestions.</p>
              <Link to="/register" className="mt-6 block">
                <Button variant="outline" className="w-full border-white/10 bg-white/5 text-gray-200 hover:bg-white/10">
                  Start free
                </Button>
              </Link>
            </motion.div>
            <motion.div
              variants={fadeUp}
              custom={2}
              className="relative rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-b from-indigo-500/[0.12] to-white/[0.02] p-8 text-left shadow-lg shadow-indigo-500/15"
            >
              <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
                Best value
              </span>
              <p className="mt-1 text-sm font-semibold text-indigo-300">Pro</p>
              <p className="mt-2 text-3xl font-extrabold text-white">
                $4.99<span className="text-base font-normal text-gray-500">/mo</span>
              </p>
              <p className="mt-1 text-sm text-gray-400">Full AI suite, unlimited scans, priority support.</p>
              <Link to="/pricing" className="mt-6 block">
                <Button className="w-full gap-2 shadow-lg shadow-indigo-500/25">
                  View all plans <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </Section>

      {/* ── FINAL CTA ────────────────────────────────────────────── */}
      <Section className="relative overflow-hidden px-3 py-24 sm:px-4 md:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent" />
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[120px]" />
        </div>

        <motion.div variants={fadeUp} custom={0} className="relative mx-auto max-w-3xl text-center">
          <Shield className="mx-auto mb-6 h-12 w-12 text-indigo-400" />
          <h2 className="mb-4 text-3xl font-bold lg:text-5xl">
            Ready to Land Your{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Dream Job?
            </span>
            </h2>
          <p className="mb-10 text-lg text-gray-300">
            Join thousands of professionals who optimized their resumes with AI and started getting interview calls.
            </p>
            <Link to="/register">
            <Button size="lg" className="gap-2 px-10 text-base shadow-xl shadow-indigo-500/25 transition-shadow hover:shadow-2xl hover:shadow-indigo-500/40">
              Start Free Today — No Credit Card
              <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> 1 Free AI Scan</span>
            <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-amber-500" /> Instant results</span>
            <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-indigo-500" /> Privacy-first</span>
          </div>
          </motion.div>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-3 py-10 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">
              Resume<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Twitter"
            >
              <Twitter className="h-5 w-5" />
            </a>
            <a
              href="https://www.linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-5 w-5" />
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>

          <p className="text-center text-sm text-gray-600 sm:text-right">
            © {new Date().getFullYear()} AI Resume Analyzer. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}