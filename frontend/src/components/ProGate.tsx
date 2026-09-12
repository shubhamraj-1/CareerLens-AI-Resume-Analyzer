import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const BENEFITS = [
  "AI-Powered Resume Analysis & ATS Scoring",
  "AI Cover Letters, Bios & LinkedIn Summaries",
  "Mock Interview Prep with AI Coaching",
  "Job Match & Skill Gap Analysis",
  "Career Growth Roadmap & Project Ideas",
  "PDF Report Downloads",
];

/** Returns true if user has AI credits remaining */
export function useHasCredits(): boolean {
  const { user } = useAuth();
  return (user?.aiCredits ?? 0) > 0;
}

/** Returns true if the user is on the Pro plan */
export function useIsPro(): boolean {
  const { user } = useAuth();
  return user?.isPro === true;
}

/**
 * Renders children if user has credits.
 * Otherwise shows a blurred overlay with "Buy Credits" CTA.
 */
export function ProGate({ children, feature }: { children: React.ReactNode; feature: string }) {
  const { user } = useAuth();
  const credits = user?.aiCredits ?? 0;
  const hasCredits = credits > 0;

  if (hasCredits) return <>{children}</>;

  return (
    <div className="relative min-h-[400px]">
      {/* Blurred content behind */}
      <div className="pointer-events-none select-none blur-[6px] opacity-40">
        {children}
      </div>

      {/* Overlay */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm dark:bg-slate-950/80"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-4 w-full max-w-md rounded-2xl border border-indigo-500/20 bg-white p-8 shadow-2xl dark:bg-slate-900"
          >
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/30">
                <Lock className="h-7 w-7 text-white" />
              </div>
              <h3 className="mb-1 text-xl font-bold text-gray-900 dark:text-white">
                You've discovered a Pro feature! 🚀
              </h3>
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                <strong>{feature}</strong> requires AI credits to use.
              </p>
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <Zap className="h-3 w-3" /> {credits} credits remaining
              </div>
            </div>

            <ul className="mb-6 space-y-2">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <Check className="h-4 w-4 flex-shrink-0 text-indigo-500" /> {b}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2">
              <Link to="/purchase">
                <Button className="w-full gap-2 shadow-lg shadow-indigo-500/25">
                  <Sparkles className="h-4 w-4" /> Buy Credits
                </Button>
              </Link>
              <Link to="/pricing" className="text-center text-[11px] text-indigo-500 hover:underline dark:text-indigo-400">
                View all plans →
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
