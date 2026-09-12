import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type RechartsSafeContainerProps = {
  children: ReactNode;
  className?: string;
  empty?: boolean;
  emptyMessage?: string;
};

/**
 * Wraps Recharts so ResponsiveContainer only mounts after the parent has a
 * non-zero box (common issue: framer-motion, grid/flex, or hidden tabs).
 */
export function RechartsSafeContainer({
  children,
  className = "",
  empty = false,
  emptyMessage = "No data to display",
}: RechartsSafeContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [sizeOk, setSizeOk] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Wait until layout has real pixels (Recharts warns on -1 when parent is 0×0).
      setSizeOk(w >= 32 && h >= 32);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (empty) {
    return (
      <div
        className={`flex h-[300px] w-full min-h-[200px] min-w-[200px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`h-[300px] w-full min-h-[300px] min-w-0 shrink-0 ${className}`}
    >
      {sizeOk ? (
        children
      ) : (
        <div className="flex h-full min-h-[280px] w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" aria-hidden />
        </div>
      )}
    </div>
  );
}
