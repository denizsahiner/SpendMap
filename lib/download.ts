export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPdf(
  filename: string,
  title: string,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return;
  const { default: jsPDF } = await import("jspdf");
  const headers = Object.keys(rows[0]);

  const orientation = headers.length > 5 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation });

  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const tableW = pageW - margin * 2;
  const colW = tableW / headers.length;

  // Title
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text(title, margin, 18);
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`SpendMap  ·  ${new Date().toLocaleDateString("en-GB")}`, margin, 25);

  let y = 33;

  // Header row
  doc.setFillColor(17, 24, 39);
  doc.rect(margin, y, tableW, 8, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  headers.forEach((h, i) =>
    doc.text(
      h.replace(/_/g, " ").toUpperCase(),
      margin + i * colW + 2,
      y + 5.5,
    ),
  );
  y += 8;

  // Data rows
  rows.forEach((row, ri) => {
    if (y > 272) {
      doc.addPage();
      y = 20;
    }
    if (ri % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, tableW, 6.5, "F");
    }
    doc.setFontSize(7.5);
    doc.setTextColor(17, 24, 39);
    headers.forEach((h, i) => {
      const s = String(row[h] ?? "");
      const maxChars = Math.floor(colW / 2);
      const display = s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
      doc.text(display, margin + i * colW + 2, y + 4.5);
    });
    y += 6.5;
  });

  doc.save(`${filename}.pdf`);
}

export async function downloadReportPdf(filename: string, title: string, markdown: string) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margin = 18;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkY = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin + 4; }
  };

  // Header
  doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
  const titleLines = doc.splitTextToSize(title, contentW);
  doc.text(titleLines, margin, y); y += titleLines.length * 8 + 2;

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
  doc.text(`SpendMap Analytics  ·  ${new Date().toLocaleDateString("en-GB")}`, margin, y); y += 5;

  doc.setDrawColor(106, 169, 170); doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y); y += 8;

  // Parse markdown line by line
  const lines = markdown.split("\n");
  let inTable = false;
  let tableHeaderDone = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      if (inTable) { inTable = false; tableHeaderDone = false; y += 3; }
      else y += 3;
      continue;
    }

    if (line.startsWith("# ")) {
      checkY(14);
      y += 2;
      doc.setFontSize(15); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
      const w = doc.splitTextToSize(line.slice(2), contentW);
      doc.text(w, margin, y); y += w.length * 7 + 3;
      continue;
    }

    if (line.startsWith("## ")) {
      checkY(14);
      y += 3;
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
      const w = doc.splitTextToSize(line.slice(3), contentW);
      doc.text(w, margin, y); y += w.length * 6 + 1;
      doc.setDrawColor(220, 222, 230); doc.setLineWidth(0.25);
      doc.line(margin, y + 1, pageW - margin, y + 1); y += 5;
      continue;
    }

    if (line.startsWith("### ")) {
      checkY(8);
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(55, 65, 81);
      const w = doc.splitTextToSize(line.slice(4), contentW);
      doc.text(w, margin, y); y += w.length * 5.5 + 2;
      continue;
    }

    if (line.startsWith("|")) {
      // Separator row (|---|---|) → just mark header done, no line drawn here
      if (/^\|[-:| ]+\|$/.test(line)) {
        tableHeaderDone = true;
        continue;
      }

      const cells = line.split("|").slice(1, -1).map(c => c.trim().replace(/\*\*/g, ""));
      if (!cells.length) continue;

      checkY(7);
      const colW = contentW / cells.length;
      const isHeader = !tableHeaderDone;

      if (isHeader) {
        doc.setFillColor(240, 242, 246);
        doc.rect(margin, y - 4.5, contentW, 7, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(17, 24, 39);
      } else {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(55, 65, 81);
      }

      cells.forEach((cell, i) => {
        const max = Math.floor(colW / 2.1);
        const display = cell.length > max ? cell.slice(0, max - 1) + "…" : cell;
        doc.text(display, margin + i * colW + 1, y);
      });

      // Draw bottom border: for header → thick dark line, for data rows → light separator
      if (isHeader) {
        doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.35);
        doc.line(margin, y + 3, pageW - margin, y + 3);
        y += 7; // extra gap after header
      } else {
        doc.setDrawColor(225, 228, 235); doc.setLineWidth(0.15);
        doc.line(margin, y + 3, pageW - margin, y + 3);
        y += 6;
      }

      inTable = true;
      continue;
    }

    if (inTable) { inTable = false; tableHeaderDone = false; y += 3; }

    if (/^[-*] /.test(line)) {
      checkY(6);
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
      const t = "•  " + line.slice(2).replace(/\*\*/g, "").replace(/\*/g, "");
      const w = doc.splitTextToSize(t, contentW - 6);
      doc.text(w, margin + 4, y); y += w.length * 5 + 1;
      continue;
    }

    checkY(6);
    doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
    const t = line.replace(/\*\*/g, "").replace(/\*/g, "");
    const w = doc.splitTextToSize(t, contentW);
    doc.text(w, margin, y); y += w.length * 5.5 + 2;
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(160, 163, 175);
    doc.text("SpendMap Analytics", margin, pageH - 8);
    doc.text(`${p} / ${total}`, pageW - margin, pageH - 8, { align: "right" });
  }

  doc.save(`${filename}.pdf`);
}
