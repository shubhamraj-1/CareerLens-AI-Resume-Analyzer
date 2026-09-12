import { API_URL } from "@/utils/constants";

export type PlatformStatsPayload = {
  users: number;
  resumesAnalyzed: number;
  accuracy: number;
  rating: number;
};

/** Successful response for the lifetime of the SPA tab — avoids repeat GETs on remount / navigation. */
let platformStatsResolved: PlatformStatsPayload | null = null;

/** Single in-flight promise — avoids duplicate GETs (e.g. React Strict Mode double mount). */
let platformStatsInflight: Promise<PlatformStatsPayload> | null = null;

export function fetchPlatformStatsOnce(): Promise<PlatformStatsPayload> {
  if (platformStatsResolved) {
    return Promise.resolve(platformStatsResolved);
  }
  if (!platformStatsInflight) {
    platformStatsInflight = (async () => {
      const response = await fetch(`${API_URL}/platform-stats`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        success?: boolean;
        data?: PlatformStatsPayload;
      };
      if (!response.ok || !result.success || !result.data || typeof result.data !== "object") {
        throw new Error("platform-stats invalid response");
      }
      platformStatsResolved = result.data;
      return platformStatsResolved;
    })().catch((err) => {
      platformStatsInflight = null;
      throw err;
    });
  }
  return platformStatsInflight;
}
