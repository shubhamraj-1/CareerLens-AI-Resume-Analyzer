import type { Request, Response, NextFunction } from "express";

/**
 * Respond with 204 so browsers/probes don't hit the API 404 for common asset paths.
 * Keeps Vercel/runtime logs cleaner than a missing static file.
 */
export function ignoreAssetNoise(req: Request, res: Response, next: NextFunction): void {
  const p = req.path.toLowerCase();
  if (
    p === "/favicon.ico" ||
    p === "/favicon.png" ||
    p === "/apple-touch-icon.png" ||
    p === "/apple-touch-icon-precomposed.png"
  ) {
    res.status(204).end();
    return;
  }
  next();
}
