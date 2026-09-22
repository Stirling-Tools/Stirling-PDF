import {
  fetchPolicySources,
  routingDestinations,
  type PolicySource,
} from "@app/services/policySources";
import { usePolicyOutputModes } from "@app/hooks/usePolicyOutputModes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useServerFolderBlock } from "@app/hooks/useServerFolderBlock";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { useDownloadsProcessing } from "@app/hooks/useDownloadsProcessing";
import {
  useProcessingFolders,
  refreshProcessingFolders,
} from "@app/hooks/useProcessingFolders";
import { canPickDirectory, pickDirectory } from "@app/services/directoryPicker";
import { saveProcessingFolder } from "@app/services/processingFolderApi";
import {
  currentRunIds,
  deliverSweepResults,
} from "@app/services/processingRunDelivery";
import { folderKind, type FolderRecord } from "@app/types/folder";
import type { PolicySetupResult } from "@app/policies/catalog";
import {
  mergeFolderSteps,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";
import { ProcessingFolderWizard } from "@app/components/policies/ProcessingFolderWizard";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import apiClient from "@app/services/apiClient";
import { assemblePolicies } from "@app/policies/overview";
import type { WirePolicy } from "@app/policies/types";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";

interface ProcessingFolderSetupFlowProps {
  folder?: FolderRecord;
  onClose: () => void;
}

/** Binds both wizard entry points to folder storage and the existing processing service. */
export function ProcessingFolderSetupFlow({
  folder,
  onClose,
}: ProcessingFolderSetupFlowProps) {
  const { t } = useTranslation();
  const folders = useFolders();
  const processing = useProcessingFolders();
  const { addFiles } = useFileHandler();
  const serverDisabledReason = useServerFolderBlock();
  const aiEngineEnabled = useAiEngineEnabled();
  const downloadsProcessing = useDownloadsProcessing();
  const navigate = useNavigate();
  const outputModes = usePolicyOutputModes();
  const [sources, setSources] = useState<{
    data: PolicySource[];
    loading: boolean;
    error: string | null;
  }>({ data: [], loading: true, error: null });
  const [reload, setReload] = useState(0);
  const [presets, setPresets] = useState(() => ({
    catalogue: assemblePolicies([], []).catalogue,
    loading: true,
    error: null as string | null,
  }));

  useEffect(() => {
    let cancelled = false;
    setPresets((current) => ({ ...current, loading: true, error: null }));
    void apiClient
      .get<WirePolicy[]>("/api/v1/policies", { suppressErrorToast: true })
      .then(({ data }) => {
        if (!cancelled)
          setPresets({
            catalogue: assemblePolicies(data, []).catalogue,
            loading: false,
            error: null,
          });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPresets((current) => ({
            ...current,
            loading: false,
            error: extractErrorMessage(error),
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    setSources((current) => ({ ...current, loading: true, error: null }));
    void fetchPolicySources()
      .then((data) => {
        if (!cancelled) setSources({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setSources({
            data: [],
            loading: false,
            error: extractErrorMessage(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function resolveTarget(
    target: ProcessingFolderTarget,
  ): Promise<FolderRecord> {
    if (target.kind === "existing") return target.folder;
    if (target.kind === "server")
      return folders.createFolder(
        target.name.trim(),
        target.parentId,
        "server",
      );
    return folders.mountLocalFolder(
      target.directory.path,
      target.directory.name,
    );
  }

  async function save(selected: FolderRecord, result: PolicySetupResult) {
    const existing = processing.recordFor(selected);
    const onDisk = folderKind(selected) === "local";
    const baseline =
      onDisk && existing ? await currentRunIds(existing.id) : new Set<string>();
    const saved = await saveProcessingFolder({
      id: existing?.id,
      ...(onDisk
        ? { directory: selected.directory }
        : { folderId: selected.id }),
      output: {
        mode: "new_version",
        categoryId: result.extraOptions?.categoryId,
      },
      outputIds: result.outputIds ?? [],
      routingRules: result.routingRules ?? [],
      enabled: existing ? existing.enabled : true,
      steps: mergeFolderSteps(existing, result.steps).map((step) => ({
        ...step,
        parameters: step.parameters ?? {},
      })),
    });
    void refreshProcessingFolders();
    if (onDisk)
      void deliverSweepResults(saved.id, null, addFiles, {
        excludeRunIds: baseline,
      });
    onClose();
    if (!folder) navigate(`/files/${selected.id}`);
  }

  return (
    <ProcessingFolderWizard
      initialFolder={folder}
      aiEngineEnabled={aiEngineEnabled}
      catalogue={presets.catalogue}
      // No vectordb: routing emits at most a classify step, never the chunks-only
      // ingest final step a vector database destination requires.
      destinations={routingDestinations(
        sources.data,
        outputModes.filter((mode) => mode !== "vectordb"),
      )}
      destinationsLoading={sources.loading}
      destinationsError={sources.error}
      onCreateDestination={() => {
        onClose();
        navigate(`${PORTAL_BASENAME}/sources/new`);
      }}
      folders={folders.folders}
      loading={folders.loading || processing.loading || presets.loading}
      loadError={processing.loadError ?? presets.error}
      onRetry={() => {
        void refreshProcessingFolders();
        setReload((current) => current + 1);
      }}
      canPickDirectory={canPickDirectory}
      pickDirectory={pickDirectory}
      downloadsProcessing={
        downloadsProcessing
          ? {
              ...downloadsProcessing,
              start: () => {
                onClose();
                downloadsProcessing.start();
              },
            }
          : undefined
      }
      serverDisabledReason={serverDisabledReason}
      serverLabel={t("processingFolders.setup.server")}
      recordFor={processing.recordFor}
      resolveTarget={resolveTarget}
      save={save}
      onClose={onClose}
    />
  );
}
