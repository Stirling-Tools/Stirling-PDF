/**
 * Performance pictures, drawn from the recorded numbers and rasterised to PNG.
 *
 * The report template only renders `data:image/(png|jpeg|gif|webp)` sources, so
 * every picture is rasterised through Chromium before it reaches the manifest;
 * an SVG file reference would be silently dropped by the viewer. Each chart
 * takes the measurement series as input and draws nothing that was not
 * recorded — no decorative heatmaps.
 */

import type { Browser } from "playwright";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CdpSnapshot, LongTaskEntry, PhaseMark } from "./types";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { round } from "./metrics";

const WIDTH = 1200;
const BAR_H = 22;
const FONT = "12px -apple-system, Segoe UI, Roboto, sans-serif";
const AXIS = "#8a8f98";
const INK = "#1f2328";
const ACCENT = "#3b6fd4";
const WARN = "#c2410c";
const OK = "#2f855a";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(
  x: number,
  y: number,
  value: string,
  fill = INK,
  anchor = "start",
): string {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="12" fill="${fill}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function frame(
  height: number,
  inner: string,
  title: string,
  subtitle: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
<rect width="${WIDTH}" height="${height}" fill="#ffffff"/>
${text(16, 24, title, INK)}
${subtitle ? text(16, 42, subtitle, AXIS) : ""}
${inner}
</svg>`;
}

export interface ChartInput {
  width: number;
  height: number;
  svg: string;
}

/**
 * Long-task bars over the observation window, with phase markers. `windowMs`
 * is the measured span; every bar keeps its real start offset and duration so
 * overlap is visible rather than averaged away.
 */
export function timelineChart(
  entries: LongTaskEntry[],
  marks: PhaseMark[],
  windowMs: number,
): ChartInput {
  const height = 200;
  const top = 70;
  const plot = WIDTH - 64;
  const span = Math.max(windowMs, 1);
  const x = (at: number): number => 32 + (Math.min(at, span) / span) * plot;
  const parts: string[] = [];
  parts.push(
    `<line x1="32" y1="${top + 60}" x2="${32 + plot}" y2="${top + 60}" stroke="${AXIS}"/>`,
  );
  for (const mark of marks) {
    const at = x(mark.at);
    parts.push(
      `<line x1="${at}" y1="${top - 10}" x2="${at}" y2="${top + 60}" stroke="${AXIS}" stroke-dasharray="3 3"/>`,
      text(at + 3, top - 14, `${mark.label} ${round(mark.at)} ms`, AXIS),
    );
  }
  entries.forEach((entry, index) => {
    const y = top + (index % 3) * 16;
    const start = x(entry.start);
    const width = Math.max(1.5, x(entry.start + entry.duration) - start);
    const fill = entry.duration > 200 ? WARN : ACCENT;
    parts.push(
      `<rect x="${start}" y="${y}" width="${width}" height="12" fill="${fill}" opacity="0.85"><title>${escapeXml(
        `${round(entry.duration)} ms at ${round(entry.start)} ms`,
      )}</title></rect>`,
    );
  });
  const subtitle = entries.length
    ? `${entries.length} long task(s) >50 ms over ${round(span)} ms; bars keep measured start and duration`
    : `no long tasks >50 ms observed over ${round(span)} ms`;
  return {
    width: WIDTH,
    height,
    svg: frame(height, parts.join("\n"), "Main-thread long tasks", subtitle),
  };
}

export interface BarRow {
  label: string;
  value: number;
  unit?: string;
  tone?: "accent" | "warn" | "ok";
}

/** Horizontal bars for measured category totals (CPU attribution). */
export function breakdownChart(rows: BarRow[], subtitle: string): ChartInput {
  const height = 70 + rows.length * BAR_H + 20;
  const labelW = 260;
  const plot = WIDTH - labelW - 96;
  const max = Math.max(1, ...rows.map((row) => row.value));
  const parts: string[] = rows.map((row, index) => {
    const y = 66 + index * BAR_H;
    const width = Math.max(1, (row.value / max) * plot);
    const fill = row.tone === "warn" ? WARN : row.tone === "ok" ? OK : ACCENT;
    return [
      text(16, y + 13, row.label, INK),
      `<rect x="${labelW}" y="${y}" width="${width}" height="14" fill="${fill}" opacity="0.85"/>`,
      text(
        labelW + plot + 8,
        y + 13,
        `${round(row.value)}${row.unit ? ` ${row.unit}` : ""}`,
        AXIS,
      ),
    ].join("\n");
  });
  return {
    width: WIDTH,
    height,
    svg: frame(height, parts.join("\n"), "Measured work attribution", subtitle),
  };
}

export interface CycleRow {
  label: string;
  layout: number;
  recalcStyle: number;
  longTasks: number;
}

/** Grouped bars per open/use/close cycle: rendering counts and long tasks. */
export function renderingChart(
  cycles: CycleRow[],
  subtitle: string,
): ChartInput {
  const height = 90 + 120;
  const top = 70;
  const plotH = 100;
  const slot = (WIDTH - 64) / Math.max(cycles.length, 1);
  const series: { key: keyof CycleRow & string; color: string }[] = [
    { key: "layout", color: ACCENT },
    { key: "recalcStyle", color: OK },
    { key: "longTasks", color: WARN },
  ];
  const max = Math.max(
    1,
    ...cycles.flatMap((cycle) => [
      cycle.layout,
      cycle.recalcStyle,
      cycle.longTasks,
    ]),
  );
  const parts: string[] = [];
  cycles.forEach((cycle, index) => {
    const baseX = 32 + index * slot;
    series.forEach((item, seriesIndex) => {
      const value = Number(cycle[item.key]);
      const barH = Math.max(1, (value / max) * plotH);
      parts.push(
        `<rect x="${baseX + 8 + seriesIndex * 18}" y="${top + plotH - barH}" width="14" height="${barH}" fill="${item.color}"><title>${escapeXml(
          `${cycle.label} ${item.key}: ${value}`,
        )}</title></rect>`,
      );
      parts.push(
        text(
          baseX + 14 + seriesIndex * 18,
          top + plotH + 14 + seriesIndex * 12,
          `${item.key.slice(0, 4)} ${value}`,
          AXIS,
          "middle",
        ),
      );
    });
    parts.push(text(baseX + slot / 2 - 8, top - 8, cycle.label, INK));
  });
  parts.push(
    `<line x1="32" y1="${top + plotH}" x2="${WIDTH - 32}" y2="${top + plotH}" stroke="${AXIS}"/>`,
  );
  return {
    width: WIDTH,
    height,
    svg: frame(
      height,
      parts.join("\n"),
      "Rendering activity per cycle",
      subtitle,
    ),
  };
}

/** DOM nodes and JS heap across the sampled window, normalised per series. */
export function recoveryChart(
  samples: CdpSnapshot[],
  subtitle: string,
): ChartInput {
  const height = 210;
  const top = 70;
  const plotH = 90;
  const plot = WIDTH - 64;
  const span = Math.max(samples.length - 1, 1);
  const x = (index: number): number => 32 + (index / span) * plot;
  const parts: string[] = [];
  const series: { label: string; values: number[]; color: string }[] = [
    { label: "DOM nodes", values: samples.map((s) => s.nodes), color: ACCENT },
    {
      label: "JS heap (MB)",
      values: samples.map((s) => s.jsHeapUsedSize / 1048576),
      color: OK,
    },
  ];
  for (const item of series) {
    const max = Math.max(1, ...item.values);
    const points = item.values
      .map(
        (value, index) =>
          `${round(x(index), 1)},${round(top + plotH - (value / max) * plotH, 1)}`,
      )
      .join(" ");
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2"/>`,
    );
    parts.push(
      text(
        32,
        top + plotH + 30 + series.indexOf(item) * 16,
        `${item.label}: max ${round(max)}`,
        item.color,
      ),
    );
  }
  parts.push(
    `<line x1="32" y1="${top + plotH}" x2="${WIDTH - 32}" y2="${top + plotH}" stroke="${AXIS}"/>`,
  );
  return {
    width: WIDTH,
    height,
    svg: frame(
      height,
      parts.join("\n"),
      "DOM and JS heap across the window",
      subtitle,
    ),
  };
}

/**
 * Renders an SVG chart to a PNG file through Chromium. The page has to be a
 * real one: the template rejects SVG data URIs, so text and bars must be
 * composited into pixels here.
 */
export async function rasterise(
  browser: Browser,
  chart: ChartInput,
  outPath: string,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: chart.width, height: chart.height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${chart.svg}</body></html>`,
    );
    await page
      .locator("svg")
      .screenshot({ path: outPath, omitBackground: false });
  } finally {
    await page.close();
  }
}
