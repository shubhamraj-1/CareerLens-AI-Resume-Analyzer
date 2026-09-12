import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { env } from "../config/env";
import { RateLimitError } from "../middlewares/errorHandler";

// ══════════════════════════════════════════════════════════════════
// ── LLM Service: Google Gemini AI Integration ────────────────────
// ══════════════════════════════════════════════════════════════════

let genAI: GoogleGenerativeAI | null = null;

function getGoogleAI(): GoogleGenerativeAI | null {
  if (!env.GEMINI_API_KEY?.trim()) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genAI;
}

/** Log once per process if the key looks misconfigured (does not block calls). */
let geminiKeyDiagnosticsLogged = false;
function logGeminiKeyDiagnostics(): void {
  if (geminiKeyDiagnosticsLogged) return;
  geminiKeyDiagnosticsLogged = true;
  const k = env.GEMINI_API_KEY?.trim() ?? "";
  if (!k) {
    console.warn("[LLM] GEMINI_API_KEY is empty — AI routes will use fallbacks or errors.");
    return;
  }
  if (k.length < 30) {
    console.warn("[LLM] GEMINI_API_KEY looks unusually short — verify it is a valid Google AI Studio key.");
  } else if (!k.startsWith("AIza")) {
    console.warn(
      "[LLM] GEMINI_API_KEY does not start with \"AIza\" — if calls fail with 401, create a key at https://aistudio.google.com/apikey",
    );
  }
}

function getGenerativeModel(modelId: string) {
  const client = getGoogleAI();
  if (!client) return null;
  return client.getGenerativeModel({
    model: modelId,
    generationConfig: { temperature: 0 },
  });
}

/** Plain-text prompts (resume scoring, chat, etc.) — `gemini-1.5-flash` by default */
function getTextModel() {
  return getGenerativeModel(env.GEMINI_TEXT_MODEL);
}

/** Multimodal PDF/DOCX bytes (OCR path when pdf-parse is weak) — separate env so you can tune independently */
function getDocumentModel() {
  return getGenerativeModel(env.GEMINI_DOC_MODEL);
}

export function isLlmAvailable(): boolean {
  return !!env.GEMINI_API_KEY?.trim();
}

/** Sleep helper for retry */
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** Current date for temporal context */
function today() { return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }

/**
 * Call Gemini with a prompt, parse JSON response, with retry on rate limit
 * (free / low QPS tiers often return 429 — backoff gives the API time to recover).
 */
async function callGemini<T>(
  prompt: string,
  maxRetries = 3,
  logContext?: string,
): Promise<T | null> {
  const model = getTextModel();
  if (!model) return null;

  logGeminiKeyDiagnostics();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (logContext) {
        console.log(`[LLM:${logContext}] model=${env.GEMINI_TEXT_MODEL} raw response length (chars):`, text.length);
        console.log(
          `[LLM:${logContext}] Raw response before JSON parse (first 4000 chars):`,
          text.slice(0, 4000),
        );
      }

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        console.error("[LLM] No JSON found in response, raw:", text.slice(0, 200));
        return null;
      }

      return JSON.parse(jsonMatch[1].trim()) as T;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);

      const is429 =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("resource exhausted") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("rate limit");
      const isOverloaded = errMsg.includes("503") || errMsg.toLowerCase().includes("overloaded");
      const isAuthKey =
        /401|403|api key|API_KEY|permission|unauthorized|PERMISSION_DENIED|invalid/i.test(errMsg);

      if (is429) {
        console.error(
          `[LLM] Quota / rate limit (429) on model=${env.GEMINI_TEXT_MODEL} — attempt ${attempt + 1}/${maxRetries + 1}:`,
          errMsg.slice(0, 400),
        );
      } else if (isAuthKey) {
        console.error(
          `[LLM] API key or permission error on model=${env.GEMINI_TEXT_MODEL}:`,
          errMsg.slice(0, 400),
        );
      }

      // Retry on rate limit (429) or temporary overload
      if ((is429 || isOverloaded) && attempt < maxRetries) {
        const waitTime = (attempt + 1) * 12000; // 12s, 24s, 36s…
        console.log(
          `[LLM] ${isOverloaded ? "Service busy" : "Rate limited"} — retry in ${waitTime / 1000}s (attempt ${attempt + 1}/${maxRetries})…`,
        );
        await sleep(waitTime);
        continue;
      }

      // All retries exhausted on 429 → throw so the user gets a clear message
      if (is429) {
        console.error(`[LLM] Quota (429) persists after ${maxRetries + 1} attempts — check billing/quotas in Google AI Studio.`);
        throw new RateLimitError();
      }

      console.error(`[LLM] Gemini API error (attempt ${attempt + 1}) model=${env.GEMINI_TEXT_MODEL}:`, errMsg.slice(0, 400));
      return null;
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════
// ── Gemini Vision: Extract text from image-based PDFs ────────────
// ══════════════════════════════════════════════════════════════════

/**
 * Use Gemini's multimodal capability to read PDF files directly.
 * This handles image-based/scanned PDFs that pdf-parse cannot read.
 */
export async function extractTextWithGeminiVision(filePath: string): Promise<string> {
  const model = getDocumentModel();
  if (!model) return "";

  logGeminiKeyDiagnostics();

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) return "";

  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType =
    ext === ".pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  try {
    const fileBuffer = fs.readFileSync(resolvedPath);
    const base64Data = fileBuffer.toString("base64");

    console.log(
      `[Gemini Doc] Extracting text via model=${env.GEMINI_DOC_MODEL} from ${path.basename(resolvedPath)} (${(fileBuffer.length / 1024).toFixed(0)} KB)...`,
    );

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      {
        text: "Extract ALL text content from this resume document. Return ONLY the raw text — no commentary, no formatting, no markdown. Just the plain text as it appears in the document, preserving section structure with newlines.",
      },
    ]);

    const text = result.response.text();
    console.log(`[Gemini Doc] ✅ Extracted ${text.split(/\s+/).filter(Boolean).length} words`);
    return text;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const is429 =
      errMsg.includes("429") ||
      errMsg.toLowerCase().includes("resource exhausted") ||
      errMsg.toLowerCase().includes("quota") ||
      errMsg.toLowerCase().includes("rate limit");
    const isAuth = /401|403|api key|API_KEY|permission|PERMISSION_DENIED|invalid/i.test(errMsg);

    if (is429) {
      console.error(`[Gemini Doc] Quota / rate limit (429) model=${env.GEMINI_DOC_MODEL}:`, errMsg.slice(0, 400));
    } else if (isAuth) {
      console.error(`[Gemini Doc] API key or permission error model=${env.GEMINI_DOC_MODEL}:`, errMsg.slice(0, 400));
    }

    // Retry once on rate limit
    if (is429) {
      console.log("[Gemini Doc] Rate limited — waiting 15s then one retry...");
      await sleep(15000);
      try {
        const fileBuffer = fs.readFileSync(resolvedPath);
        const base64Data = fileBuffer.toString("base64");
        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64Data } },
          { text: "Extract ALL text content from this resume. Return ONLY plain text, no commentary." },
        ]);
        return result.response.text();
      } catch (e2: unknown) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        console.error("[Gemini Doc] Retry failed:", m2.slice(0, 400));
      }
    }

    console.error(`[Gemini Doc] Failed model=${env.GEMINI_DOC_MODEL}:`, errMsg.slice(0, 400));
    return "";
  }
}

// ══════════════════════════════════════════════════════════════════
// ── Structured Prompts ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

// ─── Full Resume Analysis ────────────────────────────────────────
export interface LlmAnalysisResult {
  ats_score: number;
  skills_score: number;
  experience_score: number;
  education_score: number;
  projects_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  suggestions: string[];
  // Multi-dimensional metrics
  grammar_score?: number;
  impact_score?: number;
  formatting_score?: number;
  keyword_score?: number;
}

function isValidLlmScores(r: LlmAnalysisResult | null): r is LlmAnalysisResult {
  if (!r) return false;
  const nums = [
    r.ats_score, r.skills_score, r.experience_score, r.education_score, r.projects_score,
  ];
  if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) return false;
  if (nums.some((n) => n < 0 || n > 100)) return false;
  if (!Array.isArray(r.matched_keywords) || !Array.isArray(r.missing_keywords) || !Array.isArray(r.suggestions)) return false;
  return true;
}

export async function llmAnalyzeResume(resumeText: string): Promise<LlmAnalysisResult | null> {
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  const prompt = `You are a strict, realistic ATS resume analyzer. Date: ${today()}. Return ONLY valid JSON, no other text.

=== HIGHEST PRIORITY INSTRUCTIONS (read these FIRST) ===

STEP 0 — DYNAMIC DOMAIN CLASSIFICATION (MANDATORY):
Before scoring ANYTHING, classify this resume's type:
- "Corporate/Industry" = standard 1-2 page resume for jobs (Software Engineer, Marketing Manager, etc.)
- "Academic/Research" = academic CV with Publications, Journals, Teaching Experience, Research, Conferences, Grants
If "Academic/Research" is detected:
  - Do NOT penalize for length (3-10+ pages is normal for academic CVs)
  - Do NOT suggest removing publication lists, teaching history, or research sections
  - Score formatting based on academic CV standards, not corporate standards
  - "Projects" can include Research Projects, Thesis, Dissertations
If "Corporate/Industry": apply standard 1-2 page length penalties as normal.

STEP 0.1 — DEEP FULL-DOCUMENT SCAN (MANDATORY):
You MUST read the ENTIRE document text from first character to last. Do NOT skip or skim.
Skills, Education, and Certifications are often at the VERY END of long documents.
Tables, bullet lists, and multi-column layouts may scatter skills across the text.
Pay EXTREME attention to the final 30% of the document.

STEP 0.2 — ABSOLUTE SKILL VERIFICATION (ZERO FALSE NEGATIVES):
Before adding ANY skill to "missing_keywords":
1. Do a full text-search across the ENTIRE resume for that skill AND all its synonyms/abbreviations.
2. "Microsoft Azure" = "Azure". "React.js" = "React" = "ReactJS". "PostgreSQL" = "Postgres". "C/C++" counts for both "C" and "C++". "GCP" = "Google Cloud Platform". "K8s" = "Kubernetes". "JS" = "JavaScript". "Node.js" = "NodeJS".
3. If the skill OR any synonym appears ANYWHERE — in Skills, Experience, Projects, Certifications, Summary, or even a project description — it MUST go in "matched_keywords", NOT "missing_keywords".
4. If you are unsure, put it in "matched_keywords". False negatives are a critical bug.

STEP 0.3 — SOFT SKILLS & INTERPERSONAL STRENGTHS (MANDATORY):
Scan the FULL resume for clearly stated professional/soft skills (examples: leadership, communication, teamwork, collaboration, mentoring, stakeholder management, cross-functional work, problem solving, presentation skills, conflict resolution, coaching, negotiation, time management, adaptability, initiative, interpersonal skills, client-facing experience).
For EVERY soft skill you can quote or paraphrase from the text with confidence, add ONE entry to "matched_keywords" using this exact format: "Soft:Leadership" (prefix "Soft:" + short Title Case label). Use at least 3 when the resume clearly contains multiple; use zero only if the resume truly mentions none. Do NOT invent soft skills.

=== END HIGHEST PRIORITY ===

RESUME (${wordCount} words):
"""
${resumeText.slice(0, 8000)}
"""

JSON format:
{"ats_score":<0-100>,"skills_score":<0-100>,"experience_score":<0-100>,"education_score":<0-100>,"projects_score":<0-100>,"grammar_score":<0-100>,"impact_score":<0-100>,"formatting_score":<0-100>,"keyword_score":<0-100>,"matched_keywords":["skill1","skill2"],"missing_keywords":["missing1"],"suggestions":["specific suggestion 1"]}

MULTI-DIMENSIONAL METRICS (all 0-100):
- grammar_score: spelling, grammar, punctuation correctness. Deduct for typos, broken sentences, inconsistent tense.
- impact_score: use of strong action verbs (Led, Architected, Optimized) and quantified achievements (%, $, numbers). Low if generic/passive language.
- formatting_score: clean structure, proper sections, consistent formatting. For Corporate resumes: 1-2 pages ideal, deduct for 3+ pages. For Academic CVs: length is NOT penalized.
- keyword_score: density of relevant industry keywords and technologies. Compare to what's expected for the candidate's apparent field.

STRICT SCORING RULES — you MUST follow these:
1. matched_keywords = real skills/technologies explicitly written IN the resume (use semantic matching from Step 0.2) PLUS soft-skill entries from Step 0.3 using the "Soft:Label" format
2. missing_keywords = important skills relevant to the candidate's field that are NOT in the resume (ONLY after full verification)
3. suggestions = specific, actionable improvements for THIS resume (not generic advice)

SCORE PENALTY RULES — the ats_score MUST reflect flaws:
- FOR CORPORATE RESUMES ONLY: If resume is longer than 2 pages (roughly >700 words), DEDUCT 15-25 points. Max: 80%. (Skip this for Academic CVs.)
- If resume has NO quantified metrics/numbers (e.g., "increased X by 30%"), DEDUCT 10-15 points. Max: 85%.
- If resume is MISSING major sections (Skills, Experience, Education), DEDUCT 10-20 points per missing section.
- If resume has NO action verbs (led, built, designed, implemented), DEDUCT 10 points.
- If resume has spelling/grammar issues or is poorly formatted, DEDUCT 10-15 points.
- A "perfect" 90-100 score should ONLY be given if the resume is well-formatted, has metrics, action verbs, all sections, and strong keywords.
- Most real resumes score between 40-80. Be REALISTIC, not generous.

The ats_score must be CONSISTENT with suggestions — if you suggest major fixes, the score CANNOT be above 80.

MANDATORY EDUCATION EXTRACTION (CRITICAL — read carefully):
- You MUST thoroughly scan the ENTIRE document, especially the FINAL pages/paragraphs, for sections titled "Education", "Academics", "Academic Background", "Qualifications", or "Educational History".
- Education sections are commonly placed at the BOTTOM of resumes — do NOT stop reading halfway through the text.
- If a formal section title is missing, look for ANY of these keywords ANYWHERE in the text: "Bachelor", "Master", "PhD", "BS", "MS", "B.Tech", "M.Tech", "MBA", "Diploma", "Associate", "University", "College", "Institute", "Degree", "GPA", "CGPA", "Graduated".
- If ANY degree, university name, or academic qualification is mentioned ANYWHERE in the resume, education_score MUST be greater than 0%.
- Scoring guide: Degree mentioned = at least 40%. Degree + University = at least 55%. Degree + University + Year = at least 70%. Degree + University + Year + GPA/Honors = 80-100%.
- NEVER return education_score: 0 if the words "university", "college", "bachelor", "master", "degree", or "institute" appear in the text.

SUGGESTION ACCURACY RULES (CRITICAL — avoid false positives):
- Before suggesting "Add a dedicated Education section", verify the ENTIRE text for any education-related content (degree names, university names, graduation years, GPA). Education sections are often on LATER pages.
- Before suggesting "Add a dedicated Projects section", check the entire text for project descriptions, GitHub links, or portfolio mentions.
- NEVER suggest adding a section that ALREADY EXISTS in the resume, even if it appears late in the document.
- If you detect the section exists but could be improved, say "Enhance your Education section with..." instead of "Add an Education section".
- The "suggestions" array must contain ONLY actionable improvements that are genuinely missing. Double-check each suggestion against the full resume text.`;

  let result = await callGemini<LlmAnalysisResult>(prompt, 3, "resume-analyze");
  if (!isValidLlmScores(result)) {
    console.warn("[LLM] First analyze response missing or invalid scores — retrying once...");
    await sleep(800);
    result = await callGemini<LlmAnalysisResult>(prompt, 3, "resume-analyze-retry");
  }
  if (!isValidLlmScores(result)) {
    console.error("[LLM] Resume analysis JSON invalid after retry — will use rule-based fallback in caller");
    return null;
  }

  // ── Post-processing: enforce education score if keywords found ──
  if (result && result.education_score === 0) {
    const lowerText = resumeText.toLowerCase();
    const hasEducation = /\b(bachelor|master|phd|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|mba|diploma|associate|university|college|institute|degree|graduated|gpa|cgpa)\b/i.test(lowerText);
    if (hasEducation) {
      const hasDegree = /\b(bachelor|master|phd|b\.?s|m\.?s|b\.?tech|m\.?tech|mba|diploma)\b/i.test(lowerText);
      const hasInstitution = /\b(university|college|institute)\b/i.test(lowerText);
      const hasYear = /\b(20\d{2}|19\d{2})\b/.test(lowerText);
      result.education_score = 30 + (hasDegree ? 20 : 0) + (hasInstitution ? 15 : 0) + (hasYear ? 10 : 0);
      console.log(`[LLM Post-process] Education score was 0 but keywords found — corrected to ${result.education_score}%`);
    }
  }

  // ── Post-processing: enforce score-suggestion consistency ──
  if (result && result.suggestions && result.suggestions.length > 0) {
    const sugText = result.suggestions.join(" ").toLowerCase();
    const hasMajorFlaws =
      /too long|too many pages|4 pages|3 pages|missing.*section|no.*metric|no.*quantif|poor.*format|lacks.*structure|no.*action verb|major.*issue|significant.*improvement/i.test(sugText);
    const hasMediumFlaws =
      /add.*metric|include.*number|could.*improve|needs.*work|consider.*adding|rewrite|rephrase|remove|shorten/i.test(sugText);

    if (hasMajorFlaws && result.ats_score > 80) {
      result.ats_score = Math.min(result.ats_score, 75);
    }
    if (hasMediumFlaws && result.ats_score > 90) {
      result.ats_score = Math.min(result.ats_score, 85);
    }

    // Word count penalty (Corporate resumes only — skip for Academic CVs)
    const isAcademic = /\b(publication|journal|research|teaching|conference|thesis|dissertation|professor|lecturer)\b/i.test(resumeText);
    if (!isAcademic && wordCount > 1000 && result.ats_score > 80) {
      result.ats_score = Math.min(result.ats_score, 78);
    } else if (!isAcademic && wordCount > 700 && result.ats_score > 90) {
      result.ats_score = Math.min(result.ats_score, 85);
    }

    // Recalculate weighted sub-scores if ats_score was capped
    const subAvg = Math.round(
      result.skills_score * 0.3 + result.experience_score * 0.3 +
      result.education_score * 0.2 + result.projects_score * 0.2
    );
    if (subAvg > result.ats_score + 15) {
      // Sub-scores are unrealistically high compared to final score — scale down
      const scale = result.ats_score / subAvg;
      result.skills_score = Math.round(result.skills_score * scale * 1.1);
      result.experience_score = Math.round(result.experience_score * scale * 1.1);
      result.education_score = Math.round(result.education_score * scale * 1.1);
      result.projects_score = Math.round(result.projects_score * scale * 1.1);
    }
  }

  return result;
}

// ─── Job Match with Skill Gap ────────────────────────────────────
export interface LlmJobMatchResult {
  overall_score: number;
  skill_match: number;
  experience_match: number;
  education_match: number;
  matched_skills: string[];
  missing_skills: string[];
  suggestions: string[];
}

export async function llmJobMatch(resumeText: string, jobDescription: string): Promise<LlmJobMatchResult | null> {
  const prompt = `You are a strict skill gap analyzer. Date: ${today()}. Return ONLY valid JSON.

RESUME:
"""
${resumeText.slice(0, 3500)}
"""

JOB DESCRIPTION:
"""
${jobDescription.slice(0, 2500)}
"""

JSON: {"overall_score":<0-100>,"skill_match":<0-100>,"experience_match":<0-100>,"education_match":<0-100>,"matched_skills":["skills candidate HAS from JD"],"missing_skills":["skills candidate LACKS from JD"],"suggestions":["specific tailoring tips"]}

STRICT RULES:
- matched_skills MUST only contain skills explicitly mentioned in the JOB DESCRIPTION that the resume also has
- missing_skills MUST only contain skills explicitly mentioned in the JOB DESCRIPTION that the resume lacks
- Do NOT invent or assume skills that are not written in the JD text
- If JD has no technical skills, return empty arrays

SEMANTIC / ROOT-WORD MATCHING (CRITICAL — FALSE NEGATIVES ARE A BUG):
- Do NOT use exact string matching. You MUST understand context, synonyms, abbreviations, and variations.
- BEFORE classifying ANY skill as "missing", you MUST double-check the ENTIRE resume text — scan project descriptions, work experience bullets, tools/technologies lists, summary, and certifications.
- Only classify a skill as "missing" if there is ABSOLUTELY NO mention of it, its variations, abbreviations, or its direct parent/child categories ANYWHERE in the resume.

COMMON SYNONYM/VARIATION MATCHES (all count as a MATCH):
- "Microsoft Azure" = "Azure" = "Azure Cloud"
- "PostgreSQL" = "Postgres" = "psql"
- "React" = "React.js" = "ReactJS"
- "Node.js" = "NodeJS" = "Node"
- "Vue.js" = "VueJS" = "Vue"
- "Amazon Web Services" = "AWS"
- "Google Cloud Platform" = "GCP"
- "Kubernetes" = "K8s"
- "JavaScript" = "JS"
- "TypeScript" = "TS"
- "MongoDB" = "Mongo"
- "CI/CD" = "Continuous Integration" = "GitHub Actions" = "Jenkins"
- "Docker" = "Containerization"
- "Machine Learning" = "ML"
- "Artificial Intelligence" = "AI"

ROOT-WORD MATCHING:
- "Collaborated" in resume MATCHES "Collaboration" in JD (same root)
- "Managed" MATCHES "Management"
- "Analyzed" MATCHES "Analytical"
- "Developed" MATCHES "Development"
- "Led" / "Leading" MATCHES "Leadership"
- If the resume uses ANY form of a skill word (verb, noun, adjective), it counts as MATCHED.

YEARS OF EXPERIENCE — STRICT EVALUATION:
- If the JD says "5+ years of experience", check the resume's actual total years carefully.
- Calculate from work history dates (e.g., 2019-2024 = 5 years), not just the candidate's claim.
- If the candidate has FEWER years than required, experience_match MUST be below 60.
- If the candidate meets or exceeds the required years, experience_match should be 80-100.
- If the JD doesn't specify years, default experience_match to 70.

CORE FRAMEWORK PENALTY — STRICT:
- Identify the PRIMARY framework/technology in the JD title or first requirement (e.g., "Django Developer" → Django is core, "React Engineer" → React is core).
- If the candidate is MISSING the core framework entirely, experience_match MUST be capped at 40 regardless of years of experience. A Django role requires Django experience — 10 years of Flask does NOT substitute.
- Also list the core framework as the FIRST item in missing_skills.
- The overall_score must reflect this: missing a core framework = max 50% overall.`;

  return callGemini<LlmJobMatchResult>(prompt);
}

// ─── Interview Questions ─────────────────────────────────────────
export interface LlmInterviewQuestion {
  category: string;
  question: string;
  tip: string;
}

export async function llmInterviewQuestions(
  resumeText: string,
  accountDisplayName?: string
): Promise<{ questions: LlmInterviewQuestion[] } | null> {
  const nameBlock =
    accountDisplayName?.trim()
      ? `REGISTERED CANDIDATE NAME (use ONLY this name when addressing or referring to the person — NEVER the resume filename, PDF title, or header text like "Aliza CV"):
"${accountDisplayName.trim()}"
`
      : "";

  const prompt = `You are a senior technical interviewer conducting a focused mock interview.
Today's date is ${today()}.

${nameBlock}
Based on this resume, generate hyper-personalized interview questions that reference the candidate's EXACT bullet points, project names, and technologies.

RESUME:
"""
${resumeText.slice(0, 5000)}
"""

Return ONLY this exact JSON (no extra text):
{
  "questions": [
    {
      "category": "Technical",
      "question": "How did you optimize the ML pipeline in your ResumeAI project?",
      "tip": "Discuss the specific bottleneck, your solution, and the measurable improvement. Use the STAR method."
    }
  ]
}

CRITICAL RULES:
- Each object MUST have exactly 3 fields: "category", "question", "tip"
- "category" MUST be one of: Technical, Behavioral, System Design, Experience, Leadership
- Generate exactly 12 questions total:
  • 5 Technical (based on their ACTUAL listed skills and projects)
  • 3 Behavioral (based on their work experience)
  • 2 Experience-based (ask about SPECIFIC projects/roles by NAME from their resume)
  • 2 System Design or Leadership (if applicable)

CONCISENESS RULES (CRITICAL):
- The "question" field MUST be SHORT and PUNCHY — maximum 1-2 sentences. Do NOT write a whole paragraph.
- BAD: "Given that your resume mentions you worked on a machine learning pipeline at Company X where you processed large datasets, can you walk me through the entire architecture including data ingestion, feature engineering, model training, and deployment?"
- GOOD: "Walk me through the ML pipeline architecture you built at Company X."
- Put any extra scenario details, hints, or answer structure guidance into the "tip" field ONLY.
- The "tip" field should be 2-3 sentences max — suggest WHAT to cover and HOW to structure the answer (e.g., STAR method, specific metrics to mention).
- All questions must reference SPECIFIC details from THIS resume (project names, company names, tech stack).
- Never address the candidate using the resume file name or a line that looks like a document title (e.g. "Aliza CV.pdf").`;

  const result = await callGemini<{ questions: unknown[] }>(prompt);
  if (!result?.questions) return null;

  // Normalize: handle any field name variations Gemini might use
  const normalized = result.questions.map((q: unknown) => {
    const item = q as Record<string, unknown>;
    return {
      category: String(item.category || item.type || item.Category || "General"),
      question: String(item.question || item.q || item.text || item.Question || item.interview_question || ""),
      tip: String(item.tip || item.hint || item.advice || item.Tip || item.preparation_tip || "Prepare a structured answer using the STAR method"),
    };
  }).filter((q) => q.question.length > 5); // filter out empty questions

  return { questions: normalized };
}

// ─── Smart Feedback (line-by-line) ───────────────────────────────
export interface LlmFeedbackItem {
  original: string;
  improved: string;
  issue: string;
  category: string;
  severity: "high" | "medium" | "low";
}

export async function llmSmartFeedback(resumeText: string): Promise<{ score: number; feedback: LlmFeedbackItem[] } | null> {
  const prompt = `You are an expert resume writer and ATS optimization specialist.
Today's date is ${today()}.

Review this resume LINE BY LINE and find weak bullet points, generic phrases, missing metrics, and passive language.

RESUME:
"""
${resumeText.slice(0, 5000)}
"""

Return this EXACT JSON structure:
{
  "score": <number 0-100, overall writing quality score>,
  "feedback": [
    {
      "original": "<the exact weak line from the resume>",
      "improved": "<your rewritten, stronger version with action verbs and metrics>",
      "issue": "<short explanation of what's wrong>",
      "category": "<weak_verb|generic|no_metrics|passive_voice|too_vague>",
      "severity": "<high|medium|low>"
    }
  ]
}

Find 5-10 weak bullet points. For each one:
- Quote the ORIGINAL text exactly
- Rewrite it with strong action verbs, specific technologies, and quantifiable metrics
- Be specific about the issue`;

  return callGemini<{ score: number; feedback: LlmFeedbackItem[] }>(prompt);
}

export type ChatHistoryTurn = { role: "user" | "assistant"; content: string };

// ─── AI Chat ─────────────────────────────────────────────────────
export async function llmChat(
  resumeText: string,
  analysisContext: string,
  question: string,
  history?: ChatHistoryTurn[]
): Promise<{ answer: string } | null> {
  const historyBlock =
    history && history.length > 0
      ? `CONVERSATION SO FAR (chronological — use this for follow-ups like "explain point 2" or "elaborate on that"):
${history
  .slice(-24)
  .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content.slice(0, 1800)}`)
  .join("\n")}

`
      : "";

  const prompt = `You are an expert ATS evaluator and friendly AI resume assistant.
Today's date is ${today()}.

The user has uploaded a resume and you have analyzed it. Here's the context:

RESUME (summary):
"""
${resumeText.slice(0, 3000)}
"""

ANALYSIS CONTEXT:
${analysisContext}

${historyBlock}USER'S CURRENT QUESTION: "${question}"

SESSION MEMORY:
- If CONVERSATION SO FAR is present, treat it as authoritative context. Answer follow-ups (e.g. "explain point 2", "what did you mean by…") by referring back to your prior numbered lists or claims in those turns.

CRITICAL CONSISTENCY RULES — you MUST follow these:
1. NEVER contradict yourself. If the analysis shows flaws, acknowledge them — do NOT praise a high score while also listing major problems.
2. If you detect major resume flaws (e.g., resume is 3-4+ pages long, missing sections, no metrics, poor formatting), the ATS score MUST NOT be described as "perfect" or "excellent". Explain why points were deducted.
3. When discussing scores, always tie them back to SPECIFIC flaws or strengths from the resume. For example: "Your score is 72% because while your skills section is strong, the resume is 4 pages long (ideal is 1-2) and lacks quantified metrics."
4. If the user asks "why is my score X?", list the EXACT reasons: missing sections, length issues, no action verbs, lack of metrics, etc.
5. Be honest but constructive — don't sugarcoat a low score, but always provide actionable improvement steps.
6. Reference their ACTUAL resume content (project names, skills, job titles) — not generic advice.

SEMANTIC SKILL DETECTION (CRITICAL — avoid false negatives):
- When analyzing the resume for missing keywords, use SEMANTIC matching, NOT exact string matching.
- "Microsoft Azure" = "Azure" = "Azure Cloud". "React.js" = "React" = "ReactJS". "GCP" = "Google Cloud Platform". "PostgreSQL" = "Postgres". "Node.js" = "NodeJS". "K8s" = "Kubernetes". "JS" = "JavaScript". "TS" = "TypeScript". "CI/CD" = "GitHub Actions" = "Jenkins" = "Continuous Integration".
- BEFORE telling the user a skill is missing, DOUBLE-CHECK the entire resume: Skills section, project descriptions, work experience bullets, tools lists, certifications, and summary.
- Only say a skill is "missing" if there is ABSOLUTELY NO mention of it or any synonym/abbreviation/variation anywhere in the resume.
- If in doubt, say "I didn't find an explicit mention of X — consider adding it" rather than "X is missing from your resume."

Answer helpfully and specifically. You may use **bold** for emphasis (wrapping key terms in double asterisks). Keep your response concise (under 200 words when there is no prior conversation; if CONVERSATION SO FAR is present, you may use up to ~280 words to explain follow-ups clearly). If suggesting improvements, give specific before/after examples with actionable rewrites.

FORMATTING RULES FOR BEFORE/AFTER EXAMPLES:
- Do NOT use markdown bullet points combined with quotes (e.g., * "some text").
- Instead, present before/after examples as plain quoted text on their own lines:
  Before: "Responsible for managing team projects"
  After: "Led a cross-functional team of 8 engineers, delivering 3 major releases on schedule"
- Keep formatting clean and minimal — no nested lists, no dashes with quotes, no asterisk bullets.

Return ONLY a JSON object:
{ "answer": "<your helpful response>" }`;

  return callGemini<{ answer: string }>(prompt);
}

// ─── Cover Letter Generator ──────────────────────────────────────
export async function llmGenerateContent(
  resumeText: string,
  jobDescription: string,
  type: "cover_letter" | "linkedin_summary" | "professional_bio",
  accountDisplayName?: string
): Promise<{ type: string; content: string } | null> {
  const typeLabels = {
    cover_letter: "a professional cover letter (3-4 paragraphs)",
    linkedin_summary:
      "a LinkedIn About/Summary section (150-220 words): opening hook, then scan-friendly bullets with professional emojis",
    professional_bio: "a short professional bio (80-100 words, third person)",
  };

  const linkedinFormatRules =
    type === "linkedin_summary"
      ? `
LINKEDIN SUMMARY LAYOUT (MANDATORY):
- Use exactly 2-3 tasteful professional emojis total across the whole summary (e.g. 💼 🚀 📊 ✨ 🤝 📩) — do not spam emojis.
- After a short opening paragraph (1-2 sentences), use line breaks and 3-5 bullet lines. Each bullet MUST start with the character "• " (bullet + space) for LinkedIn readability.
- Keep bullets concise (one line each where possible). End with an optional short CTA line.
- Do NOT use markdown **bold**, # headers, or numbered markdown lists.
`
      : "";

  const professionalBioNameRules =
    type === "professional_bio" && accountDisplayName?.trim()
      ? `
PROFESSIONAL BIO — NAME (MANDATORY):
- The subject of the bio MUST be "${accountDisplayName.trim()}" (third person: "${accountDisplayName.trim()} is…").
- Do NOT use the resume filename, PDF name, or header text (e.g. "Aliza CV") as the person's name under any circumstance.
`
      : "";

  const coverLetterRules = type === "cover_letter" ? `
COVER LETTER SIGN-OFF (MANDATORY):
- You MUST conclude the cover letter with a formal sign-off.
- End with "Sincerely," (or "Best regards,") on its own line, followed by a blank line, then the candidate's full name on the next line.
- Example ending:
  Sincerely,

  John Smith
- Do NOT end abruptly after the last paragraph. The sign-off is required.
- NEVER use a resume filename, PDF title, or phrases like "Aliza CV", "John Resume", or "Curriculum Vitae" as the sign-off name — those are NOT human names.` : "";

  const prompt = `CRITICAL: You are a TRUTHFUL assistant. You MUST follow the anti-hallucination rules below before writing ANYTHING.

=== ABSOLUTE ANTI-HALLUCINATION RULES (READ FIRST — HIGHEST PRIORITY) ===
1. You MUST ONLY highlight skills, technologies, and experiences that EXPLICITLY EXIST in the RESUME text below.
2. NEVER invent, fabricate, or hallucinate skills. If a skill appears in the JOB DESCRIPTION but NOT in the RESUME, you MUST completely ignore it. Do NOT mention it, do NOT claim the candidate has it, do NOT imply familiarity with it.
3. If the JD requires Django/Python but the resume only lists React Native — you MUST NOT write "experienced in Django" or "proficient in Python". Instead, highlight the candidate's ACTUAL skills (React Native, JavaScript, etc.) and emphasize transferable abilities and willingness to learn.
4. Before writing ANY skill name, do a mental check: "Is this word in the RESUME text above?" If NO → do NOT write it.
5. EVERY technology, framework, or tool you mention MUST be traceable to the RESUME. Zero exceptions.
=== END ANTI-HALLUCINATION RULES ===

You are a professional content writer specializing in career documents.
Today's date is ${today()}.

${accountDisplayName?.trim()
    ? `REGISTERED USER NAME (use this EXACT string after "Sincerely," / "Best regards," — overrides the first line of the resume if it looks like a filename or document title):
"${accountDisplayName.trim()}"
`
    : ""}
Based on this resume and job description, write ${typeLabels[type]}.

RESUME:
"""
${resumeText.slice(0, 3000)}
"""

JOB DESCRIPTION:
"""
${jobDescription.slice(0, 2000)}
"""

Return ONLY a JSON object:
{ "type": "${type === "cover_letter" ? "Cover Letter" : type === "linkedin_summary" ? "LinkedIn Summary" : "Professional Bio"}", "content": "<the generated content>" }

CRITICAL NAME EXTRACTION RULES:
- The candidate's name is the HUMAN PERSON's name, usually the FIRST line of the resume.
- Do NOT confuse University names, Company names, or Institution names with the candidate's name.
- Examples of WRONG names: "University of California", "Massachusetts Institute", "Google LLC", "National Institute of Technology", filenames like "Jane_Doe_Resume.pdf", or headers like "Aliza CV" / "Resume — Software Engineer".
- The candidate's name is typically 2-3 words like "John Smith" or "Priya Sharma" — NOT an organization.
- If a REGISTERED USER NAME is provided above, use it for signatures, first-person identity, AND the subject of a professional bio — never substitute the resume's first line if it looks like a filename.
- If you cannot confidently identify the candidate's real name, use "the candidate" instead.

PLAIN TEXT FORMATTING (CRITICAL):
- The "content" field MUST be plain text — no markdown **bold**, # headers, or __underline__.
- NEVER use **bold**, *italic*, __underline__, or any other markdown formatting.
- BAD: "Skilled in **Python**, **React**, and **AWS**"
- GOOD: "Skilled in Python, React, and AWS"
- The output will be displayed in a text area and copied directly into LinkedIn, email, or Word — markdown asterisks look broken in those contexts.
- For emphasis, use CAPITALIZATION sparingly or rephrase the sentence instead.
- For LinkedIn summaries ONLY: emojis and "• " bullet lines are required as described above (still no ** markdown).
- For cover letters and professional bios: no markdown; emojis only if type is LinkedIn summary.
${professionalBioNameRules}${linkedinFormatRules}${coverLetterRules}
Make it professional, personalized, and compelling. Reference ONLY specific skills that are explicitly listed in the RESUME — never from the JD alone.`;

  let result = await callGemini<{ type: string; content: string }>(prompt);
  if (!result?.content) {
    console.warn("[LLM] generate-content empty result — one retry after cooldown…");
    await sleep(1500);
    result = await callGemini<{ type: string; content: string }>(prompt);
  }

  // Safety net: strip any markdown that slipped through
  if (result?.content) {
    result.content = result.content
      .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold** → bold
      .replace(/\*(.+?)\*/g, "$1")       // *italic* → italic
      .replace(/__(.+?)__/g, "$1")       // __underline__ → underline
      .replace(/~~(.+?)~~/g, "$1");      // ~~strike~~ → strike
  }

  return result;
}

// ─── AI Bullet Point Rewriter ─────────────────────────────────────
export async function llmRewriteBullet(text: string): Promise<{ original: string; rewritten: string; changes: string[] } | null> {
  const prompt = `You are a professional resume writer. Rewrite the following resume bullet point to be highly professional, impactful, and ATS-optimized.

ORIGINAL: "${text}"

Rules:
- Use a strong action verb at the start (Led, Developed, Architected, Optimized, etc.)
- Add quantifiable metrics if possible (%, numbers, scale)
- Keep it to 1-2 concise sentences max
- Make it specific and results-oriented
- Do NOT use markdown formatting

Return ONLY this JSON:
{ "original": "${text}", "rewritten": "<your improved version>", "changes": ["<change 1>", "<change 2>"] }

The "changes" array should list 2-3 specific improvements you made (e.g., "Added action verb", "Quantified impact", "Made more specific").`;

  return callGemini<{ original: string; rewritten: string; changes: string[] }>(prompt);
}

// ─── URL Job Match ────────────────────────────────────────────────
export interface LlmUrlMatchResult {
  matchPercentage: number;
  missingKeywords: string[];
  recommendation: string;
}

export async function llmMatchUrl(resumeText: string, jobText: string): Promise<LlmUrlMatchResult | null> {
  const prompt = `You are an expert ATS and hiring consultant. Compare this resume to this job description.

RESUME:
"""
${resumeText.slice(0, 3500)}
"""

JOB DESCRIPTION:
"""
${jobText.slice(0, 3500)}
"""

Return ONLY this JSON:
{
  "matchPercentage": <number 0-100, how well the resume matches>,
  "missingKeywords": ["keyword1", "keyword2", ...],
  "recommendation": "<2-3 sentence actionable advice to improve the match>"
}

Rules:
- matchPercentage must be realistic (not inflated)
- missingKeywords = skills/technologies explicitly in the JD but NOT in the resume
- Use semantic matching: "Collaborated" counts as "Collaboration"
- recommendation must be specific to THIS resume and THIS job`;

  return callGemini<LlmUrlMatchResult>(prompt);
}

// ─── Interview Predictor (Resume + JD) ───────────────────────────
export interface LlmPredictedQuestion {
  question: string;
  strategy: string;
}

export async function llmInterviewPredictor(
  resumeText: string,
  jobDescription: string,
  accountDisplayName?: string
): Promise<{ questions: LlmPredictedQuestion[] } | null> {
  const nameBlock =
    accountDisplayName?.trim()
      ? `REGISTERED CANDIDATE NAME (when referring to the candidate by name, use ONLY this — never the resume filename or title line):
"${accountDisplayName.trim()}"
`
      : "";

  const prompt = `Act as an expert technical recruiter. Based on the candidate's resume and the provided job description, generate the top 5 most likely interview questions they will be asked.

${nameBlock}
RESUME:
"""
${resumeText.slice(0, 3000)}
"""

JOB DESCRIPTION:
"""
${jobDescription.slice(0, 2500)}
"""

For each question, provide a brief "Ideal Answer Strategy" — what the candidate should emphasize, which projects to reference, and what structure to use (e.g., STAR method).

Return ONLY this JSON:
{
  "questions": [
    { "question": "<the interview question>", "strategy": "<2-3 sentence ideal answer strategy>" }
  ]
}

Rules:
- Questions must be SPECIFIC to both the resume content AND the job requirements
- Include a mix: 2 technical, 1 behavioral, 1 experience-based, 1 situational
- Keep questions concise (1-2 sentences max)
- Strategies should reference actual resume details (project names, technologies)
- Do not use the resume file name or document-style headers as the candidate's name.`;

  return callGemini<{ questions: LlmPredictedQuestion[] }>(prompt);
}

// ─── Answer Evaluator ────────────────────────────────────────────
export type LlmAnswerEvaluation = {
  scoreOutOf10: number;
  grade: string;
  strengths: string[];
  feedback: string[];
  starFeedback: string;
  techMentioned: string[];
};

export async function llmEvaluateAnswer(
  question: string,
  answer: string,
  resumeContext: string,
  accountDisplayName?: string
): Promise<LlmAnswerEvaluation | null> {
  const nameLine = accountDisplayName?.trim()
    ? `The candidate's name is "${accountDisplayName.trim()}" — do not refer to them using a resume filename or document title.`
    : "";

  const prompt = `You are a senior technical interviewer evaluating a candidate's answer.
Today's date is ${today()}.

INTERVIEW QUESTION: "${question}"

CANDIDATE'S ANSWER:
"""
${answer}
"""

RESUME CONTEXT (for reference):
${resumeContext.slice(0, 1500)}

${nameLine}

Evaluate the answer and return this EXACT JSON:
{
  "scoreOutOf10": <integer from 1 to 10 only — 10 is an excellent, structured interview answer>,
  "grade": "<Excellent|Good|Average|Needs Improvement>",
  "strengths": [<2-3 things the candidate did well>],
  "feedback": [<2-4 specific improvements — be concrete>],
  "starFeedback": "<one cohesive paragraph (4-8 sentences) that: (1) briefly rates how well their answer covers Situation, Task, Action, and Result; (2) names which STAR parts are weak or missing; (3) gives actionable rewrite guidance using STAR; (4) does NOT invent resume facts>",
  "techMentioned": [<technologies/concepts the candidate mentioned in the answer>]
}

Rules:
- scoreOutOf10 MUST be an integer 1-10 (this is the primary score).
- starFeedback MUST explicitly reference STAR (Situation, Task, Action, Result) and tell them how to improve.
- feedback items should complement starFeedback with bite-sized tips.`;

  const raw = await callGemini<{
    scoreOutOf10?: number;
    score?: number;
    grade: string;
    strengths: string[];
    feedback: string[];
    starFeedback?: string;
    techMentioned: string[];
  }>(prompt);

  if (!raw) return null;

  let scoreOutOf10 = typeof raw.scoreOutOf10 === "number" ? Math.round(raw.scoreOutOf10) : NaN;
  if (Number.isNaN(scoreOutOf10) && typeof raw.score === "number") {
    scoreOutOf10 = Math.min(10, Math.max(1, Math.round(raw.score / 10)));
  }
  if (Number.isNaN(scoreOutOf10)) scoreOutOf10 = 5;
  scoreOutOf10 = Math.min(10, Math.max(1, scoreOutOf10));

  const starFeedback =
    typeof raw.starFeedback === "string" && raw.starFeedback.trim().length > 0
      ? raw.starFeedback.trim()
      : "Review your answer using STAR: clarify the Situation, your Task, specific Actions you took, and measurable Results.";

  return {
    scoreOutOf10,
    grade: raw.grade || "Average",
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    feedback: Array.isArray(raw.feedback) ? raw.feedback : [],
    starFeedback,
    techMentioned: Array.isArray(raw.techMentioned) ? raw.techMentioned : [],
  };
}

// ─── Complexity-Aware Project Suggestions ─────────────────────────
export interface LlmProjectSuggestion {
  title: string;
  description: string;
  techStack: string[];
  difficulty: string;
  relevance: number;
}

export async function llmSuggestProjects(resumeText: string): Promise<{ projects: LlmProjectSuggestion[] } | null> {
  const prompt = `You are a senior engineering mentor. Date: ${today()}. Return ONLY valid JSON.

RESUME:
"""
${resumeText.slice(0, 4000)}
"""

TASK: Suggest 5 highly specific, modern project ideas for this candidate.

=== STEP 0 — EXTRACT THE CANDIDATE'S ACTUAL SKILLS (MANDATORY) ===
Before suggesting ANYTHING, list the candidate's top 5-8 technical skills from the RESUME.
ALL project suggestions MUST use ONLY technologies from this extracted skill list (or their direct ecosystem).
- If the resume shows React Native, JavaScript, Firebase → suggest projects using React Native, JavaScript, Firebase.
- Do NOT suggest Vue.js, Angular, Django, Flask, or ANY technology that is NOT in the resume.
- The "techStack" array for each project MUST contain ONLY skills the candidate already knows.
- You may include 1 NEW related technology per project to help them grow (e.g., if they know React, you may suggest Next.js).

STEP 1 — DETERMINE SKILL LEVEL:
Analyze the complexity of the user's EXISTING projects listed in the resume:
- Beginner: Basic CRUD apps, static websites, simple scripts, TODO apps, calculators
- Intermediate: Full-stack apps with auth, REST APIs, database integration, basic ML models, mobile apps
- Advanced: Microservices, distributed systems, ML pipelines, real-time systems, cloud-native architectures, AI/LLM applications, scalable platforms

STEP 2 — SUGGEST ONE LEVEL HIGHER:
Suggest projects that are STRICTLY ONE LEVEL HIGHER in complexity than their current work:
- If they are Beginner → suggest Intermediate projects
- If they are Intermediate → suggest Advanced projects
- If they are Advanced → suggest Expert/cutting-edge projects (e.g., LLM agents, distributed ML, custom compilers, real-time data pipelines)

CRITICAL RULES:
- NEVER suggest technologies the candidate does NOT know. A React Native developer should NOT get Vue.js or Angular projects.
- Do NOT suggest basic web apps (expense tracker, portfolio, TODO) to Intermediate/Advanced engineers.
- Do NOT suggest "Build a chat app" to someone who already built real-time systems.
- Each project must use technologies the candidate ALREADY HAS, applied to a harder problem.
- Projects should be impressive enough to stand out on a resume / GitHub profile.

Return this EXACT JSON:
{
  "projects": [
    {
      "title": "<specific project name>",
      "description": "<2-3 sentence description of what to build and why it's impressive>",
      "techStack": ["Tech1", "Tech2", "Tech3"],
      "difficulty": "<Intermediate|Advanced|Expert>",
      "relevance": <50-100, how relevant to their existing skills>
    }
  ]
}`;

  return callGemini<{ projects: LlmProjectSuggestion[] }>(prompt);
}

// ─── Complexity-Aware Career Growth ───────────────────────────────
export interface LlmCareerGrowthResult {
  currentLevel: string;
  nextRole: string;
  yearsExperience: number;
  timeframe: string;
  skillsToLearn: string[];
  allPaths: { from: string; to: string; timeframe: string; skillsNeeded: string[] }[];
}

export async function llmCareerGrowth(resumeText: string): Promise<LlmCareerGrowthResult | null> {
  const prompt = `You are a senior career advisor. Date: ${today()}. Return ONLY valid JSON.

RESUME:
"""
${resumeText.slice(0, 4000)}
"""

Analyze the candidate's current career level, then suggest realistic growth paths.

STEP 0 — IDENTIFY ACTUAL SKILLS (MANDATORY):
Before suggesting anything, extract the candidate's top 5 technical skills from the RESUME.
All career path suggestions and "skillsToLearn" must be RELEVANT to their existing domain.
- If the candidate is a React Native mobile developer, suggest paths like Senior Mobile Engineer, Mobile Architect, or Full-Stack Mobile Lead — NOT "Django Developer" or "ML Engineer".
- "skillsToLearn" should be technologies in the SAME ecosystem (e.g., for React Native: TypeScript, GraphQL, CI/CD for mobile, App Store optimization, performance profiling) — NOT unrelated stacks.

Return EXACT JSON:
{
  "currentLevel": "<their current role/level>",
  "nextRole": "<the most logical next role>",
  "yearsExperience": <estimated total years>,
  "timeframe": "<e.g., '1-2 years'>",
  "skillsToLearn": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "allPaths": [
    { "from": "<current>", "to": "<next role option>", "timeframe": "<time>", "skillsNeeded": ["skill1", "skill2"] }
  ]
}

Rules:
- Be specific about the next role (not just "Senior" — say "Senior Mobile Engineer" or "React Native Tech Lead")
- skillsToLearn must be specific technologies or practices they DON'T already have BUT that are relevant to their domain
- Include 2-3 alternative career paths in allPaths, all within a realistic progression from their current tech stack
- Timeframes must be realistic`;

  return callGemini<LlmCareerGrowthResult>(prompt);
}
