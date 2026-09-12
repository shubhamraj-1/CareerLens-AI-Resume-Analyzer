import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Capture a hidden HTML element and generate a properly scaled,
 * multi-page A4 PDF without cutting text in half.
 *
 * @param element - The hidden DOM element to capture
 * @param fileName - Output PDF file name (without .pdf extension)
 */
export async function generatePDFFromElement(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  // ── 1. Make element visible for capture (keep off-screen) ──
  const prevStyle = element.style.cssText;
  element.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: 794px;
    z-index: -1;
    opacity: 1;
    pointer-events: none;
    background: #ffffff;
  `;

  // Give browser a frame to reflow
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 100));

  try {
    // ── 2. Capture with html2canvas ──
    const canvas = await html2canvas(element, {
      scale: 2, // 2x for crisp text on retina
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 794,
    });

    // ── 3. Calculate A4 dimensions ──
    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgWidth = A4_WIDTH_MM;

    // ── 4. Multi-page: slice the canvas into A4-height segments ──
    const pageHeightPx = (A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width;
    const totalPages = Math.ceil(canvas.height / pageHeightPx);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      // Create a sub-canvas for this page
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);

      const ctx = pageCanvas.getContext("2d");
      if (!ctx) continue;

      // Draw the relevant slice from the full canvas
      ctx.drawImage(
        canvas,
        0,
        page * pageHeightPx,            // source Y
        canvas.width,                    // source width
        pageCanvas.height,               // source height
        0,
        0,
        pageCanvas.width,
        pageCanvas.height
      );

      const pageImgData = pageCanvas.toDataURL("image/png");
      const pageImgHeight = (pageCanvas.height * imgWidth) / pageCanvas.width;

      pdf.addImage(pageImgData, "PNG", 0, 0, imgWidth, pageImgHeight, undefined, "FAST");
    }

    // ── 5. Add page numbers to each page ──
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(180, 180, 180);
      pdf.text(
        `Page ${i} of ${pageCount}`,
        A4_WIDTH_MM / 2,
        A4_HEIGHT_MM - 5,
        { align: "center" }
      );
    }

    // ── 6. Save ──
    const safeName = fileName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    pdf.save(`${safeName}_Resume_Analysis.pdf`);
  } finally {
    // ── 7. Restore hidden style ──
    element.style.cssText = prevStyle;
  }
}
