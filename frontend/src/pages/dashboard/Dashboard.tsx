import { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  TrendingUp,
  Award,
  Target,
  Upload,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AtsScoreChart } from "@/components/charts/AtsScoreChart";
import { SkillsRadarChart } from "@/components/charts/SkillsRadarChart";
import { useAuth } from "@/hooks/useAuth";
import { resumeApi } from "@/api/resume";
import type { Resume } from "@/types";
import { getDashboardListBarColor, getScoreLabel } from "@/utils/constants";
import { SkeletonDashboard } from "@/components/ui/skeleton";

function AnimatedCounter({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || value === 0) {
      setDisplay(value);
      return;
    }

    hasAnimated.current = true;
    const steps = 30;
    const stepTime = (duration * 1000) / steps;
    let current = 0;

    const timer = setInterval(() => {
      current++;
      setDisplay(Math.round((current / steps) * value));
      if (current >= steps) {
        clearInterval(timer);
        setDisplay(value);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span ref={ref}>{display}</span>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

/** Latest activity wins so re-analyzed resumes surface ahead of newer uploads with stale scores. */
function resumeRecencyMs(r: Resume): number {
  const analysisT = r.analysis?.updatedAt ? new Date(r.analysis.updatedAt).getTime() : 0;
  const resumeT = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
  const created = new Date(r.createdAt).getTime();
  return Math.max(analysisT, resumeT, created);
}

export function DashboardPage() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await resumeApi.getHistory();
        setResumes(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("[Dashboard] Failed to load resumes:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const safeResumes = Array.isArray(resumes) ? resumes : [];
  const sortedResumes = useMemo(
    () => [...safeResumes].sort((a, b) => resumeRecencyMs(b) - resumeRecencyMs(a)),
    [safeResumes],
  );
  const latestResume = sortedResumes[0];
  const analysis = latestResume?.analysis;
  const averageScore =
    safeResumes.length > 0
      ? Math.round(
          safeResumes.reduce((acc, r) => acc + (r.atsScore || 0), 0) /
            safeResumes.length
        )
      : 0;
  const bestScore =
    safeResumes.length > 0
      ? Math.max(...safeResumes.map((r) => r.atsScore || 0))
      : 0;

  const stats = [
    {
      label: "Total Resumes",
      value: safeResumes.length,
      icon: FileText,
      gradient: "from-blue-500 to-cyan-500",
      bg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Overall Average",
      value: averageScore,
      suffix: "%",
      icon: TrendingUp,
      gradient: "from-green-500 to-emerald-500",
      bg: "bg-green-500/10",
      iconColor: "text-green-500",
    },
    {
      label: "Best Score",
      value: bestScore,
      suffix: "%",
      icon: Award,
      gradient: "from-yellow-500 to-orange-500",
      bg: "bg-yellow-500/10",
      iconColor: "text-yellow-500",
    },
    {
      label: "Job Match",
      value: analysis?.jobMatchScore || 0,
      suffix: analysis?.jobMatchScore ? "%" : "",
      icon: Target,
      gradient: "from-purple-500 to-pink-500",
      bg: "bg-purple-500/10",
      iconColor: "text-purple-500",
    },
  ];

  if (isLoading) {
    return <SkeletonDashboard />;
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Welcome Banner */}
      <motion.div variants={itemVariants}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome back, {user?.name?.split(" ")[0] || "User"}!{" "}
              <motion.span
                animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
                transition={{ duration: 2, delay: 0.5 }}
                className="inline-block"
              >
                👋
              </motion.span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Here's an overview of your resume analytics
            </p>
          </div>
          <Link to="/upload">
            <Button className="gap-2 shadow-lg shadow-brand-500/25">
              <Upload className="h-4 w-4" />
              Upload Resume
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-indigo-500/30">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-5`}
              />
              <CardContent className="flex items-center gap-4 p-6">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg} transition-transform duration-300 group-hover:scale-110`}
                >
                  <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {stat.label}
                  </p>
                  {stat.value > 0 || stat.suffix === "%" ? (
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      <AnimatedCounter value={stat.value} duration={2} />
                      {stat.suffix}
                    </p>
                  ) : stat.label === "Job Match" ? (
                    /* Valid <a> only — no nested <button> (breaks navigation / HTML) */
                    <motion.span
                      className="mt-1 inline-block"
                      animate={{
                        boxShadow: [
                          "0 0 15px rgba(168,85,247,0.25)",
                          "0 0 25px rgba(168,85,247,0.45)",
                          "0 0 15px rgba(168,85,247,0.25)",
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Link
                        to="/job-match"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/40 hover:brightness-110"
                      >
                        <Target className="h-3 w-3" />
                        Optimize for a Role
                      </Link>
                    </motion.span>
                  ) : (
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">N/A</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      {latestResume != null && latestResume.atsScore != null && latestResume.atsScore > 0 ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <motion.div variants={itemVariants} className="min-w-0">
            <AtsScoreChart score={latestResume.atsScore} />
          </motion.div>
          <motion.div variants={itemVariants} className="min-w-0">
            <SkillsRadarChart
              skills={analysis?.skillsScore || 0}
              experience={analysis?.experienceScore || 0}
              education={analysis?.educationScore || 0}
              projects={analysis?.projectsScore || 0}
              headlineAts={latestResume.atsScore ?? null}
            />
          </motion.div>
        </div>
      ) : (
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 to-purple-50 dark:from-brand-900/10 dark:to-purple-900/10" />
            <CardContent className="relative flex flex-col items-center justify-center py-16">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="mb-4 h-16 w-16 text-brand-400" />
              </motion.div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                No Resumes Yet
              </h3>
              <p className="mb-6 text-gray-500 dark:text-gray-400">
                Upload your first resume to see analytics
              </p>
              <Link to="/upload">
                <Button className="gap-2 shadow-lg shadow-brand-500/25">
                  <Upload className="h-4 w-4" />
                  Upload Resume
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent Resumes */}
      {safeResumes.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Resumes</CardTitle>
                <Link to="/history">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    View All
                    <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedResumes.slice(0, 5).map((resume, i) => (
                  <motion.div
                    key={resume.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                  >
                    <Link to={`/analysis?resumeId=${resume.id}`}>
                      <div className="group flex items-center justify-between rounded-lg border border-gray-100 p-4 transition-all hover:border-brand-200 hover:bg-brand-50/30 dark:border-gray-700 dark:hover:border-brand-800 dark:hover:bg-brand-900/10">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 transition-transform group-hover:scale-110 dark:bg-brand-900/30">
                            <FileText className="h-5 w-5 text-brand-500" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {resume.fileName || "Resume"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(resume.createdAt).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="hidden sm:block">
                            <Progress
                              value={resume.atsScore || 0}
                              className="w-24"
                              size="sm"
                              barColor={getDashboardListBarColor(resume.atsScore || 0)}
                            />
                          </div>
                          <Badge
                            variant={
                              (resume.atsScore || 0) >= 71
                                ? "success"
                                : (resume.atsScore || 0) >= 41
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {resume.atsScore || 0}% —{" "}
                            {getScoreLabel(resume.atsScore || 0)}
                          </Badge>
                          <ArrowUpRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-500" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
