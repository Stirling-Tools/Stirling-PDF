import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, InfoTooltip, Modal } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { folderKind, type FolderRecord } from "@app/types/folder";
import { useAiClassificationEnabled } from "@app/hooks/useAiClassificationEnabled";
import type { PolicySetupResult, CatalogueEntry } from "@app/policies/catalog";
import {
  PolicyRoutingDestinations,
  type RoutingDestination,
} from "@app/components/policies/PolicyRoutingDestinations";
import { FolderPolicySetupConfig } from "@app/components/policies/FolderPolicySetupConfig";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import {
  ProcessingFolderPicker,
  type ProcessingFolderPickerProps,
} from "@app/components/policies/ProcessingFolderPicker";
import {
  sortFolderPresets,
  presetProcessingRecord,
  mergeFolderSteps,
  canEditFolderSteps,
  folderSetupEntry,
  processingFolderPath,
  processingFolderForTarget,
  isValidProcessingFolderName,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import "@app/components/policies/FolderProcessingSetup.css";

export interface ProcessingFolderWizardProps extends Omit<
  ProcessingFolderPickerProps,
  "target" | "onChange" | "onFolderAdded" | "active"
> {
  /** An existing-folder entry skips destination selection. */
  initialFolder?: FolderRecord;
  aiEngineEnabled: boolean;
  catalogue: CatalogueEntry[];
  destinations?: RoutingDestination[];
  destinationsLoading?: boolean;
  destinationsError?: string | null;
  onCreateDestination?: () => void;
  /** Resolves a selection or creates its folder; must not enable processing. */
  resolveTarget: (target: ProcessingFolderTarget) => Promise<FolderRecord>;
  save: (folder: FolderRecord, result: PolicySetupResult) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
}

type Stage = "folder" | "processing";
/** Both entry flows share the same mounted configuration, including when revisiting earlier steps. */
export function ProcessingFolderWizard({
  initialFolder,
  aiEngineEnabled,
  catalogue,
  destinations = [],
  destinationsLoading = false,
  destinationsError,
  onCreateDestination,
  folders,
  canPickDirectory,
  serverDisabledReason,
  serverLabel,
  pickDirectory,
  downloadsProcessing,
  recordFor,
  resolveTarget,
  save,
  onClose,
  loading = false,
  loadError,
  onRetry,
}: ProcessingFolderWizardProps) {
  const { t } = useTranslation();
  const aiClassificationEnabled = useAiClassificationEnabled();
  const [stage, setStage] = useState<Stage>(
    initialFolder ? "processing" : "folder",
  );
  const [target, setTarget] = useState<ProcessingFolderTarget | null>(
    initialFolder ? { kind: "existing", folder: initialFolder } : null,
  );
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const presets = useMemo(() => sortFolderPresets(catalogue), [catalogue]);

  function unavailableReason(preset: CatalogueEntry): string | null {
    if (preset.category.comingSoon) return t("portal.policies.card.comingSoon");
    if (preset.category.requiresAiEngine && !aiEngineEnabled)
      return t("portal.policies.card.requiresAiEngine");
    return null;
  }

  const preset =
    presets.find((item) => item.category.id === categoryId) ??
    presets.find((item) => !unavailableReason(item)) ??
    presets[0];
  const [pickerVersion, setPickerVersion] = useState(0);
  const folder = processingFolderForTarget(target, folders);
  const existing = folder ? recordFor(folder) : undefined;
  const savedSteps = existing ?? presetProcessingRecord(preset);
  const unsupportedSteps = savedSteps && !canEditFolderSteps(savedSteps);
  const entry = useMemo(
    () => folderSetupEntry(preset, existing),
    [preset, existing],
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
    !isValidProcessingFolderName(target.name);
  const destinationBlocked = !local && Boolean(serverDisabledReason);
  const presetBlocked = !existing && unavailableReason(preset);
  const canContinue = Boolean(
    target &&
    !invalidName &&
    !destinationBlocked &&
    !loading &&
    !loadError &&
    !presetBlocked &&
    !unsupportedSteps &&
    (entry.category.id !== "routing" ||
      (!destinationsLoading && !destinationsError)),
  );
  const stages: Stage[] = initialFolder
    ? ["processing"]
    : ["folder", "processing"];

  async function submit(_entry: unknown, result: PolicySetupResult) {
    if (!target || !canContinue)
      throw new Error(t("processingFolders.setup.chooseFolder"));
    const resolved = await resolveTarget(target);
    // A failed processing save can be retried without creating a second folder.
    setTarget({ kind: "existing", folder: resolved });
    if (target.kind !== "existing") setPickerVersion((version) => version + 1);
    await save(resolved, {
      ...result,
      extraOptions: { ...result.extraOptions, categoryId: entry.category.id },
      steps: mergeFolderSteps(savedSteps, result.steps),
    });
  }

  function back() {
    if (stage === "processing" && !initialFolder) setStage("folder");
    else onClose();
  }

  return (
    <PolicySetupWizard
      entry={entry}
      onClose={onClose}
      onSubmit={submit}
      enforceControl={false}
      folderSetup
      // Routing picks its own destinations in routingConfig; every other preset configures its
      // output here, and its readiness check is what gates saving.
      setupConfig={
        entry.category.id === "routing"
          ? undefined
          : (config) => (
              <FolderPolicySetupConfig {...config} folderName={selectedName} />
            )
      }
      routingConfig={(props) => (
        <>
          {destinationsError && (
            <Banner
              tone="danger"
              description={destinationsError}
              action={
                onRetry && (
                  <Button onClick={onRetry}>
                    {t("processingFolders.setup.retry")}
                  </Button>
                )
              }
            />
          )}
          <PolicyRoutingDestinations
            {...props}
            destinations={destinations}
            onCreateDestination={onCreateDestination}
            classificationAvailable={aiClassificationEnabled}
            compact
          />
        </>
      )}
    >
      {({ content, submit: confirm, submitting, canSubmit, error }) => (
        <Modal
          open
          width="xl"
          className={`folder-setup folder-setup--${stage}`}
          title={t(
            existing
              ? "processingFolders.setup.editTitle"
              : initialFolder
                ? "processingFolders.setup.existingTitle"
                : "processingFolders.setup.title",
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
                  stage === "folder" ? () => setStage("processing") : confirm
                }
                disabled={!canContinue || (stage !== "folder" && !canSubmit)}
                loading={submitting}
                rightSection={
                  <Icon
                    name={stage === "folder" ? "arrow-right" : "check"}
                    size={16}
                  />
                }
              >
                {t(
                  stage === "folder"
                    ? "processingFolders.setup.chooseProcessing"
                    : existing
                      ? "processingFolders.setup.saveChanges"
                      : "processingFolders.setup.enable",
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
              <Icon name={local ? "monitor" : "cloud"} size={16} />
              <div>
                <strong title={selectedName}>{selectedName}</strong>
                <span className="folder-setup__path" title={path}>
                  {path}
                </span>
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
            <Banner tone="warning" description={presetBlocked} />
          )}
          {error && <Banner tone="danger" description={error} />}
          <div
            className="folder-setup__folder-stage"
            hidden={stage !== "folder"}
          >
            <ProcessingFolderPicker
              key={pickerVersion}
              active={stage === "folder"}
              folders={folders}
              recordFor={recordFor}
              canPickDirectory={canPickDirectory}
              serverDisabledReason={serverDisabledReason}
              serverLabel={serverLabel}
              target={target}
              onChange={setTarget}
              onFolderAdded={() => setStage("processing")}
              onClose={onClose}
              pickDirectory={pickDirectory}
              downloadsProcessing={downloadsProcessing}
            />
          </div>
          <div
            className="folder-setup__processing-stage"
            hidden={stage !== "processing"}
            inert={submitting}
          >
            <div className="folder-setup__processing">
              {!existing && (
                <div
                  className="folder-setup__presets"
                  role="group"
                  aria-label={t("processingFolders.setup.presetsLabel")}
                >
                  {presets.map((item) => {
                    const reason = unavailableReason(item);
                    return (
                      <div
                        key={item.category.id}
                        className="folder-setup__preset"
                        data-selected={
                          preset.category.id === item.category.id || undefined
                        }
                      >
                        <button
                          type="button"
                          className="folder-setup__preset-select"
                          aria-pressed={preset.category.id === item.category.id}
                          disabled={Boolean(reason) || submitting}
                          onClick={() => setCategoryId(item.category.id)}
                        >
                          <span className="folder-setup__preset-icon">
                            {policyCategoryIcon(item.category.id)}
                          </span>
                          <span>{t(item.category.label)}</span>
                        </button>
                        <InfoTooltip
                          ariaLabel={t("processingFolders.setup.presetInfo", {
                            name: t(item.category.label),
                          })}
                          label={
                            <>
                              {t(item.category.desc)}
                              {reason && <p>{reason}</p>}
                            </>
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <div
                key={`${entry.category.id}:${entry.policy?.state.backendId ?? "new"}`}
                className="folder-setup__settings"
              >
                {content}
              </div>
            </div>
          </div>
          {existing && (
            <Banner
              tone="warning"
              className="folder-setup__replacement"
              description={t("processingFolders.setup.replaceWarning", {
                name: selectedName,
              })}
            />
          )}
        </Modal>
      )}
    </PolicySetupWizard>
  );
}
