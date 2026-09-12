import { cn } from "@/utils/cn";

interface SkeletonProps {
  className?: string;
}

/** Basic skeleton block — mimics a loading placeholder */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800", className)} />
  );
}

/** Pre-composed layout: skeleton for a stat card */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-pulse rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]", className)}>
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-5 w-16 rounded bg-gray-300 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

/** Pre-composed layout: skeleton for a chart/section area */
export function SkeletonChart({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]", className)}>
      <div className="p-6 space-y-3">
        <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-56 rounded bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="px-6 pb-6">
        <div className="h-52 rounded-xl bg-gray-100 dark:bg-gray-800/60" />
      </div>
    </div>
  );
}

/** Pre-composed layout: skeleton for text paragraphs */
export function SkeletonText({ lines = 4, className }: SkeletonProps & { lines?: number }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-800",
            i === lines - 1 ? "w-3/5" : i % 2 === 0 ? "w-full" : "w-4/5"
          )}
          style={{ animationDelay: `${i * 75}ms` }}
        />
      ))}
    </div>
  );
}

/** Full-page analysis skeleton layout */
export function SkeletonAnalysis() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <SkeletonCard key={i} style-={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonChart />
    </div>
  );
}

/** Dashboard skeleton layout */
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonChart className="h-80" />
        <SkeletonChart className="h-80" />
      </div>
    </div>
  );
}
