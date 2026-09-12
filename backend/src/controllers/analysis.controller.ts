import type { Response, NextFunction } from "express";
import * as cheerio from "cheerio";
import { analysisService } from "../services/analysis.service";
import { analyzeSchema, jobMatchSchema } from "../validators/analysis";
import { sendSuccess, sendError } from "../helpers/response";
import { ClientError } from "../utils/http-errors";
import { deductCredit } from "../middlewares/credits";
import type { AuthenticatedRequest } from "../types";

const JOB_FETCH_TIMEOUT_MS = 12_000;
const JOB_FETCH_UA = "Mozilla/5.0 (compatible; ResumeAI/1.0)";

/** Fetch HTML for job URL scraping (native fetch — reliable on Vercel serverless vs dynamic axios import). */
async function fetchJobPageHtml(
  jobUrl: string
): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JOB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(jobUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": JOB_FETCH_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.status === 404) {
      return {
        ok: false,
        message:
          "That job URL returned 404 (not found). Check the link or paste the job description manually.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `The page returned HTTP ${res.status}. It may block automated access — paste the job description manually.`,
      };
    }

    const html = await res.text();
    if (!html.trim()) {
      return {
        ok: false,
        message: "The page returned no usable HTML. Paste the job description manually.",
      };
    }
    return { ok: true, html };
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || /abort/i.test(err.message));
    if (isAbort) {
      return {
        ok: false,
        message:
          "Fetching the job URL timed out. Try again, or paste the job description manually.",
      };
    }
    return {
      ok: false,
      message:
        "Could not fetch the job URL (network error). The page may be private or blocking scrapers. Paste the job description manually.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Send result + deduct 1 AI credit, include remaining balance in response header */
async function sendWithCredit(res: Response, userId: string, data: unknown) {
  const remaining = await deductCredit(userId);
  res.setHeader("X-AI-Credits-Remaining", remaining);
  sendSuccess(res, data);
}

export class AnalysisController {
  async analyzeResume(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { resumeId } = analyzeSchema.parse(req.body);
      console.log("[AnalysisController] analyzeResume start", {
        resumeId,
        userId: req.user.userId,
      });
      const analysis = await analysisService.analyzeResume(
        resumeId,
        req.user.userId
      );
      console.log("[AnalysisController] analyzeResume OK", { resumeId });
      await sendWithCredit(res, req.user.userId, analysis);
    } catch (error) {
      if (error instanceof ClientError) {
        sendError(res, error.message, error.statusCode, { code: error.code });
        return;
      }
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async matchJob(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { resumeId, jobDescription } = jobMatchSchema.parse(req.body);
      const result = await analysisService.matchJob(
        resumeId,
        jobDescription,
        req.user.userId
      );
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async generateInterviewQuestions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { resumeId } = analyzeSchema.parse(req.body);
      const questions = await analysisService.generateInterviewQuestions(
        resumeId,
        req.user.userId
      );
      await sendWithCredit(res, req.user.userId, questions);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async generateSmartFeedback(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { resumeId } = analyzeSchema.parse(req.body);
      const feedback = await analysisService.generateSmartFeedback(
        resumeId,
        req.user.userId
      );
      await sendWithCredit(res, req.user.userId, feedback);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async rewriteBulletPoint(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { text } = req.body;
      if (!text || typeof text !== "string" || text.trim().length < 5) {
        sendError(res, "Please provide text to rewrite (min 5 characters)", 400);
        return;
      }
      const result = await analysisService.rewriteBulletPoint(text.trim());
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) {
      next(error);
    }
  }

  async analyzeSections(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { resumeId } = analyzeSchema.parse(req.body);
      const result = await analysisService.analyzeSections(
        resumeId,
        req.user.userId
      );
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async generateContent(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { resumeId } = analyzeSchema.parse(req.body);
      const { jobDescription, type } = req.body;
      if (!jobDescription || !type) {
        sendError(res, "jobDescription and type are required", 400);
        return;
      }
      const result = await analysisService.generateContent(
        resumeId,
        req.user.userId,
        jobDescription,
        type
      );
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) {
      if (error instanceof ClientError) {
        sendError(res, error.message, error.statusCode, { code: error.code });
        return;
      }
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async getResumePreview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      const result = await analysisService.getResumePreview(resumeId, req.user.userId);
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; }
      next(error);
    }
  }

  async getHiringProbability(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      sendSuccess(res, await analysisService.getHiringProbability(resumeId, req.user.userId));
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async getGlobalBenchmark(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      sendSuccess(res, await analysisService.getGlobalBenchmark(resumeId, req.user.userId));
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async getBadges(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      sendSuccess(res, await analysisService.getBadges(resumeId, req.user.userId));
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async detectIndustry(
    req: AuthenticatedRequest, res: Response, next: NextFunction
  ) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      const result = await analysisService.detectIndustry(resumeId, req.user.userId);
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; }
      next(error);
    }
  }

  async analyzeReadability(
    req: AuthenticatedRequest, res: Response, next: NextFunction
  ) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      const result = await analysisService.analyzeReadability(resumeId, req.user.userId);
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; }
      next(error);
    }
  }

  async getCareerGrowth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      const result = await analysisService.getCareerGrowth(resumeId, req.user.userId);
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async suggestProjects(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId } = analyzeSchema.parse(req.body);
      const result = await analysisService.suggestProjects(resumeId, req.user.userId);
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async evaluateAnswer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId, question, answer } = req.body;
      if (!resumeId || !question || !answer) { sendError(res, "resumeId, question, and answer required", 400); return; }
      const result = await analysisService.evaluateAnswer(resumeId, req.user.userId, question, answer);
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async chat(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId, question, history } = req.body;
      if (!resumeId || !question) { sendError(res, "resumeId and question required", 400); return; }
      const sanitizedHistory = Array.isArray(history)
        ? history
            .slice(-24)
            .filter(
              (h: unknown) =>
                h &&
                typeof h === "object" &&
                (h as { role?: string }).role &&
                typeof (h as { content?: string }).content === "string"
            )
            .map((h: { role: string; content: string }) => ({
              role: (h.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
              content: String(h.content).slice(0, 4000),
            }))
        : undefined;
      const result = await analysisService.chat(resumeId, req.user.userId, question, sanitizedHistory);
      await sendWithCredit(res, req.user.userId, result);
    } catch (error) { if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; } next(error); }
  }

  async compareResumes(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const { oldResumeId, newResumeId } = req.body;
      if (!oldResumeId || !newResumeId) {
        sendError(res, "oldResumeId and newResumeId are required", 400);
        return;
      }
      const result = await analysisService.compareResumes(
        oldResumeId,
        newResumeId,
        req.user.userId
      );
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }
  async matchUrl(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }

      const { jobUrl, resumeId } = req.body;
      if (!jobUrl || typeof jobUrl !== "string" || !resumeId) {
        sendError(res, "jobUrl and resumeId are required", 400);
        return;
      }

      // Validate URL
      try { new URL(jobUrl); } catch {
        sendError(res, "Please provide a valid URL", 400);
        return;
      }

      // 1. Scrape the job page (fetch + cheerio; no axios — avoids missing-module issues on Vercel)
      const fetched = await fetchJobPageHtml(jobUrl);
      if (!fetched.ok) {
        sendError(res, fetched.message, 400);
        return;
      }

      const $ = cheerio.load(fetched.html);
      $("script, style, nav, header, footer, iframe, noscript, svg, img").remove();
      const jobText = $("body").text().replace(/\s+/g, " ").trim();

      if (jobText.length < 50) {
        sendError(res, "Could not extract enough text from that URL. The page may require login. Try pasting the job description manually.", 400);
        return;
      }

      // 2. Get resume text
      const resumeText = await analysisService.getResumeText(resumeId, req.user.userId);

      // 3. LLM match
      const { llmMatchUrl } = await import("../services/llm.service");
      const result = await llmMatchUrl(resumeText, jobText.slice(0, 5000));

      if (!result) {
        sendError(res, "AI analysis failed. Please try again.", 500);
        return;
      }

      await sendWithCredit(res, req.user.userId, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async interviewPredictor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) { sendError(res, "Unauthorized", 401); return; }
      const { resumeId, jobDescription } = req.body;
      if (!resumeId || !jobDescription) { sendError(res, "resumeId and jobDescription are required", 400); return; }

      const result = await analysisService.interviewPredictor(resumeId, req.user.userId, jobDescription);

      if (!result?.questions?.length) {
        sendError(res, "AI failed to generate questions. Please try again.", 500);
        return;
      }

      await sendWithCredit(res, req.user.userId, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") { sendError(res, error.message, 404); return; }
      next(error);
    }
  }
}

export const analysisController = new AnalysisController();
