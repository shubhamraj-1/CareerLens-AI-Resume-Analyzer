import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Upload, FileSearch, Briefcase,
  MessageSquareQuote, PenLine, GitCompareArrows,
  Bot, Eye, Rocket, Mic, User, History, X, Brain,
  MessageSquareHeart,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { FeedbackModal } from "@/components/FeedbackModal";
import type { LucideIcon } from "lucide-react";

interface NavItem { to: string; icon: LucideIcon; label: string }
interface NavSection { title: string; items: NavItem[] }

const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/upload", icon: Upload, label: "Upload Resume" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { to: "/analysis", icon: FileSearch, label: "Analysis" },
      { to: "/visualize", icon: Eye, label: "Visualizations" },
      { to: "/compare", icon: GitCompareArrows, label: "Compare" },
    ],
  },
  {
    title: "Career Growth",
    items: [
      { to: "/job-match", icon: Briefcase, label: "Job Match" },
      { to: "/content-generator", icon: PenLine, label: "Content Gen" },
      { to: "/career-hub", icon: Rocket, label: "Career Hub" },
    ],
  },
  {
    title: "Interview Prep",
    items: [
      { to: "/ai-chat", icon: Bot, label: "AI Chat" },
      { to: "/interview-prep", icon: MessageSquareQuote, label: "Interview Prep" },
      { to: "/mock-interview", icon: Mic, label: "Mock Interview" },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/history", icon: History, label: "History" },
      { to: "/profile", icon: User, label: "Profile" },
    ],
  },
];

interface SidebarProps { isOpen: boolean; onClose: () => void; }

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col transition-transform duration-300 ease-in-out",
          "border-r border-gray-200 bg-white dark:border-white/[0.06] dark:bg-slate-900/80 dark:backdrop-blur-xl",
          "lg:translate-x-0 lg:static",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-gray-900 dark:text-white">Resume</span>
              <span className="text-gradient">AI</span>
            </span>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav — Categorized Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          {navSections.map((section, sIdx) => (
            <div key={section.title} className={sIdx > 0 ? "mt-5" : ""}>
              {/* Section Header */}
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                {section.title}
              </p>

              {/* Section Links */}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 border-l-[3px] py-2 pl-[9px] pr-3 text-[13px] font-medium transition-all duration-200",
                        isActive
                          ? "border-l-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-inset ring-indigo-200/80 dark:border-l-indigo-400 dark:bg-indigo-500/15 dark:text-white dark:ring-indigo-400/25"
                          : "border-l-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110",
                            isActive
                              ? "text-indigo-600 dark:text-indigo-300"
                              : "text-gray-500 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-200"
                          )}
                        />
                        <span className="min-w-0 flex-1">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
                {section.title === "Account" && (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackOpen(true);
                      onClose();
                    }}
                    className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <MessageSquareHeart className="h-[18px] w-[18px] text-indigo-500/80 transition-transform duration-200 group-hover:scale-110 dark:text-indigo-400" />
                    Send feedback
                  </button>
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 p-3 dark:border-white/[0.06]">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-3 dark:from-indigo-500/5 dark:to-purple-500/5">
            <p className="text-xs font-semibold text-gradient">AI Resume Analyzer</p>
            <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-500">Powered by Gemini AI</p>
          </div>
        </div>
      </aside>

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
