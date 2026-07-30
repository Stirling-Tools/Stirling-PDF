import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";
import type { ErasedToolParams } from "@app/hooks/tools/shared/toolOperationTypes";

/**
 * First-class document-intelligence policy steps addable from the pipeline builder.
 * They ride the unmapped-step path like integration steps (toolId null), but hit
 * internal endpoints.
 */
export interface DocIntelligenceStep {
  operation: string;
  labelKey: string;
  defaultParams: Record<string, unknown>;
}

export const RAG_INGEST_OPERATION = "/api/v1/docparse/rag-ingest";

export const DOC_INTELLIGENCE_STEPS: DocIntelligenceStep[] = [
  {
    operation: RAG_INGEST_OPERATION,
    labelKey: "portal.pipelines.builder.docIntelligence.ragIngest",
    defaultParams: {
      chunkSize: 512,
      overlap: 64,
      mode: "auto",
      index: true,
      exportMarkdown: false,
      exportChunksJsonl: false,
    },
  },
];

export function newDocIntelligenceStep(
  step: DocIntelligenceStep,
): WorkingToolStep {
  return {
    toolId: null,
    operation: step.operation,
    params: { ...step.defaultParams } as ErasedToolParams,
    support: "unknown",
  };
}

export function isDocIntelligenceOperation(operation: string): boolean {
  return DOC_INTELLIGENCE_STEPS.some((step) => step.operation === operation);
}
