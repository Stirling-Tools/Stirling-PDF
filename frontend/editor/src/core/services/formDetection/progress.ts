import { DetectedField } from "@app/services/formDetection/types";

export type DetectionEngine = "browser" | "server";

export type DetectionStage =
  | { kind: "starting"; engine: DetectionEngine }
  | { kind: "model-download"; loadedBytes: number; totalBytes: number | null }
  | { kind: "model-init" }
  | { kind: "rendering"; page: number; pageCount: number }
  | { kind: "analyzing"; page: number; pageCount: number }
  | { kind: "uploading" }
  | { kind: "applying" }
  | { kind: "done" };

export interface DetectionSummary {
  engine: DetectionEngine;
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

export function summarizeFields(
  fields: DetectedField[],
  engine: DetectionEngine,
): DetectionSummary {
  const byType: Record<string, number> = {};
  const pages = new Set<number>();
  for (const f of fields) {
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    pages.add(f.page);
  }
  return {
    engine,
    total: fields.length,
    byType,
    pagesWithFields: pages.size,
  };
}
