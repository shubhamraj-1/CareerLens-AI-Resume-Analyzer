import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Analysis } from "@/types";
import { sanitizeForPdf } from "./sanitizePdf";

export function generateAnalysisReport(
  analysis: Analysis,
  fileName: string,
  atsScore: number,
  userName: string
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // ── Header ──
  doc.setFillColor(79, 70, 229); // brand-600
  doc.rect(0, 0, pageWidth, 45, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("AI Resume Analysis Report", pageWidth / 2, 18, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Resume: ${fileName}`, pageWidth / 2, 28, { align: "center" });
  doc.text(`Candidate: ${userName}  |  Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, 36, { align: "center" });

  y = 55;

  // ── ATS Score Section ──
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ATS Compatibility Score", 14, y);
  y += 8;

  const scoreColor = atsScore >= 80 ? [34, 197, 94] : atsScore >= 60 ? [132, 204, 22] : atsScore >= 40 ? [234, 179, 8] : [239, 68, 68];
  doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.roundedRect(14, y, 60, 20, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`${atsScore}%`, 44, y + 14, { align: "center" });

  const scoreLabel = atsScore >= 80 ? "Excellent" : atsScore >= 60 ? "Good" : atsScore >= 40 ? "Average" : "Needs Improvement";
  doc.setTextColor(107, 114, 128);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(scoreLabel, 82, y + 13);
  y += 30;

  // ── Section Scores Table ──
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Section Scores", 14, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [["Section", "Score", "Rating"]],
    body: [
      ["Skills", `${analysis.skillsScore}%`, getLabel(analysis.skillsScore)],
      ["Experience", `${analysis.experienceScore}%`, getLabel(analysis.experienceScore)],
      ["Education", `${analysis.educationScore}%`, getLabel(analysis.educationScore)],
      ["Projects", `${analysis.projectsScore}%`, getLabel(analysis.projectsScore)],
    ],
    theme: "grid",
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    styles: { fontSize: 11, cellPadding: 5 },
    margin: { left: 14, right: 14 },
    rowPageBreak: "avoid",
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 50;
  y += 10;

  // ── Helper: safe text block with automatic page break ──
  const pageHeight = doc.internal.pageSize.getHeight();
  const safeMarginBottom = 25; // leave room for footer

  function printTextBlock(title: string, lines: string[], color: number[]) {
    const blockHeight = 8 + lines.length * 5 + 6;
    // If the entire block won't fit, move to next page
    if (y + blockHeight > pageHeight - safeMarginBottom) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 6;
  }

  // ── Keywords Found ──
  const keywordsText = analysis.keywords.length > 0 ? sanitizeForPdf(analysis.keywords.join("  -  ")) : "No keywords detected";
  const keywordLines = doc.splitTextToSize(keywordsText, pageWidth - 28);
  printTextBlock("Keywords Found", keywordLines, [34, 197, 94]);

  // ── Missing Keywords ──
  const missingText = analysis.missingKeywords.length > 0 ? sanitizeForPdf(analysis.missingKeywords.join("  -  ")) : "None - great coverage!";
  const missingLines = doc.splitTextToSize(missingText, pageWidth - 28);
  printTextBlock("Missing Keywords", missingLines, [239, 68, 68]);

  // ── AI Suggestions ──
  if (y + 30 > pageHeight - safeMarginBottom) {
    doc.addPage();
    y = 20;
  }

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("AI Improvement Suggestions", 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["#", "Suggestion"]],
    body: analysis.suggestions.map((s, i) => [String(i + 1), sanitizeForPdf(s)]),
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 0: { cellWidth: 12, halign: "center" } },
    margin: { left: 14, right: 14 },
    // CRITICAL: prevent rows from splitting across pages
    rowPageBreak: "avoid",
    // If a single suggestion is too tall, allow wrapping but keep the row together
    bodyStyles: { minCellHeight: 12 },
  });

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(
      `Generated by AI Resume Analyzer  |  Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  // ── Download ──
  doc.save(`Resume-Analysis-${fileName.replace(/\.[^.]+$/, "")}.pdf`);
}

function getLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Needs Improvement";
}
