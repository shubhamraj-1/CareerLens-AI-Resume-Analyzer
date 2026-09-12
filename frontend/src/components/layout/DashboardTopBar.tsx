import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart3, Target, PenLine, Mic } from "lucide-react";
import { cn } from "@/utils/cn";

const steps = [
  { to: "/analysis", icon: BarChart3, label: "Resume Score" },
  { to: "/job-match", icon: Target, label: "Job Match" },
  { to: "/content-generator", icon: PenLine, label: "Cover Letter" },
  { to: "/interview-prep", icon: Mic, label: "Interview Prep" },
];

export function DashboardTopBar() {
  const { pathname } = useLocation();
  // Only show on tool pages (not dashboard home, upload, profile, etc.)
  const isToolPage = steps.some((s) => pathname.startsWith(s.to));
  if (!isToolPage) return null;

  return (
    <div className="min-w-0 border-b border-gray-200 bg-white backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 dark:border-white/[0.06] dark:bg-slate-950 dark:supports-[backdrop-filter]:bg-slate-950/80">
      <nav className="flex min-w-0 overflow-x-auto scrollbar-thin">
        {steps.map((step, i) => {
          const isActive = pathname.startsWith(step.to);
          return (
            <NavLink
              key={step.to}
              to={step.to}
              className={cn(
                "relative flex min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm",
                isActive
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
              )}
            >
              <step.icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-indigo-500")} />
              <span className="hidden sm:inline">{step.label}</span>

              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="topbar-active"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}

              {/* Connector line between steps (desktop) */}
              {i < steps.length - 1 && (
                <div className="pointer-events-none absolute -right-px top-1/2 hidden h-4 w-px -translate-y-1/2 bg-gray-200 dark:bg-gray-700 sm:block" />
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
