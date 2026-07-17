/**
 * Builds a WYSIWYG SVG data URL for the cert-sign placement ghost / placed preview.
 * Mirrors the backend visible appearance: Signed by, date, reason, location.
 */

/** CSS-pixel width ÷ height for the cert appearance box (and ghost SVG).
 * Locked on place/resize so the widget cannot become “tall” — that shape
 * letterboxed the ghost and correlated with upside-down baked signature text.
 */
export const CERT_APPEARANCE_ASPECT_RATIO = 2;

/** Default place / cursor-ghost size in CSS pixels (aspect = {@link CERT_APPEARANCE_ASPECT_RATIO}). */
export const CERT_APPEARANCE_PLACE_WIDTH_PX = 150;
export const CERT_APPEARANCE_PLACE_HEIGHT_PX =
  CERT_APPEARANCE_PLACE_WIDTH_PX / CERT_APPEARANCE_ASPECT_RATIO;

export interface CertAppearanceGhostFields {
  name: string;
  reason: string;
  location: string;
  showLogo: boolean;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface GhostLine {
  text: string;
  /** Dimmer stroke when showing a placeholder for an empty form field. */
  placeholder: boolean;
}

/**
 * Same line order as CertSignController.buildVisibleAppearanceLines.
 * Empty Name uses a certificate-CN placeholder; empty Reason/Location still show dim
 * placeholders so the ghost previews the full layout while sizing the box.
 *
 * Date uses a stable sample string so the placement overlay is not re-bound every second.
 */
export const CERT_APPEARANCE_GHOST_DATE = "Thu Jan 01 12:00:00 GMT 2026";

export function buildCertAppearanceGhostLines(
  fields: CertAppearanceGhostFields,
  dateText: string = CERT_APPEARANCE_GHOST_DATE,
): GhostLine[] {
  const name = fields.name.trim();
  const reason = fields.reason.trim();
  const location = fields.location.trim();

  const lines: GhostLine[] = [
    {
      text: name ? `Signed by ${name}` : "Signed by [certificate name]",
      placeholder: !name,
    },
    { text: dateText, placeholder: false },
    {
      text: reason || "[Reason]",
      placeholder: !reason,
    },
    {
      text: location || "[Location]",
      placeholder: !location,
    },
  ];
  return lines;
}

/**
 * SVG data URL used by SignaturePreviewLayer (img + object-fit fill with locked aspect).
 * ViewBox matches {@link CERT_APPEARANCE_ASPECT_RATIO} so the ghost fills the box.
 */
export function buildCertAppearanceGhostDataUrl(
  fields: CertAppearanceGhostFields,
): string {
  const lines = buildCertAppearanceGhostLines(fields);
  const width = 200;
  const height = width / CERT_APPEARANCE_ASPECT_RATIO;
  const pad = 8;
  const lineCount = lines.length;
  // Mirror backend: fit into height with a floor so tiny boxes stay readable in preview.
  const fontSize = Math.max(
    9,
    Math.min(13, (height - 2 * pad) / (lineCount * 1.25)),
  );
  const leading = fontSize * 1.25;
  const filled = "rgb(0, 70, 140)";
  const muted = "rgb(0, 70, 140)";

  const textNodes = lines
    .map((line, i) => {
      const y = pad + fontSize + i * leading;
      const opacity = line.placeholder ? "0.45" : "0.95";
      const weight = i === 0 && !line.placeholder ? "600" : "500";
      return `<text x="${pad}" y="${y.toFixed(1)}" font-family="Times New Roman, Times, serif" font-size="${fontSize.toFixed(1)}" font-weight="${weight}" fill="${line.placeholder ? muted : filled}" fill-opacity="${opacity}">${escapeXml(line.text)}</text>`;
    })
    .join("");

  const logo = fields.showLogo
    ? `<g opacity="0.35">
        <circle cx="${width - 22}" cy="${height - 22}" r="14" fill="rgb(0,122,204)"/>
        <text x="${width - 22}" y="${height - 17}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="white">S</text>
      </g>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="3" fill="rgb(0,122,204)" fill-opacity="0.1" stroke="rgb(0,122,204)" stroke-width="1.5"/>
  ${textNodes}
  ${logo}
</svg>`;

  return "data:image/svg+xml," + encodeURIComponent(svg);
}
