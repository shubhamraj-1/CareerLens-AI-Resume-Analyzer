/**
 * Sanitize text for jsPDF rendering.
 * jsPDF's default helvetica font only supports Latin-1 (ISO 8859-1).
 * This strips/replaces emojis, unusual unicode, and non-Latin1 chars
 * so the exported PDF looks clean and professional.
 */
export function sanitizeForPdf(text: string): string {
  let s = text;

  // 1. Replace common unicode bullets with standard bullet or hyphen
  s = s.replace(/[\u2022\u2023\u25AA\u25AB\u25B8\u25B9\u25BA\u25CB\u25CF\u25D8\u25E6\u2043\u2219\u27A2\u27A4\u2666\u25A0\u25A1]/g, "-");

  // 2. Replace smart quotes with standard quotes
  s = s.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  s = s.replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  // 3. Replace em/en dashes with standard dash
  s = s.replace(/[\u2013\u2014]/g, "-");

  // 4. Replace ellipsis with three dots
  s = s.replace(/\u2026/g, "...");

  // 5. Replace common emojis with text equivalents
  s = s.replace(/🚀/g, ">");
  s = s.replace(/💡/g, "*");
  s = s.replace(/📩/g, ">");
  s = s.replace(/📄/g, "");
  s = s.replace(/📊/g, "");
  s = s.replace(/📖/g, "");
  s = s.replace(/🏢/g, "");
  s = s.replace(/🎮/g, "");
  s = s.replace(/✅/g, "[OK]");
  s = s.replace(/❌/g, "[X]");
  s = s.replace(/⚠️/g, "[!]");
  s = s.replace(/✍️/g, "");
  s = s.replace(/🎯/g, ">");
  s = s.replace(/✨/g, "*");
  s = s.replace(/👋/g, "");
  s = s.replace(/🔒/g, "");

  // 6. Strip all remaining emojis and symbols outside Latin-1 range
  // Keep basic Latin (0020-007E), Latin-1 Supplement (00A0-00FF), and common punctuation
  s = s.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, "");

  // 7. Collapse multiple spaces/blank lines
  s = s.replace(/ {2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}
