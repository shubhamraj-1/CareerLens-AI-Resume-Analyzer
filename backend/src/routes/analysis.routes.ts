import { Router } from "express";
import { analysisController } from "../controllers/analysis.controller";
import { authenticate } from "../middlewares/auth";
import { requireCredits } from "../middlewares/credits";

const router = Router();

// ═══════════════════════════════════════════════════════════════
// AI-HEAVY routes (cost Gemini credits) — require credits
// ═══════════════════════════════════════════════════════════════

// POST /api/analysis/score
router.post("/score", authenticate, requireCredits, (req, res, next) =>
  analysisController.analyzeResume(req, res, next)
);

// POST /api/analysis/job-match
router.post("/job-match", authenticate, requireCredits, (req, res, next) =>
  analysisController.matchJob(req, res, next)
);

// POST /api/analysis/interview-questions
router.post("/interview-questions", authenticate, requireCredits, (req, res, next) =>
  analysisController.generateInterviewQuestions(req, res, next)
);

// POST /api/analysis/smart-feedback
router.post("/smart-feedback", authenticate, requireCredits, (req, res, next) =>
  analysisController.generateSmartFeedback(req, res, next)
);

// POST /api/analysis/generate-content
router.post("/generate-content", authenticate, requireCredits, (req, res, next) =>
  analysisController.generateContent(req, res, next)
);

// POST /api/analysis/career-growth
router.post("/career-growth", authenticate, requireCredits, (req, res, next) =>
  analysisController.getCareerGrowth(req, res, next)
);

// POST /api/analysis/suggest-projects
router.post("/suggest-projects", authenticate, requireCredits, (req, res, next) =>
  analysisController.suggestProjects(req, res, next)
);

// POST /api/analysis/evaluate-answer
router.post("/evaluate-answer", authenticate, requireCredits, (req, res, next) =>
  analysisController.evaluateAnswer(req, res, next)
);

// POST /api/analysis/chat
router.post("/chat", authenticate, requireCredits, (req, res, next) =>
  analysisController.chat(req, res, next)
);

// POST /api/analysis/match-url
router.post("/match-url", authenticate, requireCredits, (req, res, next) =>
  analysisController.matchUrl(req, res, next)
);

// POST /api/analysis/interview-predictor
router.post("/interview-predictor", authenticate, requireCredits, (req, res, next) =>
  analysisController.interviewPredictor(req, res, next)
);

// ═══════════════════════════════════════════════════════════════
// LIGHTWEIGHT routes (rule-based, no Gemini cost) — no credits
// ═══════════════════════════════════════════════════════════════

// POST /api/analysis/rewrite (AI-powered, costs 1 credit)
router.post("/rewrite", authenticate, requireCredits, (req, res, next) =>
  analysisController.rewriteBulletPoint(req, res, next)
);

// POST /api/analysis/sections
router.post("/sections", authenticate, (req, res, next) =>
  analysisController.analyzeSections(req, res, next)
);

// POST /api/analysis/resume-preview
router.post("/resume-preview", authenticate, (req, res, next) => analysisController.getResumePreview(req, res, next));

// POST /api/analysis/hiring-probability
router.post("/hiring-probability", authenticate, (req, res, next) => analysisController.getHiringProbability(req, res, next));

// POST /api/analysis/global-benchmark
router.post("/global-benchmark", authenticate, (req, res, next) => analysisController.getGlobalBenchmark(req, res, next));

// POST /api/analysis/badges
router.post("/badges", authenticate, (req, res, next) => analysisController.getBadges(req, res, next));

// POST /api/analysis/detect-industry
router.post("/detect-industry", authenticate, (req, res, next) =>
  analysisController.detectIndustry(req, res, next)
);

// POST /api/analysis/readability
router.post("/readability", authenticate, (req, res, next) =>
  analysisController.analyzeReadability(req, res, next)
);

// POST /api/analysis/compare
router.post("/compare", authenticate, (req, res, next) =>
  analysisController.compareResumes(req, res, next)
);

export default router;
