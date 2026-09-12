import { cn } from "@/utils/cn";
import { getScoreColor } from "@/utils/constants";

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  /** When set, overrides `getScoreColor` (e.g. dashboard list tiers). */
  barColor?: string;
}

export function Progress({ value, max = 100, className, showLabel = false, size = "md", barColor }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const color = barColor ?? getScoreColor(percentage);

  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Progress</span>
          <span className="font-medium text-gray-900 dark:text-white">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={cn("w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10", heights[size])}>
        <div
          className={cn("rounded-full transition-all duration-700", heights[size])}
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
