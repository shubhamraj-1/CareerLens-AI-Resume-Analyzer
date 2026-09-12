import express, { Router, type Request } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";

import { allowedCorsOrigins, env } from "./config/env";
import routes from "./routes";
import statsRouter from "./routes/stats.routes";
import { errorHandler } from "./middlewares/errorHandler";
import { ignoreAssetNoise } from "./middlewares/ignoreAssetNoise";

const app = express();

// CORS first (before helmet). Array-only `origin` in `cors` omits headers when `Origin` is missing — use a callback.
// Production + legacy preview shape (thing-aliza-resume-analyzer.vercel.app)
const alizaOrPreviewVercel = /^https:\/\/([a-z0-9-]+-)?aliza-resume-analyzer\.vercel\.app$/i;
/** e.g. aliza-resume-analyzer-git-main-user.vercel.app (Vercel branch deploys) */
function isAlizaVercelHost(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return hostname.endsWith(".vercel.app") && hostname.includes("aliza-resume-analyzer");
  } catch {
    return false;
  }
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (
      allowedCorsOrigins.includes(origin) ||
      alizaOrPreviewVercel.test(origin) ||
      isAlizaVercelHost(origin)
    ) {
      callback(null, true);
      return;
    }
    console.warn(`[CORS] Blocked: ${origin}`);
    callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86_400,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Cookie",
  ],
  exposedHeaders: ["Set-Cookie"],
};

app.use(cors(corsOptions));

// Security middleware (coexists with CORS: CORP allows cross-site resource use)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Stripe webhook needs raw body (must be before express.json)
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
  (req as unknown as { rawBody: Buffer }).rawBody = req.body;
  next();
});

// Parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static `backend/public` (favicon, etc.) — fall through if missing, then `ignoreAssetNoise` returns 204.
const publicDir = path.resolve(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }));
}
app.use(ignoreAssetNoise);

// API — after CORS + body parsers, before morgan / static (statsRouter: GET /api/platform-stats)
const apiRouter = Router();
apiRouter.use(statsRouter);
apiRouter.use(routes);
app.use("/api", apiRouter);

// Logging — skip noisy asset probes in all environments (Vercel runtime logs)
const morganSkip = (req: Request) => {
  const p = req.path.toLowerCase();
  return (
    p === "/favicon.ico" ||
    p === "/favicon.png" ||
    p === "/apple-touch-icon.png" ||
    p === "/apple-touch-icon-precomposed.png"
  );
};
if (env.NODE_ENV === "development") {
  app.use(morgan("dev", { skip: morganSkip }));
}

// Static files (uploaded resumes)
// Use /tmp/uploads on Vercel, local UPLOAD_DIR in development
const uploadDir = process.env.VERCEL ? "/tmp/uploads" : path.resolve(env.UPLOAD_DIR);
app.use("/uploads", express.static(uploadDir));

// Health check — root route
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "AI Resume Analyzer API is running",
    version: "1.0.0",
    docs: "/api",
  });
});

// Error handling
app.use(errorHandler);

// Start server only in non-serverless environments
// Vercel manages the server lifecycle itself via the exported app
if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║     AI Resume Analyzer - Backend API         ║
  ╠══════════════════════════════════════════════╣
  ║  Environment: ${env.NODE_ENV.padEnd(30)}║
  ║  Port:        ${String(env.PORT).padEnd(30)}║
  ║  API URL:     http://localhost:${String(env.PORT).padEnd(17)}║
  ╚══════════════════════════════════════════════╝
    `);
  });
}

export default app;
