import { motion } from "framer-motion";
import { Shield, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

interface StrengthMeterProps {
  score: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  projectsScore: number;
}

function getStrengthLevel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "#22c55e", icon: CheckCircle2, ring: "ring-green-500/30", bg: "from-green-500 to-emerald-500" };
  if (score >= 60) return { label: "Good", color: "#84cc16", icon: TrendingUp, ring: "ring-lime-500/30", bg: "from-lime-500 to-green-500" };
  if (score >= 40) return { label: "Average", color: "#eab308", icon: AlertTriangle, ring: "ring-yellow-500/30", bg: "from-yellow-500 to-orange-500" };
  return { label: "Needs Work", color: "#ef4444", icon: AlertTriangle, ring: "ring-red-500/30", bg: "from-red-500 to-orange-500" };
}

export function StrengthMeter({ score, skillsScore, experienceScore, educationScore, projectsScore }: StrengthMeterProps) {
  const strength = getStrengthLevel(score);
  const Icon = strength.icon;
  const circumference = 2 * Math.PI * 58;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const metrics = [
    { label: "Skills", value: skillsScore, max: 100 },
    { label: "Experience", value: experienceScore, max: 100 },
    { label: "Education", value: educationScore, max: 100 },
    { label: "Projects", value: projectsScore, max: 100 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-brand-500" />
          Resume Strength
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          {/* Circular Progress */}
          <div className="relative mb-6">
            <svg width="140" height="140" className="-rotate-90">
              <circle
                cx="70"
                cy="70"
                r="58"
                stroke="currentColor"
                strokeWidth="10"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <motion.circle
                cx="70"
                cy="70"
                r="58"
                stroke={strength.color}
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className="text-3xl font-bold"
                style={{ color: strength.color }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                {score}
              </motion.span>
              <span className="text-xs text-gray-500">/ 100</span>
            </div>
          </div>

          {/* Strength Label */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className={`mb-6 flex items-center gap-2 rounded-full bg-gradient-to-r ${strength.bg} px-4 py-1.5 text-sm font-semibold text-white shadow-lg`}
          >
            <Icon className="h-4 w-4" />
            {strength.label}
          </motion.div>

          {/* Metric Bars */}
          <div className="w-full space-y-3">
            {metrics.map((m, i) => (
              <div key={m.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-gray-600 dark:text-gray-400">{m.label}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{m.value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: getStrengthLevel(m.value).color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${m.value}%` }}
                    transition={{ duration: 1, delay: 0.3 + i * 0.1 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
