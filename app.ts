/**
 * Vercel entry when "Root Directory" = repository root.
 * Vercel only accepts a direct `import` of `express` in the entry (not `require()` in a tiny stub).
 * For "Root Directory" = `backend/`, the entry is `backend/src/server.ts` instead; this file is ignored.
 */
import express from "express";
import app from "./backend/src/server";

void express;
export default app;
