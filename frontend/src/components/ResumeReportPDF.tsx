import { forwardRef } from "react";
import type { Analysis } from "@/types";

interface ResumeReportPDFProps {
  atsScore: number;
  analysis: Analysis;
  fileName: string;
  candidateName: string;
}

/**
 * Hidden, light-themed A4 report template.
 * Rendered off-screen and captured by html2canvas → jsPDF.
 * Uses inline styles to guarantee white background regardless of app theme.
 */
export const ResumeReportPDF = forwardRef<HTMLDivElement, ResumeReportPDFProps>(
  ({ atsScore, analysis, fileName, candidateName }, ref) => {
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const scoreColor =
      atsScore >= 80
        ? "#16a34a"
        : atsScore >= 60
          ? "#65a30d"
          : atsScore >= 40
            ? "#ca8a04"
            : "#dc2626";

    const scoreLabel =
      atsScore >= 80
        ? "Excellent"
        : atsScore >= 60
          ? "Good"
          : atsScore >= 40
            ? "Average"
            : "Needs Improvement";

    const sections = [
      { label: "Skills", score: analysis.skillsScore },
      { label: "Experience", score: analysis.experienceScore },
      { label: "Education", score: analysis.educationScore },
      { label: "Projects", score: analysis.projectsScore },
    ];

    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "794px", // A4 width at 96 DPI
          backgroundColor: "#ffffff",
          color: "#1f2937",
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          fontSize: "14px",
          lineHeight: 1.6,
          padding: 0,
          margin: 0,
        }}
      >
        {/* ═══ BRANDED HEADER ═══ */}
        <div
          style={{
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)",
            padding: "32px 40px",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px" }}>
                ResumeAI Analyzer
              </div>
              <div style={{ fontSize: "13px", opacity: 0.85, marginTop: "4px" }}>
                AI-Powered Resume Analysis Report
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "12px", opacity: 0.9 }}>
              <div>{date}</div>
              <div style={{ marginTop: "2px" }}>Confidential</div>
            </div>
          </div>
        </div>

        {/* ═══ CANDIDATE INFO BAR ═══ */}
        <div
          style={{
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            padding: "16px 40px",
            display: "flex",
            gap: "32px",
            fontSize: "13px",
          }}
        >
          <div>
            <span style={{ color: "#94a3b8" }}>Candidate: </span>
            <span style={{ fontWeight: 600, color: "#1e293b" }}>{candidateName}</span>
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>Resume: </span>
            <span style={{ fontWeight: 600, color: "#1e293b" }}>{fileName}</span>
          </div>
        </div>

        {/* ═══ BODY CONTENT ═══ */}
        <div style={{ padding: "32px 40px 40px" }}>

          {/* ── ATS Score Hero ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "24px",
              marginBottom: "32px",
              padding: "24px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              background: "#fafbff",
            }}
          >
            <div
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: scoreColor,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{atsScore}%</div>
              <div style={{ fontSize: "10px", opacity: 0.9, marginTop: "2px" }}>ATS Score</div>
            </div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: scoreColor }}>{scoreLabel}</div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                Your resume's overall ATS compatibility rating based on skills, experience, education, and project sections.
              </div>
            </div>
          </div>

          {/* ── Section Scores ── */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "14px", color: "#0f172a" }}>
              📊 Section Breakdown
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {sections.map((s) => {
                const barColor =
                  s.score >= 80 ? "#22c55e" : s.score >= 60 ? "#84cc16" : s.score >= 40 ? "#eab308" : "#ef4444";
                return (
                  <div
                    key={s.label}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "10px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 600, fontSize: "13px" }}>{s.label}</span>
                      <span style={{ fontWeight: 700, fontSize: "14px", color: barColor }}>{s.score}%</span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "3px",
                        background: "#f1f5f9",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${s.score}%`,
                          borderRadius: "3px",
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Keywords Found ── */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px", color: "#0f172a" }}>
              ✅ Keywords Found ({analysis.keywords.filter((k) => !k.startsWith("(")).length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {analysis.keywords.length > 0 ? (
                analysis.keywords.map((kw) => (
                  <span
                    key={kw}
                    style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                    }}
                  >
                    {kw}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>No keywords detected</span>
              )}
            </div>
          </div>

          {/* ── Missing Keywords ── */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px", color: "#0f172a" }}>
              ⚠️ Missing Keywords ({analysis.missingKeywords.filter((k) => !k.startsWith("(")).length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {analysis.missingKeywords.length > 0 ? (
                analysis.missingKeywords.map((kw) => (
                  <span
                    key={kw}
                    style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: "#fef3c7",
                      color: "#92400e",
                    }}
                  >
                    {kw}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  None — great keyword coverage!
                </span>
              )}
            </div>
          </div>

          {/* ── AI Suggestions ── */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "14px", color: "#0f172a" }}>
              💡 AI Improvement Suggestions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {analysis.suggestions.map((suggestion, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    background: i % 2 === 0 ? "#fafbff" : "#ffffff",
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: "12px", lineHeight: 1.6, color: "#374151" }}>
                    {suggestion}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <div
          style={{
            padding: "16px 40px",
            borderTop: "1px solid #e2e8f0",
            textAlign: "center",
            fontSize: "10px",
            color: "#94a3b8",
          }}
        >
          Generated by ResumeAI Analyzer — {date} — This is an AI-generated analysis. Results may vary.
        </div>
      </div>
    );
  }
);

ResumeReportPDF.displayName = "ResumeReportPDF";
