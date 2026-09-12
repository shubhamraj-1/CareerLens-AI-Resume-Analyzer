import { removeStopwords } from "stopword";

// ══════════════════════════════════════════════════════════════════
// ── NLP Engine: TF-IDF, Dynamic Skill Extraction, Semantic Match
// ══════════════════════════════════════════════════════════════════

/**
 * Eagerly importing `natural` breaks Vercel serverless cold starts (bundler/runtime);
 * we load it only when NLP code runs (e.g. resume analysis), not for OPTIONS/health.
 */
function loadNatural(): typeof import("natural") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("natural");
}

let wordTokenizer: import("natural").WordTokenizer | null = null;
function getTokenizer(): import("natural").WordTokenizer {
  if (!wordTokenizer) {
    const n = loadNatural();
    wordTokenizer = new n.WordTokenizer();
  }
  return wordTokenizer;
}

// ─── Dynamic Skill Patterns ─────────────────────────────────────
// Regex patterns to detect skills NOT in any fixed list
const DYNAMIC_SKILL_PATTERNS: RegExp[] = [
  // Programming languages (CamelCase, lowercase, with versions)
  /\b[A-Z][a-z]+(?:\.js|\.ts|\.py|\.rb|\.go|\.rs)\b/g,
  // Frameworks/Libraries with common naming: e.g., Spring Boot, Ruby on Rails
  /\b(?:Spring Boot|Ruby on Rails|React Native|Vue\.js|Angular\.js|Ember\.js|Svelte Kit|Solid\.js)\b/gi,
  // Cloud services: e.g., AWS Lambda, Azure Functions, GCP BigQuery
  /\b(?:AWS|Azure|GCP|Google Cloud)\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b/g,
  // Database systems
  /\b\w+(?:SQL|DB|Cache|Store|Search)\b/gi,
  // Tools with version numbers: e.g., Python 3.10, Node 18
  /\b[A-Z][a-z]+\s+\d+(?:\.\d+)*\b/g,
  // Certifications: AWS Certified, Google Certified, etc.
  /\b(?:AWS|Google|Azure|Cisco|Oracle|CompTIA)\s+Certified\s+\w+(?:\s+\w+)*/gi,
  // Acronyms (3-5 uppercase letters): REST, SOAP, MQTT, gRPC, etc.
  /\b[A-Z]{2,5}\b/g,
];

// ─── Stop words + resume-specific noise words ───────────────────
const RESUME_NOISE = new Set([
  "resume", "cv", "page", "email", "phone", "address", "date", "name",
  "references", "available", "upon", "request", "contact", "information",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
  "present", "current", "responsible", "responsibilities",
  "company", "inc", "ltd", "corp", "llc",
  "the", "and", "for", "with", "that", "this", "from", "have", "has",
  "was", "were", "been", "will", "would", "could", "should",
  // Common words that TF-IDF picks up as "important" but aren't skills
  "gor", "parsed", "results", "created", "word", "google", "using",
  "work", "working", "worked", "based", "also", "use", "used",
  "new", "make", "made", "well", "good", "great", "best",
  "first", "second", "third", "last", "next", "time", "year",
  "include", "including", "such", "various", "different", "multiple",
  "develop", "developed", "development", "developing",
  "implement", "implemented", "implementing", "implementation",
  "manage", "managed", "managing", "management",
  "create", "creating", "creation",
  "build", "building", "built",
  "able", "experience", "experienced", "project", "projects",
  "team", "teams", "role", "roles", "level", "levels",
  "high", "low", "large", "small", "full", "part",
  "file", "files", "text", "data", "system", "systems",
  "application", "applications", "service", "services",
  "process", "processes", "result", "function", "functions",
  "model", "models", "method", "methods", "type", "types",
  "university", "college", "school", "degree", "bachelor", "master",
  "scanned", "image", "content", "upload", "uploaded",
]);

// Valid acronym skills (filter noise like "THE", "AND")
const VALID_ACRONYMS = new Set([
  "API", "REST", "SQL", "CSS", "HTML", "AWS", "GCP", "CI", "CD",
  "NLP", "ML", "AI", "UI", "UX", "QA", "CMS", "SDK", "IDE",
  "OOP", "MVC", "MVP", "MVVM", "TDD", "BDD", "ETL", "ELT",
  "SAAS", "PAAS", "IAAS", "IOT", "RPA", "ERP", "CRM",
  "TCP", "UDP", "HTTP", "HTTPS", "SSH", "SSL", "TLS",
  "DNS", "CDN", "VPN", "VPC", "IAM", "S3", "EC2", "RDS",
  "JSON", "XML", "YAML", "CSV", "JWT", "OAUTH", "RBAC",
  "GPU", "CPU", "RAM", "SSD", "HDD",
  "LSTM", "CNN", "RNN", "GAN", "BERT", "GPT", "LLM",
  "SOAP", "GRPC", "MQTT", "AMQP", "SMTP", "FTP", "SFTP",
]);

// ══════════════════════════════════════════════════════════════════
// ── TF-IDF Keyword Extraction ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

export function extractKeywordsTfIdf(text: string, topN = 30): string[] {
  const TfIdf = loadNatural().TfIdf;
  const tfidf = new TfIdf();

  // Add the resume as a document
  tfidf.addDocument(text.toLowerCase());

  // Add background "corpus" documents to improve IDF contrast
  tfidf.addDocument("the quick brown fox jumps over the lazy dog common words everyday language general text nothing specific here");
  tfidf.addDocument("meeting schedule office report manager team project deadline quarterly review annual performance assessment");

  // Extract terms with TF-IDF scores
  const terms: { term: string; score: number }[] = [];

  tfidf.listTerms(0).forEach((item) => {
    const term = item.term;
    // Strict filter: must look like a real skill/technology
    if (
      term.length >= 3 &&             // min 3 chars (no "go", "r", etc.)
      !RESUME_NOISE.has(term) &&
      !/^\d+$/.test(term) &&          // not a number
      !/^[a-z]{1,2}$/.test(term) &&   // not 1-2 letter words
      !/ing$|ed$|tion$|ment$|ness$|able$|ful$|ous$|ive$/.test(term) && // not common suffixes (verb/noun forms)
      item.tfidf > 1.0               // higher threshold for quality
    ) {
      terms.push({ term, score: item.tfidf });
    }
  });

  // Sort by score descending
  terms.sort((a, b) => b.score - a.score);

  return terms.slice(0, topN).map((t) => t.term);
}

// ══════════════════════════════════════════════════════════════════
// ── N-gram Extraction (for multi-word skills) ────────────────────
// ══════════════════════════════════════════════════════════════════

export function extractNgrams(text: string, n: 2 | 3 = 2): string[] {
  const words = getTokenizer().tokenize(text.toLowerCase()) || [];
  const filtered = removeStopwords(words);
  const ngrams: string[] = [];

  for (let i = 0; i <= filtered.length - n; i++) {
    const gram = filtered.slice(i, i + n).join(" ");
    // Only keep n-grams that look like skill phrases
    if (gram.length > 4 && !gram.match(/^\d|\d$/)) {
      ngrams.push(gram);
    }
  }

  // Count frequency and return top ones
  const freq = new Map<string, number>();
  for (const g of ngrams) {
    freq.set(g, (freq.get(g) || 0) + 1);
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([gram]) => gram);
}

// ══════════════════════════════════════════════════════════════════
// ── Dynamic Skill Detection ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

export function detectDynamicSkills(text: string): string[] {
  const found = new Set<string>();

  for (const pattern of DYNAMIC_SKILL_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags));
    if (matches) {
      for (const m of matches) {
        const clean = m.trim();
        // Filter: valid length, not noise
        if (
          clean.length >= 2 &&
          clean.length <= 30 &&
          !RESUME_NOISE.has(clean.toLowerCase())
        ) {
          // For pure uppercase acronyms, check against valid list
          if (/^[A-Z]{2,5}$/.test(clean)) {
            if (VALID_ACRONYMS.has(clean)) found.add(clean);
          } else {
            found.add(clean);
          }
        }
      }
    }
  }

  return Array.from(found);
}

// ══════════════════════════════════════════════════════════════════
// ── Semantic Industry Classification ─────────────────────────────
// ══════════════════════════════════════════════════════════════════

// Industry "profile vectors": weighted keyword lists with importance scores
const INDUSTRY_PROFILES: {
  name: string;
  keywords: Map<string, number>; // keyword → weight (1-10)
}[] = [
  {
    name: "AI / Machine Learning",
    keywords: new Map([
      ["machine learning", 10], ["deep learning", 10], ["neural network", 9],
      ["tensorflow", 9], ["pytorch", 9], ["scikit-learn", 8], ["keras", 8],
      ["nlp", 8], ["computer vision", 8], ["model training", 7], ["data pipeline", 7],
      ["feature engineering", 8], ["classification", 7], ["regression", 7],
      ["reinforcement learning", 8], ["transformer", 8], ["bert", 8], ["gpt", 7],
      ["hugging face", 7], ["langchain", 7], ["llm", 8], ["prediction", 6],
      ["accuracy", 5], ["hyperparameter", 7], ["epoch", 6], ["gradient", 7],
      ["lstm", 8], ["cnn", 8], ["rnn", 7], ["gan", 7], ["mlops", 8],
      ["python", 5], ["numpy", 6], ["pandas", 5], ["scipy", 5],
    ]),
  },
  {
    name: "Data Science & Analytics",
    keywords: new Map([
      ["data science", 10], ["data analysis", 9], ["statistics", 8],
      ["data visualization", 8], ["tableau", 8], ["power bi", 8],
      ["pandas", 7], ["numpy", 6], ["matplotlib", 7], ["seaborn", 7],
      ["sql", 6], ["excel", 5], ["r programming", 7], ["hypothesis testing", 8],
      ["a/b testing", 8], ["etl", 7], ["data warehouse", 7], ["snowflake", 7],
      ["databricks", 7], ["apache spark", 8], ["hadoop", 7], ["airflow", 7],
      ["big data", 7], ["data lake", 6], ["data modeling", 7],
      ["business intelligence", 7], ["kpi", 6], ["dashboard", 5],
      ["predictive analytics", 8], ["time series", 7],
    ]),
  },
  {
    name: "Software Engineering",
    keywords: new Map([
      ["software engineer", 10], ["full stack", 9], ["backend", 8], ["frontend", 8],
      ["react", 7], ["angular", 7], ["vue", 7], ["node.js", 7],
      ["javascript", 6], ["typescript", 7], ["python", 5], ["java", 6],
      ["rest api", 7], ["graphql", 7], ["microservices", 8], ["design patterns", 8],
      ["system design", 8], ["clean code", 7], ["unit testing", 7], ["tdd", 7],
      ["code review", 6], ["git", 5], ["agile", 5], ["scrum", 5],
      ["database", 5], ["postgresql", 6], ["mongodb", 6], ["redis", 6],
      ["authentication", 6], ["authorization", 6], ["scalable", 7],
    ]),
  },
  {
    name: "DevOps & Cloud Engineering",
    keywords: new Map([
      ["devops", 10], ["docker", 9], ["kubernetes", 9], ["terraform", 9],
      ["aws", 8], ["azure", 8], ["gcp", 7], ["ci/cd", 9], ["jenkins", 8],
      ["ansible", 8], ["infrastructure as code", 9], ["monitoring", 7],
      ["prometheus", 7], ["grafana", 7], ["elk stack", 7], ["nginx", 6],
      ["load balancer", 7], ["auto scaling", 7], ["cloudformation", 7],
      ["helm", 7], ["linux", 6], ["bash", 5], ["yaml", 5],
      ["github actions", 7], ["gitlab ci", 7], ["deployment", 6],
      ["containerization", 8], ["orchestration", 8], ["vpc", 6], ["iam", 6],
    ]),
  },
  {
    name: "Cybersecurity",
    keywords: new Map([
      ["cybersecurity", 10], ["security", 8], ["penetration testing", 9],
      ["vulnerability", 8], ["firewall", 7], ["encryption", 8], ["soc", 8],
      ["siem", 8], ["incident response", 9], ["threat", 7], ["malware", 7],
      ["forensics", 8], ["compliance", 7], ["iso 27001", 7], ["soc2", 7],
      ["nist", 7], ["owasp", 8], ["ethical hacking", 8], ["burp suite", 7],
      ["wireshark", 7], ["metasploit", 7], ["ids", 7], ["ips", 7],
      ["risk assessment", 7], ["access control", 7], ["zero trust", 8],
    ]),
  },
  {
    name: "Frontend Development",
    keywords: new Map([
      ["frontend", 10], ["front-end", 10], ["react", 9], ["angular", 8],
      ["vue", 8], ["next.js", 8], ["html", 7], ["css", 7], ["sass", 6],
      ["tailwind", 7], ["responsive design", 8], ["ui", 7], ["ux", 7],
      ["figma", 6], ["component", 6], ["state management", 7], ["redux", 7],
      ["webpack", 6], ["vite", 6], ["accessibility", 7], ["wcag", 7],
      ["animation", 5], ["svg", 5], ["typescript", 6], ["javascript", 6],
      ["single page application", 7], ["progressive web app", 7],
    ]),
  },
  {
    name: "Backend Development",
    keywords: new Map([
      ["backend", 10], ["back-end", 10], ["node.js", 8], ["express", 7],
      ["django", 7], ["flask", 7], ["spring boot", 8], ["fastapi", 7],
      ["rest api", 8], ["graphql", 7], ["microservices", 8], ["database", 7],
      ["postgresql", 7], ["mysql", 6], ["mongodb", 7], ["redis", 7],
      ["message queue", 7], ["kafka", 7], ["rabbitmq", 7],
      ["authentication", 7], ["jwt", 6], ["oauth", 6], ["caching", 7],
      ["rate limiting", 6], ["server", 5], ["api gateway", 7],
    ]),
  },
  {
    name: "Mobile Development",
    keywords: new Map([
      ["mobile", 10], ["ios", 9], ["android", 9], ["react native", 9],
      ["flutter", 9], ["swift", 8], ["kotlin", 8], ["xcode", 7],
      ["android studio", 7], ["app store", 6], ["google play", 6],
      ["push notification", 6], ["mobile ui", 7], ["responsive", 5],
      ["cross-platform", 8], ["expo", 6], ["firebase", 6],
    ]),
  },
];

/**
 * Semantic industry classification using weighted cosine-like scoring
 * Instead of binary keyword matching, weights how important each keyword is
 */
export function classifyIndustry(text: string): {
  industries: { name: string; confidence: number; topMatches: string[] }[];
  primary: string;
} {
  const lower = text.toLowerCase();

  const results: { name: string; confidence: number; topMatches: string[] }[] = [];

  for (const profile of INDUSTRY_PROFILES) {
    let totalWeight = 0;
    let matchedWeight = 0;
    const matches: { keyword: string; weight: number }[] = [];

    for (const [keyword, weight] of profile.keywords) {
      totalWeight += weight;
      if (lower.includes(keyword.toLowerCase())) {
        matchedWeight += weight;
        matches.push({ keyword, weight });
      }
    }

    if (matchedWeight > 0) {
      const confidence = Math.min(Math.round((matchedWeight / totalWeight) * 200), 100); // scale up
      matches.sort((a, b) => b.weight - a.weight);
      results.push({
        name: profile.name,
        confidence,
        topMatches: matches.slice(0, 8).map((m) => m.keyword),
      });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);

  return {
    industries: results.slice(0, 4),
    primary: results[0]?.name || "General",
  };
}

// ══════════════════════════════════════════════════════════════════
// ── Combined NLP Analysis ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

export interface NlpAnalysisResult {
  tfidfKeywords: string[];
  dynamicSkills: string[];
  bigrams: string[];
  trigrams: string[];
  industryClassification: ReturnType<typeof classifyIndustry>;
  allDetectedSkills: string[];
}

/**
 * Run complete NLP analysis on resume text
 */
export function runNlpAnalysis(text: string, knownKeywords: string[]): NlpAnalysisResult {
  const tfidfKeywords = extractKeywordsTfIdf(text);
  const dynamicSkills = detectDynamicSkills(text);
  const bigrams = extractNgrams(text, 2);
  const trigrams = extractNgrams(text, 3);
  const industryClassification = classifyIndustry(text);

  // Merge all detected skills into a deduplicated list
  const allSkills = new Set<string>();
  for (const kw of knownKeywords) allSkills.add(kw.toLowerCase());
  for (const kw of tfidfKeywords) allSkills.add(kw);
  for (const kw of dynamicSkills) allSkills.add(kw);

  // Filter bigrams that look like real skills (contain at least one known tech term)
  for (const bg of bigrams) {
    const parts = bg.split(" ");
    if (parts.some((p) => knownKeywords.some((k) => k.toLowerCase().includes(p)))) {
      allSkills.add(bg);
    }
  }

  return {
    tfidfKeywords,
    dynamicSkills,
    bigrams,
    trigrams,
    industryClassification,
    allDetectedSkills: Array.from(allSkills).slice(0, 50),
  };
}
