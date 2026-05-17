/**
 * Four hand-crafted document mockup SVGs that look like real rendered
 * PDF pages — letter, invoice, report cover, receipt. Each file we
 * seed picks one deterministically from its name so re-renders are
 * stable and the manager looks populated by real documents rather
 * than abstract artwork.
 *
 * No noisy gradients, no skies, no fake landmarks — just plausible
 * document layouts.
 */

const PAGE_W = 320;
const PAGE_H = 420; // 4:3-ish portrait, matches PDF page aspect roughly

function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

const FONT = "-apple-system, Segoe UI, Helvetica, sans-serif";

/** Body line — a single subtle grey bar mimicking text. */
function bodyLine(x: number, y: number, w: number, opacity = 0.65): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="#374151" fill-opacity="${opacity}"/>`;
}

function letterTemplate(): string {
  const lines = [];
  // Body paragraphs — 3 blocks, mixed line widths
  let y = 175;
  for (let block = 0; block < 3; block += 1) {
    for (let i = 0; i < 4; i += 1) {
      const w = 200 + ((i * 17 + block * 11) % 45);
      lines.push(bodyLine(40, y, w));
      y += 11;
    }
    y += 12;
  }
  return svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
    <rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>
    <rect x="40" y="40" width="120" height="8" rx="3" fill="#111827"/>
    <rect x="40" y="56" width="80" height="5" rx="2" fill="#6b7280"/>
    <rect x="40" y="64" width="100" height="5" rx="2" fill="#6b7280"/>
    <rect x="220" y="40" width="60" height="5" rx="2" fill="#6b7280"/>
    <rect x="220" y="50" width="40" height="5" rx="2" fill="#6b7280"/>
    <rect x="40" y="120" width="160" height="9" rx="3" fill="#111827"/>
    <rect x="40" y="148" width="40" height="5" rx="2" fill="#374151"/>
    ${lines.join("")}
    <rect x="40" y="${y + 24}" width="80" height="3" rx="2" fill="#111827"/>
    <rect x="40" y="${y + 32}" width="60" height="4" rx="2" fill="#6b7280"/>
  </svg>`);
}

function invoiceTemplate(): string {
  // Header
  const header = `<rect x="0" y="0" width="${PAGE_W}" height="50" fill="#1e3a8a"/>
    <text x="24" y="32" font-family="${FONT}" font-size="18" font-weight="700" fill="#ffffff">INVOICE</text>
    <text x="${PAGE_W - 24}" y="32" font-family="${FONT}" font-size="12" font-weight="500" fill="#dbeafe" text-anchor="end">No. 2024-0481</text>`;
  // Meta rows
  const meta = `<rect x="24" y="70" width="60" height="5" rx="2" fill="#6b7280"/>
    <rect x="24" y="80" width="110" height="6" rx="2" fill="#111827"/>
    <rect x="24" y="92" width="90" height="5" rx="2" fill="#374151"/>
    <rect x="${PAGE_W - 140}" y="70" width="50" height="5" rx="2" fill="#6b7280"/>
    <rect x="${PAGE_W - 140}" y="80" width="110" height="6" rx="2" fill="#111827"/>`;
  // Table header
  const tableHead = `<rect x="24" y="135" width="${PAGE_W - 48}" height="22" fill="#e5e7eb"/>
    <text x="32" y="150" font-family="${FONT}" font-size="9" font-weight="600" fill="#374151">DESCRIPTION</text>
    <text x="${PAGE_W - 110}" y="150" font-family="${FONT}" font-size="9" font-weight="600" fill="#374151">QTY</text>
    <text x="${PAGE_W - 64}" y="150" font-family="${FONT}" font-size="9" font-weight="600" fill="#374151" text-anchor="end">AMOUNT</text>`;
  // Rows
  const rows: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const rowY = 175 + i * 24;
    rows.push(
      `<rect x="32" y="${rowY}" width="${120 + (i * 13) % 40}" height="5" rx="2" fill="#374151"/>`,
      `<rect x="${PAGE_W - 110}" y="${rowY}" width="14" height="5" rx="2" fill="#374151"/>`,
      `<rect x="${PAGE_W - 80}" y="${rowY}" width="48" height="5" rx="2" fill="#374151"/>`,
      `<line x1="24" y1="${rowY + 12}" x2="${PAGE_W - 24}" y2="${rowY + 12}" stroke="#e5e7eb"/>`,
    );
  }
  // Total
  const total = `<rect x="${PAGE_W - 160}" y="320" width="60" height="6" rx="2" fill="#111827"/>
    <rect x="${PAGE_W - 80}" y="320" width="48" height="8" rx="2" fill="#1e3a8a"/>`;
  return svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
    <rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>
    ${header}
    ${meta}
    ${tableHead}
    ${rows.join("")}
    ${total}
  </svg>`);
}

function reportTemplate(): string {
  return svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
    <rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>
    <rect x="0" y="0" width="${PAGE_W}" height="160" fill="#0f766e"/>
    <rect x="40" y="60" width="48" height="3" rx="1" fill="#99f6e4"/>
    <text x="40" y="96" font-family="${FONT}" font-size="24" font-weight="700" fill="#ffffff">Annual</text>
    <text x="40" y="124" font-family="${FONT}" font-size="24" font-weight="700" fill="#ffffff">Report 2024</text>
    <rect x="40" y="200" width="100" height="5" rx="2" fill="#6b7280"/>
    <rect x="40" y="216" width="160" height="8" rx="2" fill="#111827"/>
    <rect x="40" y="240" width="240" height="4" rx="2" fill="#374151" fill-opacity="0.7"/>
    <rect x="40" y="252" width="220" height="4" rx="2" fill="#374151" fill-opacity="0.7"/>
    <rect x="40" y="264" width="230" height="4" rx="2" fill="#374151" fill-opacity="0.7"/>
    <rect x="40" y="276" width="180" height="4" rx="2" fill="#374151" fill-opacity="0.7"/>
    <rect x="40" y="320" width="60" height="14" rx="3" fill="#0f766e"/>
    <rect x="110" y="320" width="60" height="14" rx="3" fill="#0d9488"/>
    <rect x="180" y="320" width="60" height="14" rx="3" fill="#14b8a6"/>
    <text x="${PAGE_W / 2}" y="${PAGE_H - 24}" font-family="${FONT}" font-size="10" font-weight="500" fill="#6b7280" text-anchor="middle">Confidential · Internal use</text>
  </svg>`);
}

function receiptTemplate(): string {
  const items: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const y = 130 + i * 28;
    items.push(
      `<rect x="40" y="${y}" width="${110 + (i * 7) % 30}" height="5" rx="2" fill="#374151"/>`,
      `<rect x="${PAGE_W - 100}" y="${y}" width="60" height="5" rx="2" fill="#374151"/>`,
      `<line x1="40" y1="${y + 14}" x2="${PAGE_W - 40}" y2="${y + 14}" stroke="#e5e7eb" stroke-dasharray="2 3"/>`,
    );
  }
  return svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
    <rect width="${PAGE_W}" height="${PAGE_H}" fill="#fafaf9"/>
    <rect x="40" y="40" width="${PAGE_W - 80}" height="${PAGE_H - 80}" rx="6" fill="#ffffff" stroke="#e5e7eb"/>
    <text x="${PAGE_W / 2}" y="78" font-family="${FONT}" font-size="14" font-weight="700" fill="#111827" text-anchor="middle">RECEIPT</text>
    <line x1="60" y1="90" x2="${PAGE_W - 60}" y2="90" stroke="#9ca3af"/>
    <rect x="60" y="100" width="80" height="4" rx="2" fill="#6b7280"/>
    <rect x="${PAGE_W - 140}" y="100" width="80" height="4" rx="2" fill="#6b7280"/>
    ${items.join("")}
    <line x1="40" y1="320" x2="${PAGE_W - 40}" y2="320" stroke="#374151"/>
    <rect x="40" y="332" width="40" height="6" rx="2" fill="#111827"/>
    <rect x="${PAGE_W - 100}" y="328" width="60" height="10" rx="3" fill="#111827"/>
    <text x="${PAGE_W / 2}" y="${PAGE_H - 52}" font-family="${FONT}" font-size="9" fill="#9ca3af" text-anchor="middle">Thank you for your business</text>
  </svg>`);
}

// Pre-compute once — the SVGs don't depend on the file content.
const TEMPLATES: string[] = [
  letterTemplate(),
  invoiceTemplate(),
  reportTemplate(),
  receiptTemplate(),
];

/**
 * Deterministically pick one of the four templates based on the
 * filename so re-renders are stable and a folder of seeded files
 * shows a varied set.
 */
export function generateSampleThumbnail(filename: string): string {
  let hash = 0;
  for (let i = 0; i < filename.length; i += 1) {
    hash = (hash * 31 + filename.charCodeAt(i)) | 0;
  }
  return TEMPLATES[Math.abs(hash) % TEMPLATES.length]!;
}
