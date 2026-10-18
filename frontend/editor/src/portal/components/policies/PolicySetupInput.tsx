import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Select } from "@app/ui";
import type { PolicySetupConfigProps } from "@app/components/policies/PolicySetupWizard";
import { fetchSources, fetchSource } from "@portal/api/sources";
import { fetchTriggers } from "@portal/api/pipelines";
import { errorMessage } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
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
}
const RETAIN_OPTIONS = { mode: "track" };

/** Owns source selection, trigger configuration, and input validity. */
export function PolicySetupInput({
  result,
  onChange,
  onValidityChange,
  folderName,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sourceModal, setSourceModal] = useState<{ id?: string } | null>(null);
  const sources = useQuery({ queryKey: qk.sources(), queryFn: fetchSources });
  const triggers = useQuery({
    queryKey: ["policy-setup-triggers"],
    queryFn: fetchTriggers,
    enabled: !folderName,
  });
  const editor = !folderName && result.runsOnEditor;
  const input = result.inputs?.[0];
  const selectedInput = useQuery({
    queryKey: ["policy-setup-source", input?.sourceId],
    queryFn: () => fetchSource(input!.sourceId),
    enabled: Boolean(input?.sourceId) && !result.runsOnEditor && !folderName,
  });
  const allSources = sources.data?.sources ?? [];
  const availableSources = allSources.filter(
    (source) => isReadableSource(source) && source.type !== EDITOR_SOURCE_TYPE,
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
  const valid = inputReady && scheduleReady;
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);
  function selectInput(id: string | null) {
    onChange({
      runsOnEditor: id === "editor",
      inputs: id && id !== "editor" ? [{ sourceId: id, trigger: null }] : [],
    });
  }

  return (
    <>
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
                onClick={() => setSourceModal({})}
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
                  onClick={() => setSourceModal({ id: input.sourceId })}
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

      {sourceModal && (
        <SourceModal
          open
          direction="input"
          sourceId={sourceModal.id}
          initialOptions={RETAIN_OPTIONS}
          onClose={() => setSourceModal(null)}
          onCreated={(source) => {
            if (source.id) selectInput(source.id);
          }}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: ["policy-setup-source"],
            });
          }}
        />
      )}
    </>
  );
}
