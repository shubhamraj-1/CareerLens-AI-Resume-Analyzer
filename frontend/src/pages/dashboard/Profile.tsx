import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  User, Mail, Shield, Calendar, FileText, TrendingUp,
  Mic, Bell, Moon, Sun,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { resumeApi } from "@/api/resume";
import type { Resume, UserRole } from "@/types";
import { USER_ROLES } from "@/types";

function displayUserRole(role: UserRole | string | undefined): string {
  if (!role) return "Member";
  const row = USER_ROLES.find((r) => r.value === role);
  return row?.label ?? String(role).replace(/_/g, " ");
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function ProfilePage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [emailNotif, setEmailNotif] = useState(true);

  useEffect(() => {
    resumeApi.getHistory().then(setResumes).catch(() => {});
  }, []);

  const totalResumes = resumes.length;
  const avgScore =
    totalResumes > 0
      ? Math.round(resumes.reduce((a, r) => a + (r.atsScore || 0), 0) / totalResumes)
      : 0;
  const totalAnalyzed = resumes.filter((r) => r.atsScore != null && r.atsScore > 0).length;

  const profileFields = [
    { icon: User, label: "Full Name", value: user?.name || "N/A", capitalize: true },
    { icon: Mail, label: "Email", value: (user?.email || "N/A").toLowerCase(), capitalize: false },
    { icon: Shield, label: "Role", value: displayUserRole(user?.role), capitalize: false },
    {
      icon: Calendar,
      label: "Member Since",
      value: user?.createdAt
        ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "N/A",
      capitalize: false,
    },
  ];

  const stats = [
    { label: "Resumes Uploaded", value: totalResumes, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Average ATS Score", value: `${avgScore}%`, icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Resumes Analyzed", value: totalAnalyzed, icon: Mic, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-gray-500 dark:text-slate-400">Your account & platform stats</p>
      </motion.div>

      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="grid gap-6 md:grid-cols-3">

        {/* ── LEFT COLUMN (1/3) — Avatar + Account Details ── */}
        <div className="space-y-6 md:col-span-1">
          {/* Avatar Card with glowing gradient */}
          <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.05 }}>
            <Card className="relative overflow-hidden">
              {/* Subtle gradient glow behind avatar */}
              <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-3xl" />

              <CardContent className="relative flex flex-col items-center p-8 text-center">
                <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-4xl font-bold text-white shadow-xl shadow-indigo-500/25">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {user?.name || "User"}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  {(user?.email || "").toLowerCase()}
                </p>
                <Badge className="mt-3">
                  {displayUserRole(user?.role)}
                </Badge>
              </CardContent>
            </Card>
          </motion.div>

          {/* Account Details */}
          <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.15 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profileFields.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-700/60"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                      <field.icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">{field.label}</p>
                      <p className={`truncate text-sm font-medium text-gray-900 dark:text-white ${field.capitalize ? "capitalize" : ""}`}>
                        {field.value}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── RIGHT COLUMN (2/3) — Stats + Preferences ── */}
        <div className="space-y-6 md:col-span-2">
          {/* Platform Stats */}
          <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Journey</CardTitle>
                <CardDescription>Your activity on the platform so far</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  {stats.map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className="group rounded-xl border border-gray-100 p-5 text-center transition-all hover:border-indigo-500/30 hover:shadow-md dark:border-gray-700/60"
                    >
                      <div className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${stat.bg} transition-transform duration-200 group-hover:scale-110`}>
                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Preferences */}
          <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.25 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preferences</CardTitle>
                <CardDescription>Customize your experience</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700/60 dark:hover:bg-white/[0.02]">
                  <div className="flex min-w-0 items-center gap-3">
                    {theme === "dark" ? (
                      <Moon className="h-5 w-5 shrink-0 text-indigo-400" />
                    ) : (
                      <Sun className="h-5 w-5 shrink-0 text-amber-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</p>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                        {theme === "dark" ? "Currently using dark theme" : "Currently using light theme"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={theme === "dark"}
                    aria-label="Toggle dark mode"
                    onClick={toggleTheme}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
                      theme === "dark" ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                        theme === "dark" ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Email Notifications Toggle */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700/60 dark:hover:bg-white/[0.02]">
                  <div className="flex min-w-0 items-center gap-3">
                    <Bell className={`h-5 w-5 shrink-0 ${emailNotif ? "text-green-500" : "text-gray-400"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Email Notifications</p>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                        Receive tips and analysis reminders
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={emailNotif}
                    aria-label="Toggle email notifications"
                    onClick={() => setEmailNotif(!emailNotif)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
                      emailNotif ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                        emailNotif ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
