import { Router, type Request, type Response } from "express";
import prisma from "../config/database";

const statsRouter = Router();

type StatsPayload = {
  users: number;
  resumesAnalyzed: number;
  accuracy: number;
  rating: number;
};

/** In-process TTL cache so burst GETs (same cold start / multiple tabs) reuse one Prisma aggregate. */
const PLATFORM_STATS_TTL_MS = 60_000;
let platformStatsCache: { expiresAt: number; data: StatsPayload } | null = null;

statsRouter.get("/platform-stats", async (_req: Request, res: Response) => {
  const now = Date.now();
  if (platformStatsCache && platformStatsCache.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.status(200).json({ success: true, data: platformStatsCache.data });
  }

  try {
    const [users, resumesAnalyzed] = await Promise.all([
      prisma.user.count(),
      prisma.resume.count(),
    ]);

    const stats: StatsPayload = {
      users,
      resumesAnalyzed,
      accuracy: 98,
      rating: 4.9,
    };

    platformStatsCache = { expiresAt: now + PLATFORM_STATS_TTL_MS, data: stats };
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ success: false, message: "Failed to fetch statistics" });
  }
});

export default statsRouter;
