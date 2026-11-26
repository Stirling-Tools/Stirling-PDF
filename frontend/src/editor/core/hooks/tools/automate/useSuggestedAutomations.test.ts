import { describe, expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { type ToolId } from "@editor/types/toolId";
import {
  asRegistryConfig,
  type RegistryToolOperationConfig,
} from "@editor/hooks/tools/shared/toolOperationTypes";
import { toolParamsNeedConfiguring } from "@editor/hooks/tools/shared/toolAutomation";
import { useSuggestedAutomations } from "@editor/hooks/tools/automate/useSuggestedAutomations";
import { sanitizeOperationConfig } from "@editor/hooks/tools/sanitize/useSanitizeOperation";
import { ocrOperationConfig } from "@editor/hooks/tools/ocr/useOCROperation";
import { convertOperationConfig } from "@editor/hooks/tools/convert/useConvertOperation";
import { compressOperationConfig } from "@editor/hooks/tools/compress/useCompressOperation";
import { flattenOperationConfig } from "@editor/hooks/tools/flatten/useFlattenOperation";
import { removeAnnotationsOperationConfig } from "@editor/hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { changeMetadataOperationConfig } from "@editor/hooks/tools/changeMetadata/useChangeMetadataOperation";
import { splitOperationConfig } from "@editor/hooks/tools/split/useSplitOperation";
import { addPasswordOperationConfig } from "@editor/hooks/tools/addPassword/useAddPasswordOperation";

const configs: Partial<Record<ToolId, RegistryToolOperationConfig>> = {
  sanitize: asRegistryConfig(sanitizeOperationConfig),
  ocr: asRegistryConfig(ocrOperationConfig),
  convert: asRegistryConfig(convertOperationConfig),
  compress: asRegistryConfig(compressOperationConfig),
  flatten: asRegistryConfig(flattenOperationConfig),
  removeAnnotations: asRegistryConfig(removeAnnotationsOperationConfig),
  changeMetadata: asRegistryConfig(changeMetadataOperationConfig),
  split: asRegistryConfig(splitOperationConfig),
  addPassword: asRegistryConfig(addPasswordOperationConfig),
};

const registry = Object.fromEntries(
  Object.entries(configs).map(([id, operationConfig]) => [
    id,
    { operationConfig },
  ]),
) as unknown as Partial<ToolRegistry>;

describe("useSuggestedAutomations", () => {
  const { result } = renderHook(() => useSuggestedAutomations());
  const steps = result.current.flatMap((automation) =>
    automation.operations.map((op) => ({ automation: automation.id, ...op })),
  );

  // The run screen refuses a step its tool would reject, so a suggestion that drifts from its
  // tool's parameters would be offered and then never runnable.
  test.each(steps)(
    "$automation: $operation is runnable as suggested",
    ({ operation, parameters }) => {
      expect(configs[operation as ToolId]).toBeDefined();
      expect(
        toolParamsNeedConfiguring(operation as ToolId, parameters, registry),
      ).toBe(false);
    },
  );
});
