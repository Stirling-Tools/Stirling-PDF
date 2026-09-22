import { EditorDeliverySelect } from "@portal/components/pipelines/EditorDeliverySelect";
import {
  PolicyIngestionConfig,
  type IngestionDestination,
} from "@app/components/policies/PolicyIngestionConfig";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Input, Select } from "@app/ui";
import type { PolicySetupConfigProps } from "@app/components/policies/PolicySetupWizard";
import { ingestChunkingConfigured } from "@app/policies/ingestOperation";
import { policyStepFromWire, policyStepToWire } from "@app/policies/operations";
import { fetchSources, fetchSource, type Source } from "@portal/api/sources";
import { fetchTriggers } from "@portal/api/pipelines";
import { fetchDocparseCapabilities } from "@portal/api/docparse";
import { errorMessage } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
import { availableOutputModes } from "@portal/components/pipelines/outputModes";
import { DestinationPicker } from "@portal/components/pipelines/DestinationPicker";
import {
  PipelineInputTrigger,
  type WorkingInput,
} from "@portal/components/pipelines/PipelineInputTrigger";
import {
  buildTriggerFor,
  parseTrigger,
} from "@portal/components/pipelines/inputTriggerConfig";
import { SourceModal } from "@portal/components/sources/SourceModal";
import {
  EDITOR_SOURCE_TYPE,
  isReadableSource,
} from "@portal/components/sources/sourceTypes";

interface Props extends PolicySetupConfigProps {
  folderName?: string;
  readOnly?: boolean;
}

const VECTOR_TYPES = ["vectordb"];
const RETAIN_OPTIONS = { mode: "track" };

/** Location and ingestion settings shared by template and folder menus. */
export function PolicySetupConnections({
  result,
  onChange,
  onValidityChange,
  folderName,
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sourceModal, setSourceModal] = useState<{
    direction: "input" | "output";
    id?: string;
  } | null>(null);
  const sources = useQuery({ queryKey: qk.sources(), queryFn: fetchSources });
  const triggers = useQuery({
    queryKey: ["policy-setup-triggers"],
    queryFn: fetchTriggers,
    enabled: !folderName,
  });
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
  const input = result.inputs?.[0];
  const selectedInput = useQuery({
    queryKey: ["policy-setup-source", input?.sourceId],
    queryFn: () => fetchSource(input!.sourceId),
    enabled: Boolean(input?.sourceId) && !result.runsOnEditor && !folderName,
  });
  const allSources = sources.data?.sources ?? [];
  const destination = allSources.find(
    (source) => source.id === result.outputIds?.[0],
  );
  const [targetDraft, setTargetDraft] = useState<IngestionDestination>();
  const [destinationRequested, setDestinationRequested] = useState(false);
  const target: IngestionDestination =
    targetDraft ??
    (destination?.type === "vectordb" ||
    (folderName && Boolean(result.outputIds?.length))
      ? "external"
      : ingestion?.params.index === "false"
        ? "export"
        : "builtin");
  const external = Boolean(ingestion) && target === "external";
  const editor = !folderName && result.runsOnEditor;
  const requiresDestination =
    Boolean(ingestion) &&
    (target !== "builtin" ||
      ingestion?.params.exportChunksJsonl === "true" ||
      ingestion?.params.exportMarkdown === "true" ||
      ingestion?.params.includeOriginal === "false");
  const externalEditorOutput =
    editor &&
    (requiresDestination ||
      Boolean(result.outputIds?.length) ||
      destinationRequested);
  const availableSources = allSources.filter(
    (source) => isReadableSource(source) && source.type !== EDITOR_SOURCE_TYPE,
  );
  const outputSources = allSources.filter(
    (source) =>
      (availableOutputModes() as string[]).includes(source.type) &&
      (external ? source.type === "vectordb" : source.type !== "vectordb"),
  );
  const parsed = parseTrigger(input?.trigger ?? null);
  const workingInput: WorkingInput = {
    sourceId: input?.sourceId ?? "",
    triggerType: parsed.triggerType,
    scheduleCount: parsed.count,
    scheduleUnit: parsed.unit,
  };
  const triggerOptions = [
    {
      value: "manual",
      label: t("portal.pipelines.composer.triggerManual", "On demand"),
    },
    ...(triggers.data ?? [])
      .filter(
        (trigger) =>
          !trigger.requiresSource ||
          trigger.supportedSourceTypes.includes(selectedInput.data?.type ?? ""),
      )
      .map((trigger) => ({
        value: trigger.type,
        label: t(`portal.pipelines.trigger.${trigger.type}`, trigger.type),
      })),
  ];
  const engineReady =
    capabilities.data?.enabled && capabilities.data.engineReachable;
  const indexingReady = capabilities.data?.indexingConfigured === true;
  const outputNeeded =
    externalEditorOutput ||
    (!editor && (!folderName || external || Boolean(result.outputIds?.length)));
  const outputReady =
    !outputNeeded ||
    (result.outputIds?.length === 1 &&
      outputSources.some(
        (source) =>
          source.id === result.outputIds?.[0] && source.status !== "disabled",
      ));
  const inputReady =
    Boolean(folderName) ||
    editor ||
    Boolean(
      input?.sourceId &&
      selectedInput.data?.enabled &&
      !selectedInput.isFetching &&
      !selectedInput.error,
    );
  const scheduleReady =
    workingInput.triggerType !== "schedule" ||
    (Number.isInteger(Number(workingInput.scheduleCount)) &&
      Number(workingInput.scheduleCount) > 0);
  const chunkingReady =
    !ingestion ||
    ingestChunkingConfigured({
      chunkSize: Number(ingestionParameters?.chunkSize),
      overlap: Number(ingestionParameters?.overlap),
    });
  const valid =
    inputReady &&
    scheduleReady &&
    outputReady &&
    chunkingReady &&
    (!ingestion ||
      Boolean(
        engineReady &&
        !capabilities.isFetching &&
        (ingestion.params.index === "false" || indexingReady),
      ));
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

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

  function selectInput(id: string | null) {
    onChange({
      runsOnEditor: id === "editor",
      inputs: id && id !== "editor" ? [{ sourceId: id, trigger: null }] : [],
    });
  }

  function created(source: Source) {
    if (!source.id) return;
    if (sourceModal?.direction === "input") selectInput(source.id);
    else onChange({ outputIds: [source.id] });
  }

  const destinationPicker =
    editor && !externalEditorOutput ? (
      <FormField
        label={t("portal.policies.wizard.locations.destination", "Destination")}
        helperText={t(
          "portal.policies.wizard.locations.editorOutput",
          "Processed PDFs return to the editor workspace.",
        )}
      >
        <Input
          inputSize="sm"
          value={t(
            "portal.policies.wizard.locations.editorDestination",
            "Editor workspace",
          )}
          readOnly
        />
      </FormField>
    ) : folderName && !external && !result.outputIds?.length ? (
      <FormField
        label={t("portal.policies.wizard.locations.destination", "Destination")}
        helperText={t(
          "portal.policies.wizard.locations.folderOutput",
          "Processed files are saved in this folder. Corpus exports keep the original PDF.",
        )}
      >
        <Input inputSize="sm" value={folderName} readOnly />
      </FormField>
    ) : (
      <>
        {external &&
          outputSources.length === 0 &&
          !sources.isPending &&
          !sources.error && (
            <Banner
              tone="info"
              description={t(
                "portal.policies.wizard.locations.noDatabase",
                "No vector database destination is set up. Connect a source below, then choose or create its database connection and collection.",
              )}
            />
          )}
        {sources.error && (
          <>
            <Banner tone="danger" description={errorMessage(sources.error)} />
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => void sources.refetch()}
            >
              {t("common.retry", "Retry")}
            </Button>
          </>
        )}
        <DestinationPicker
          sources={outputSources}
          value={result.outputIds ?? []}
          onChange={(outputIds) => onChange({ outputIds })}
          onCreateNew={() => setSourceModal({ direction: "output" })}
          onEdit={(id) => setSourceModal({ direction: "output", id })}
        />
        {!outputReady && (
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.locations.chooseOutput",
              "Choose an enabled output destination before saving.",
            )}
          </p>
        )}
        {folderName && !external && (
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => onChange({ outputIds: [] })}
          >
            {t(
              "portal.policies.wizard.locations.returnToFolder",
              "Return results to this folder",
            )}
          </Button>
        )}
      </>
    );

  const outputDestination = (
    <>
      {editor && (
        <EditorDeliverySelect
          external={externalEditorOutput}
          requiresDestination={requiresDestination}
          onChange={(external) => {
            setDestinationRequested(external);
            if (!external) onChange({ outputIds: [] });
          }}
        />
      )}
      {destinationPicker}
    </>
  );

  return (
    <fieldset disabled={readOnly} className="portal-policies__setup-locations">
      <div className="portal-policies__wizard-section">
        <h3 className="portal-policies__wizard-heading">
          {t("portal.policies.wizard.locations.input", "Documents to process")}
        </h3>
        {folderName ? (
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.locations.folder",
              "Input: {{name}}. Originals are retained when delivering to a vector database.",
              { name: folderName },
            )}
          </p>
        ) : (
          <>
            <FormField
              label={t(
                "portal.policies.wizard.locations.source",
                "Input source",
              )}
            >
              <Select
                inputSize="sm"
                aria-label={t(
                  "portal.policies.wizard.locations.source",
                  "Input source",
                )}
                value={editor ? "editor" : (input?.sourceId ?? null)}
                placeholder={t(
                  "portal.policies.wizard.locations.chooseSource",
                  "Choose where documents come from",
                )}
                onChange={selectInput}
                options={[
                  {
                    value: "editor",
                    label: t(
                      "portal.policies.wizard.locations.editor",
                      "Files opened in the editor",
                    ),
                  },
                  ...availableSources.map((source) => ({
                    value: source.id,
                    label: source.name,
                  })),
                ]}
              />
            </FormField>
            <PipelineInputTrigger
              input={workingInput}
              onInputChange={(patch) =>
                onChange({
                  inputs: [
                    {
                      sourceId: workingInput.sourceId,
                      trigger: buildTriggerFor({ ...workingInput, ...patch }),
                    },
                  ],
                })
              }
              triggerOptions={triggerOptions}
              isEditorInput={editor}
              runOn={result.runOn}
              onRunOnChange={(runOn) => onChange({ runOn })}
            />
            <div className="portal-policies__setup-actions">
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => setSourceModal({ direction: "input" })}
              >
                {t(
                  "portal.policies.wizard.locations.connectInput",
                  "Connect input source",
                )}
              </Button>
              {input?.sourceId && (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() =>
                    setSourceModal({ direction: "input", id: input.sourceId })
                  }
                >
                  {t(
                    "portal.policies.wizard.locations.editInput",
                    "Edit input source",
                  )}
                </Button>
              )}
            </div>
            {selectedInput.data &&
              ["folder", "s3", "sftp", "ftp", "network"].includes(
                selectedInput.data.type,
              ) && (
                <Banner
                  tone={
                    selectedInput.data.options.mode === "consume" ||
                    !selectedInput.data.options.mode
                      ? "warning"
                      : "info"
                  }
                  description={
                    selectedInput.data.options.mode === "track" ||
                    selectedInput.data.options.mode === "snapshot"
                      ? t(
                          "portal.policies.wizard.locations.retained",
                          "This source does not delete inputs after processing. Choose a separate destination to keep the original files unchanged.",
                        )
                      : t(
                          "portal.policies.wizard.locations.consumed",
                          "Check this source's processing mode: consume deletes originals after a successful run. Choose Track in Edit input source to keep them.",
                        )
                  }
                />
              )}
          </>
        )}
        {!folderName &&
          !editor &&
          (sources.error || selectedInput.error || triggers.error) && (
            <Banner
              tone="danger"
              description={errorMessage(
                sources.error ?? selectedInput.error ?? triggers.error,
              )}
            />
          )}
      </div>
      <section
        className="portal-policies__wizard-section"
        aria-label={t("portal.policies.wizard.locations.output", "Output")}
      >
        <h3 className="portal-policies__wizard-heading">
          {t("portal.policies.wizard.locations.output", "Output")}
        </h3>
        {ingestion ? (
          <PolicyIngestionConfig
            parameters={{ ...ingestion.params, ...chunkDraft }}
            target={target}
            onTargetChange={changeTarget}
            onChange={updateChunk}
            engineReady={Boolean(engineReady)}
            indexingReady={indexingReady}
            chunkingReady={chunkingReady}
            checking={capabilities.isFetching}
            recheck={() => void capabilities.refetch()}
          >
            {outputDestination}
          </PolicyIngestionConfig>
        ) : (
          outputDestination
        )}
      </section>
      {sourceModal && (
        <SourceModal
          open
          direction={sourceModal.direction}
          sourceId={sourceModal.id}
          allowedTypes={
            sourceModal.direction === "output"
              ? external
                ? VECTOR_TYPES
                : availableOutputModes().filter((type) => type !== "vectordb")
              : undefined
          }
          initialOptions={
            sourceModal.direction === "input" ? RETAIN_OPTIONS : undefined
          }
          onClose={() => setSourceModal(null)}
          onCreated={created}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: ["policy-setup-source"],
            });
          }}
        />
      )}
    </fieldset>
  );
}
