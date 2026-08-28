export type DetectionStage = { kind: "detecting" } | { kind: "done" };

export interface DetectionSummary {
  total: number;
  byType: Record<string, number>;
  pagesWithFields: number;
}

const STAGE_EVENT = "stirling:form-detection:stage";
const SUMMARY_EVENT = "stirling:form-detection:summary";

export function emitStage(stage: DetectionStage): void {
  window.dispatchEvent(new CustomEvent(STAGE_EVENT, { detail: stage }));
}

export function emitSummary(summary: DetectionSummary): void {
  window.dispatchEvent(new CustomEvent(SUMMARY_EVENT, { detail: summary }));
}

export function onStage(cb: (s: DetectionStage) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail as DetectionStage);
  window.addEventListener(STAGE_EVENT, handler);
  return () => window.removeEventListener(STAGE_EVENT, handler);
}

export function onSummary(cb: (s: DetectionSummary) => void): () => void {
  const handler = (e: Event) =>
    cb((e as CustomEvent).detail as DetectionSummary);
  window.addEventListener(SUMMARY_EVENT, handler);
  return () => window.removeEventListener(SUMMARY_EVENT, handler);
}

/** Parse the server's X-Detected-Fields header; a missing or malformed one shows nothing. */
export function parseSummary(header: unknown): DetectionSummary | null {
  if (typeof header !== "string" || header.length === 0) return null;
  try {
    const raw = JSON.parse(header) as Partial<DetectionSummary>;
    if (typeof raw.total !== "number") return null;
    return {
      total: raw.total,
      byType: raw.byType ?? {},
      pagesWithFields: raw.pagesWithFields ?? 0,
    };
  } catch {
    return null;
  }
}
