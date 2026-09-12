import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/**
 * Custom error for AI rate limit / quota exceeded.
 * Thrown when Gemini returns 429 after all retries are exhausted.
 */
export class RateLimitError extends Error {
  status = 429;
  constructor(message = "Our AI is currently handling a high volume of requests. Please wait 30-60 seconds and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("Error:", err.name, err.message?.slice(0, 200));

  // ── Rate Limit / Quota Exceeded (Gemini 429) ──
  if (
    err instanceof RateLimitError ||
    err.message?.includes("429") ||
    err.message?.toLowerCase().includes("rate limit") ||
    err.message?.toLowerCase().includes("quota exceeded") ||
    err.message?.toLowerCase().includes("resource exhausted")
  ) {
    res.status(429).json({
      message: "Our AI is currently handling a high volume of requests. Please wait 30-60 seconds and try again.",
      error: "Rate limit exceeded",
      retryAfter: 60,
    });
    return;
  }

  // ── Zod Validation ──
  if (err instanceof ZodError) {
    const errors = err.errors.reduce(
      (acc, e) => {
        const key = e.path.join(".");
        if (!acc[key]) acc[key] = [];
        acc[key].push(e.message);
        return acc;
      },
      {} as Record<string, string[]>
    );

    res.status(400).json({
      message: "Validation error",
      errors,
    });
    return;
  }

  // ── File type errors ──
  if (err.message === "Only PDF files are allowed" || err.message === "Only PDF and DOCX files are allowed") {
    res.status(400).json({ message: err.message });
    return;
  }

  // ── Generic 500 ──
  res.status(500).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
}
