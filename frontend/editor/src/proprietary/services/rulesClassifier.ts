/**
 * The rule-based classifier in tools-core/proprietary/classify, built as the
 * `stirling-tools-proprietary` wasm module. The backend's `classify-rust`
 * endpoint runs the same code natively.
 */
import { loadRustToolsModule } from "@app/services/rustToolsModule";

// Globbed rather than imported so a build made without Rust, where the file
// does not exist, still builds; the tool then fails saying it is not built.
const MODULES = import.meta.glob<string>("./wasm/*.wasm", {
  query: "?url",
  import: "default",
  eager: true,
});
const MODULE_URL = MODULES["./wasm/stirling-tools-proprietary.wasm"];

export type RulesConfidence = "none" | "low" | "medium" | "high";

/** The classifier's verdict, as `stirling_classify` returns it. */
export interface RulesVerdict {
  /** Label ids, the most likely first; at most five, empty when none fits. */
  labels: string[];
  confidence: RulesConfidence;
  /** The winner's share of a softmax over every label and "none of these". */
  probability: number;
  score: number;
  candidates: { label: string; score: number; evidence: string[] }[];
}

/**
 * Classifies the pdfiumService document handle `document`, which the caller
 * still owns. With `record`, the verdict is also stored in the document's
 * `StirlingPDFClassification` metadata, for the caller to save.
 */
export async function classifyDocument(
  document: number,
  fileName: string,
  record: boolean,
): Promise<RulesVerdict> {
  if (!MODULE_URL) {
    throw new Error(
      "The Rust classifier is not built: run `task tools-core:build:wasm`",
    );
  }
  const module = await loadRustToolsModule(
    new URL(MODULE_URL, window.location.href).href,
  );
  const name = new TextEncoder().encode(fileName);
  const json = module.withBytes(name, (pointer) =>
    module.call(
      "stirling_classify",
      document,
      pointer,
      name.length,
      record ? 1 : 0,
    ),
  );
  return JSON.parse(json) as RulesVerdict;
}
