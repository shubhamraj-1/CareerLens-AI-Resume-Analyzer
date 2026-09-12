import { motion } from "framer-motion";
import { getScoreColor, getScoreLabel } from "@/utils/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AtsScoreChartProps {
  score: number;
  /** Explains what the number represents (e.g. latest analyzed resume vs portfolio). */
  caption?: string;
}

export function AtsScoreChart({ score, caption = "Most recently analyzed resume" }: AtsScoreChartProps) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const circumference = 2 * Math.PI * 80;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-gradient">ATS Score</CardTitle>
        <CardDescription className="text-xs">{caption}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            <svg width="200" height="200" className="-rotate-90">
              <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="12"
                fill="none" className="text-gray-200 dark:text-white/5" />
              <motion.circle cx="100" cy="100" r="80" stroke={color} strokeWidth="12"
                fill="none" strokeLinecap="round" strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.8, ease: "easeOut", delay: 0.3 }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span className="text-5xl font-bold" style={{ color }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, type: "spring" }}>
                {score}%
              </motion.span>
            </div>
          </div>
          <motion.p className="text-lg font-semibold" style={{ color }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
            {label}
          </motion.p>
          <p className="text-xs text-gray-500 dark:text-gray-500">ATS compatibility score</p>
        </div>
      </CardContent>
    </Card>
  );
}
