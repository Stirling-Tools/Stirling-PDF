import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { Icon, type IconName } from "@app/ui/Icon";
import { folderKind, type FolderRecord } from "@app/types/folder";
import type { ProcessingRecordSummary } from "@app/hooks/useProcessingFolders";
import {
  humanizeEndpoint,
  type PolicySetupResult,
} from "@app/policies/catalog";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import {
  ProcessingFolderPicker,
  type ProcessingFolderPickerProps,
} from "@app/components/policies/ProcessingFolderPicker";
import {
  FOLDER_PRESETS,
  canEditFolderSteps,
  folderSetupEntry,
  processingFolderPath,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";
import "@app/components/policies/FolderProcessingSetup.css";

export interface ProcessingFolderWizardProps extends Omit<
  ProcessingFolderPickerProps,
  "target" | "onChange"
> {
  /** An existing-folder entry skips destination selection. */
  initialFolder?: FolderRecord;
  aiEngineEnabled: boolean;
  recordFor: (folder: FolderRecord) => ProcessingRecordSummary | undefined;
  /** Resolves a selection or creates its folder; must not enable processing. */
  resolveTarget: (target: ProcessingFolderTarget) => Promise<FolderRecord>;
  save: (folder: FolderRecord, result: PolicySetupResult) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
}

type Stage = "folder" | "processing" | "review";
const PRESET_ICONS: Record<string, IconName> = {
  security: "shield-check",
  classification: "tags",
  compliance: "badge-check",
};

/** Both entry flows share the same mounted configuration, including when revisiting earlier steps. */
export function ProcessingFolderWizard({
  initialFolder,
  aiEngineEnabled,
  folders,
  canPickDirectory,
  serverDisabledReason,
  serverLabel,
  pickDirectory,
  recordFor,
  resolveTarget,
  save,
  onClose,
  loading = false,
  loadError,
  onRetry,
}: ProcessingFolderWizardProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>(
    initialFolder ? "processing" : "folder",
  );
  const [target, setTarget] = useState<ProcessingFolderTarget | null>(
    initialFolder ? { kind: "existing", folder: initialFolder } : null,
  );
  const [categoryId, setCategoryId] = useState(FOLDER_PRESETS[0].id);
  const [pickerVersion, setPickerVersion] = useState(0);
  const folder = target?.kind === "existing" ? target.folder : undefined;
  const existing = folder ? recordFor(folder) : undefined;
  const unsupportedSteps = existing && !canEditFolderSteps(existing);
  const entry = useMemo(
    () => folderSetupEntry(categoryId, existing),
    [categoryId, existing],
  );
  const local =
    target?.kind === "local" || (folder && folderKind(folder) === "local");
  const selectedName =
    folder?.name ??
    (target?.kind === "local"
      ? (target.name ?? target.directory.name)
      : target?.kind === "server"
        ? target.name.trim()
        : "");
  const parent =
    target?.kind === "server"
      ? folders.find((item) => item.id === target.parentId)
      : undefined;
  const path = folder
    ? local
      ? processingFolderPath(folder, folders)
      : `${serverLabel} / ${processingFolderPath(folder, folders)}`
    : target?.kind === "local"
      ? target.directory.path
      : parent
        ? `${serverLabel} / ${processingFolderPath(parent, folders)}`
        : serverLabel;
  const invalidName =
    target &&
    target.kind !== "existing" &&
    target.name !== null &&
    (!target.name.trim() ||
      /[\\/]/.test(target.name) ||
      [".", ".."].includes(target.name.trim()));
  const destinationBlocked = !local && Boolean(serverDisabledReason);
  const presetBlocked =
    !existing && entry.category.providesClassification && !aiEngineEnabled;
  const canContinue = Boolean(
    target &&
    !invalidName &&
    !destinationBlocked &&
    !loading &&
    !loadError &&
    !presetBlocked &&
    !unsupportedSteps,
  );
  const stages: Stage[] = initialFolder
    ? ["processing", "review"]
    : ["folder", "processing", "review"];

  async function submit(_entry: unknown, result: PolicySetupResult) {
    if (!target || !canContinue)
      throw new Error(t("processingFolders.setup.chooseFolder"));
    const resolved = await resolveTarget(target);
    // A failed processing save can be retried without creating a second folder.
    setTarget({ kind: "existing", folder: resolved });
    if (target.kind !== "existing") setPickerVersion((version) => version + 1);
    await save(resolved, result);
  }

  function back() {
    if (stage === "review") setStage("processing");
    else if (stage === "processing" && !initialFolder) setStage("folder");
    else onClose();
  }

  return (
    <PolicySetupWizard
      key={existing?.id ?? "new"}
      entry={entry}
      onClose={onClose}
      onSubmit={submit}
      enforceControl={false}
      folderSetup
    >
      {({ content, steps, submit: confirm, submitting, canSubmit, error }) => (
        <Modal
          open
          width="lg"
          className="folder-setup"
          title={t(
            existing
              ? "processingFolders.setup.editTitle"
              : initialFolder
                ? "processingFolders.setup.existingTitle"
                : "processingFolders.setup.title",
          )}
          subtitle={t(
            initialFolder
              ? "processingFolders.setup.existingSubtitle"
              : "processingFolders.setup.subtitle",
          )}
          onClose={submitting ? () => {} : onClose}
          disableBackdropClose={submitting}
          disableEscapeClose={submitting}
          footer={
            <div className="folder-setup__foot">
              <Button variant="tertiary" onClick={back} disabled={submitting}>
                {t(
                  stage === stages[0]
                    ? "filesPage.processingSetup.cancel"
                    : "filesPage.processingSetup.back",
                )}
              </Button>
              <Button
                onClick={
                  stage === "review"
                    ? confirm
                    : () =>
                        setStage(stage === "folder" ? "processing" : "review")
                }
                disabled={!canContinue || (stage !== "folder" && !canSubmit)}
                loading={submitting}
                rightSection={
                  <Icon
                    name={stage === "review" ? "check" : "arrow-right"}
                    size={16}
                  />
                }
              >
                {t(
                  stage === "review"
                    ? existing
                      ? "processingFolders.setup.saveChanges"
                      : "processingFolders.setup.enable"
                    : stage === "folder"
                      ? "processingFolders.setup.chooseProcessing"
                      : "processingFolders.setup.review",
                )}
              </Button>
            </div>
          }
        >
          <ol
            className="folder-setup__progress"
            aria-label={t("processingFolders.setup.progress")}
          >
            {stages.map((item, index) => (
              <li key={item} aria-current={item === stage ? "step" : undefined}>
                <span>{index + 1}</span>
                {t(`processingFolders.setup.${item}`)}
              </li>
            ))}
          </ol>
          {loading && <p role="status">{t("loading", "Loading...")}</p>}
          {unsupportedSteps && (
            <Banner
              tone="warning"
              description={t("processingFolders.setup.advancedSteps")}
            />
          )}
          {loadError && (
            <Banner
              tone="danger"
              description={loadError}
              action={
                onRetry && (
                  <Button variant="secondary" onClick={onRetry}>
                    {t("processingFolders.setup.retry")}
                  </Button>
                )
              }
            />
          )}
          {stage !== "folder" && target && (
            <div className="folder-setup__destination">
              <Icon name={local ? "monitor" : "cloud"} size={22} />
              <div>
                <strong>{selectedName}</strong>
                <span className="folder-setup__path">{path}</span>
              </div>
              {!initialFolder && (
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setStage("folder")}
                >
                  {t("processingFolders.setup.change")}
                </Button>
              )}
            </div>
          )}
          {stage !== "folder" && destinationBlocked && (
            <Banner tone="warning" description={serverDisabledReason} />
          )}
          {stage !== "folder" && presetBlocked && (
            <Banner
              tone="warning"
              description={t("portal.policies.card.requiresAiEngine")}
            />
          )}
          {error && <Banner tone="danger" description={error} />}
          <div hidden={stage !== "folder"}>
            <ProcessingFolderPicker
              key={pickerVersion}
              folders={folders}
              canPickDirectory={canPickDirectory}
              serverDisabledReason={serverDisabledReason}
              serverLabel={serverLabel}
              target={target}
              onChange={setTarget}
              pickDirectory={pickDirectory}
            />
          </div>
          <div hidden={stage !== "processing"}>
            {!existing && (
              <>
                <h2 className="folder-setup__heading">
                  {t("processingFolders.setup.chooseProcessing")}
                </h2>
                <div
                  className="folder-setup__presets"
                  role="group"
                  aria-label={t("processingFolders.setup.presetsLabel")}
                >
                  {FOLDER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="folder-setup__preset"
                      aria-pressed={categoryId === preset.id}
                      disabled={
                        preset.providesClassification && !aiEngineEnabled
                      }
                      onClick={() => setCategoryId(preset.id)}
                    >
                      <Icon
                        name={PRESET_ICONS[preset.id] ?? "workflow"}
                        size={22}
                      />
                      <strong>
                        {t(
                          `processingFolders.setup.presets.${preset.id}.title`,
                        )}
                      </strong>
                      <span>
                        {t(
                          `processingFolders.setup.presets.${preset.id}.description`,
                        )}
                      </span>
                      {preset.providesClassification && !aiEngineEnabled && (
                        <span>
                          {t("portal.policies.card.requiresAiEngine")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            {content}
          </div>
          {stage === "review" && (
            <div className="folder-setup__review">
              <h2 className="folder-setup__heading">
                {t("processingFolders.setup.reviewTitle")}
              </h2>
              <ol className="folder-setup__review-steps">
                {steps.map((step, index) => (
                  <li key={`${index}-${step.operation}`}>
                    <span>{index + 1}</span>
                    {humanizeEndpoint(step.operation, t)}
                  </li>
                ))}
              </ol>
              <dl className="folder-setup__outcome">
                <div>
                  <dt>{t("processingFolders.setup.when")}</dt>
                  <dd>
                    {t(
                      existing
                        ? existing.enabled
                          ? "processingFolders.setup.staysActive"
                          : "processingFolders.setup.staysPaused"
                        : "processingFolders.setup.currentFiles",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("processingFolders.setup.result")}</dt>
                  <dd>
                    {t(
                      local
                        ? "processingFolders.setup.localResult"
                        : "processingFolders.setup.serverResult",
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Modal>
      )}
    </PolicySetupWizard>
  );
}
