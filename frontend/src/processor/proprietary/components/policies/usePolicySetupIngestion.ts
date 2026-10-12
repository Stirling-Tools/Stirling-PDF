import { useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PolicySetupConfigProps } from "@app/components/policies/PolicySetupWizard";
import type {
  PolicyIngestionConfig,
  IngestionDestination,
} from "@app/components/policies/PolicyIngestionConfig";
import { ingestChunkingConfigured } from "@app/policies/ingestOperation";
import { policyStepFromWire, policyStepToWire } from "@app/policies/operations";
import { fetchDocparseCapabilities } from "@portal/api/docparse";

interface Props extends Pick<PolicySetupConfigProps, "result" | "onChange"> {
  folderName?: string;
  destinationType?: string;
}

/** Keeps incomplete chunk edits local while reporting executable ingestion settings. */
export function usePolicySetupIngestion({
  result,
  onChange,
  folderName,
  destinationType,
}: Props) {
  const ingestion = result.steps
    .map(policyStepFromWire)
    .find((step) => step?.toolId === "ingest");
  const capabilities = useQuery({
    queryKey: ["policy-setup-docparse"],
    queryFn: () => fetchDocparseCapabilities(),
    enabled: Boolean(ingestion),
    staleTime: 0,
    retry: false,
  });
  const [chunkDraft, setChunkDraft] = useState<Record<string, string>>({});
  const ingestionParameters = ingestion
    ? { ...ingestion.params, ...chunkDraft }
    : null;
  const [targetDraft, setTargetDraft] = useState<IngestionDestination>();
  const target: IngestionDestination =
    targetDraft ??
    (destinationType === "vectordb" ||
    (folderName && Boolean(result.outputIds?.length))
      ? "external"
      : ingestion?.params.index === "false"
        ? "export"
        : "builtin");
  const external = Boolean(ingestion) && target === "external";
  const requiresDestination =
    Boolean(ingestion) &&
    (target !== "builtin" ||
      ingestion?.params.exportChunksJsonl === "true" ||
      ingestion?.params.exportMarkdown === "true" ||
      ingestion?.params.includeOriginal === "false");
  const engineReady =
    capabilities.data?.enabled && capabilities.data.engineReachable;
  const indexingReady = capabilities.data?.indexingConfigured === true;
  const chunkingReady =
    !ingestion ||
    ingestChunkingConfigured({
      chunkSize: Number(ingestionParameters?.chunkSize),
      overlap: Number(ingestionParameters?.overlap),
    });
  const valid =
    chunkingReady &&
    (!ingestion ||
      Boolean(
        engineReady &&
        !capabilities.isFetching &&
        (ingestion.params.index === "false" || indexingReady),
      ));
  function changeTarget(next: IngestionDestination) {
    if (!ingestion) return;
    setChunkDraft({});
    setTargetDraft(next);
    onChange({
      outputIds:
        next === "external" || target === "external" ? [] : result.outputIds,
      steps: result.steps.map((wire) =>
        wire.operation === policyStepToWire(ingestion).operation
          ? policyStepToWire({
              ...ingestion,
              params: {
                ...ingestion.params,
                index: String(next === "builtin"),
                includeOriginal: String(next !== "external"),
                exportMarkdown: "false",
                exportChunksJsonl: String(next !== "builtin"),
              },
            })
          : wire,
      ),
    });
  }

  function updateChunk(key: "chunkSize" | "overlap", value: string) {
    if (!ingestion) return;
    setChunkDraft({ ...chunkDraft, [key]: value });
    onChange({
      steps: result.steps.map((wire) =>
        wire.operation === policyStepToWire(ingestion).operation
          ? policyStepToWire({
              ...ingestion,
              params: { ...ingestion.params, ...chunkDraft, [key]: value },
            })
          : wire,
      ),
    });
  }

  const config: ComponentProps<typeof PolicyIngestionConfig> | null = ingestion
    ? {
        parameters: { ...ingestion.params, ...chunkDraft },
        target,
        onTargetChange: changeTarget,
        onChange: updateChunk,
        engineReady: Boolean(engineReady),
        indexingReady,
        chunkingReady,
        checking: capabilities.isFetching,
        recheck: () => void capabilities.refetch(),
      }
    : null;
  return { config, external, requiresDestination, valid };
}
