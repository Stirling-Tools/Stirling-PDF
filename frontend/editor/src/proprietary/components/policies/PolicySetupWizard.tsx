import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { PanelHeader } from "@shared/components/PanelHeader";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { Input } from "@shared/components/Input";
import { Select } from "@shared/components/Select";
import { SettingsRow } from "@shared/components/SettingsRow";
import { Checkbox } from "@shared/components/Checkbox";
import { Banner } from "@shared/components/Banner";
import { EmptyState } from "@shared/components/EmptyState";
import { StepIndicator } from "@shared/components/StepIndicator";
import type {
  PolicyCategory,
  PolicyConfigDef,
  PolicyConfigResult,
  PolicySource,
  PolicyState,
  PolicyWizardResult,
} from "@app/types/policies";
import type {
  AutomationConfig,
  AutomationOperation,
} from "@app/types/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { WatchedFolder } from "@app/types/watchedFolders";
import { buildPipelineDefinition } from "@app/services/policyPipeline";
import { useAuth } from "@app/auth/UseSession";
import { PolicyFieldRow } from "@app/components/policies/PolicyFieldRow";
import { resolveFieldValues } from "@app/components/policies/policyValues";
import {
  PolicyWorkflowStep,
  AutomationMode,
} from "@app/components/policies/PolicyWorkflowStep";
import { PolicyToolConfigStep } from "@app/components/policies/PolicyToolConfigStep";
import { getPolicyToolChain } from "@app/components/policies/policyToolChains";

// Sources are always "editor" for this release, so the Sources step is dropped
// from the flow (its panel code is kept below for when other sources return).
const SOURCES_IN_FLOW = false;
const TOTAL_STEPS = SOURCES_IN_FLOW ? 3 : 2;

interface PolicySetupWizardProps {
  category: PolicyCategory;
  config: PolicyConfigDef;
  initial: PolicyState;
  /** Sources a policy can run over (catalog-supplied). */
  sources: PolicySource[];
  /** Document types scope can be narrowed to (catalog-supplied). */
  docTypes: string[];
  canConfigure: boolean;
  /** Whether the Classification (ingestion) policy is active — gates doc-type narrowing. */
  classificationEnabled: boolean;
  /** "create" seeds the workflow from the preset; "edit" loads the backing automation. */
  mode?: "create" | "edit";
  /** The backing automation to edit (edit mode). */
  existingAutomation?: AutomationConfig;
  /** The backing folder, to pre-fill output + retry settings (edit mode). */
  initialFolder?: WatchedFolder;
  onCancel: () => void;
  /**
   * Fires on submit with the saved workflow + collected settings. May be async;
   * if the returned promise rejects, the wizard re-enables submit and surfaces
   * the failure rather than hanging on a permanently-disabled button.
   */
  onComplete: (result: PolicyWizardResult) => void | Promise<void>;
  /**
   * For preset (tool-chain) policies whose Workflow step is the locked tool
   * config: fires instead of `onComplete`, carrying the configured tools as
   * operations + mapped pipeline steps. When absent the wizard uses the
   * add/remove builder + `onComplete`.
   */
  onCommitConfig?: (result: PolicyConfigResult) => void | Promise<void>;
  onSetupClassification: () => void;
}

/**
 * The shared policy wizard, used for both setup and edit. Two steps: Workflow
 * (the tool pipeline, reusing the Watch Folders builder) → Settings (the policy
 * fields + output/retry config). The workflow builder is kept mounted across
 * steps so the final action can trigger its save.
 */
export function PolicySetupWizard({
  category,
  config,
  initial,
  sources: sourceDefs,
  docTypes,
  canConfigure,
  classificationEnabled,
  mode = "create",
  existingAutomation,
  initialFolder,
  onCancel,
  onComplete,
  onCommitConfig,
  onSetupClassification,
}: PolicySetupWizardProps) {
  const { t } = useTranslation();
  const isEdit = mode === "edit";
  // Preset (tool-chain) policies render the locked tool config as their Workflow
  // step instead of the add/remove builder.
  const toolChain = getPolicyToolChain(category.id);
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [fieldValues, setFieldValues] = useState(() =>
    resolveFieldValues(config, initial),
  );
  const [sources, setSources] = useState<string[]>(
    initial.sources.length ? initial.sources : ["editor"],
  );
  const [scopeNarrow, setScopeNarrow] = useState(initial.scopeTypes.length > 0);
  const [scopeTypes, setScopeTypes] = useState<string[]>(initial.scopeTypes);
  // Reviewer isn't shown in the flow; the field is still saved on the policy,
  // defaulted to the signed-in user.
  const reviewerEmail = initial.reviewerEmail || user?.email || "";
  // Output + retry settings — the real, working folder settings (the engine
  // applies them). Pre-filled from the backing folder in edit mode.
  const [outputMode, setOutputMode] = useState<"new_file" | "new_version">(
    initialFolder?.outputMode ?? "new_version",
  );
  const [outputName, setOutputName] = useState(initialFolder?.outputName ?? "");
  const [outputNamePosition, setOutputNamePosition] = useState<
    "prefix" | "suffix" | "auto-number"
  >(initialFolder?.outputNamePosition ?? "prefix");
  const [maxRetries, setMaxRetries] = useState(initialFolder?.maxRetries ?? 3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(
    initialFolder?.retryDelayMinutes ?? 5,
  );
  // The editor event this policy runs on: input on upload, or output on export.
  const [runOn, setRunOn] = useState<"upload" | "export">(
    initial.runOn ?? "upload",
  );
  const workflowSave = useRef<(() => void) | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the workflow builder: the backing automation in edit, else a synthetic
  // config carrying the category preset's operations (created on save).
  const seedAutomation = useMemo<AutomationConfig>(
    () =>
      existingAutomation ?? {
        id: "",
        name: `${category.label} Policy`,
        description: `${category.label} policy workflow`,
        icon: "WorkIcon",
        operations: config.defaultOperations,
        createdAt: "",
        updatedAt: "",
      },
    [existingAutomation, category.label, config.defaultOperations],
  );

  if (!canConfigure) {
    return (
      <div className="pol-detail">
        <PanelHeader
          icon={category.icon}
          accent={ROW_ACCENT[category.id]}
          title={
            isEdit
              ? t("policies.wizard.editTitle", "Edit {{label}} Policy", {
                  label: t(`policies.catalog.${category.id}`, category.label),
                })
              : t("policies.wizard.setupTitle", "Set up {{label}} Policy", {
                  label: t(`policies.catalog.${category.id}`, category.label),
                })
          }
          onClose={onCancel}
          closeLabel={t("policies.wizard.close", "Close")}
        />
        <div className="pol-scroll">
          <EmptyState
            title={t(
              "policies.wizard.lockedTitle",
              "Managed by your organization",
            )}
            description={t(
              "policies.wizard.lockedDescription",
              "Contact a team leader to change this policy.",
            )}
          />
        </div>
      </div>
    );
  }

  const back = () =>
    step > 1 ? setStep((s) => Math.max(1, s - 1)) : onCancel();

  const toggleSource = (id: string) =>
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  // Once the builder persists the workflow, map its operations to backend
  // endpoint paths (the registry only lives in the Workflow step) and hand the
  // automation + built steps + settings to the host (which closes the wizard on
  // success). If the host's async save rejects, recover so the submit button
  // doesn't stay disabled forever.
  const handleWorkflowSaved = (
    automation: AutomationConfig,
    toolRegistry: Partial<ToolRegistry>,
  ) => {
    const { definition, unresolved } = buildPipelineDefinition(
      automation,
      toolRegistry,
    );
    Promise.resolve(
      onComplete({
        automation,
        fieldValues,
        sources,
        scopeTypes: scopeNarrow ? scopeTypes : [],
        reviewerEmail,
        folder: {
          runOn,
          outputMode,
          outputName: outputName.trim(),
          outputNamePosition,
          maxRetries,
          retryDelayMinutes,
        },
        pipelineSteps: definition.steps,
        unresolvedOps: unresolved,
      }),
    ).catch(() => {
      setSubmitting(false);
      setSaveError(
        t(
          "policies.wizard.saveError",
          "Couldn't save the policy. Please try again.",
        ),
      );
    });
  };

  // Tool-chain policies: the locked config step emits its enabled tools as
  // operations + mapped steps; hand them to the host's commit path.
  const handleToolConfigSaved = (
    operations: AutomationOperation[],
    pipelineSteps: { operation: string; parameters: Record<string, unknown> }[],
    unresolvedOps: string[],
  ) => {
    Promise.resolve(
      onCommitConfig?.({
        operations,
        pipelineSteps,
        unresolvedOps,
        fieldValues,
        sources,
        scopeTypes: scopeNarrow ? scopeTypes : [],
        reviewerEmail,
        folder: {
          runOn,
          outputMode,
          outputName: outputName.trim(),
          outputNamePosition,
          maxRetries,
          retryDelayMinutes,
        },
      }),
    ).catch(() => {
      setSubmitting(false);
      setSaveError(
        t(
          "policies.wizard.saveError",
          "Couldn't save the policy. Please try again.",
        ),
      );
    });
  };

  // Final submit: guard against double-submit (the step stays mounted, so a
  // second click would persist twice), then trigger the step's save.
  const submit = () => {
    if (submitting) return;
    setSaveError(null);
    setSubmitting(true);
    workflowSave.current?.();
  };

  // The builder couldn't save (e.g. no configured tools) — surface it and send
  // the user back to the Workflow step to fix it.
  const handleSaveFailed = () => {
    setSubmitting(false);
    setSaveError(
      t(
        "policies.wizard.noToolsError",
        "Add at least one configured tool to the workflow first.",
      ),
    );
    setStep(1);
  };

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        accent={ROW_ACCENT[category.id]}
        title={
          isEdit
            ? t("policies.wizard.editTitle", "Edit {{label}} Policy", {
                label: t(`policies.catalog.${category.id}`, category.label),
              })
            : t("policies.wizard.setupTitle", "Set up {{label}} Policy", {
                label: t(`policies.catalog.${category.id}`, category.label),
              })
        }
        onClose={onCancel}
        closeLabel={t("cancel", "Cancel")}
      />

      <div className="pol-steps">
        <span className="pol-step-label">
          {t("policies.wizard.stepOf", "Step {{step}} of {{total}}", {
            step,
            total: TOTAL_STEPS,
          })}
        </span>
        <StepIndicator total={TOTAL_STEPS} current={step} />
      </div>

      <div className="pol-scroll">
        {saveError && (
          <Banner
            tone="danger"
            icon={<InfoOutlinedIcon sx={{ fontSize: "1rem" }} />}
            description={saveError}
          />
        )}
        {/* Step 1 — Workflow. Kept mounted (hidden on other steps) so the final
            submit can trigger its save. Preset (tool-chain) policies show the
            locked, per-tool config; the rest show the add/remove builder. */}
        <div style={{ display: step === 1 ? undefined : "none" }}>
          {toolChain ? (
            <>
              <p className="pol-desc">
                {t(
                  "policies.wizard.toolChainDesc",
                  "Configure the tools this policy runs on each document.",
                )}
              </p>
              <PolicyToolConfigStep
                chainIds={toolChain}
                initialOperations={
                  existingAutomation?.operations ?? config.defaultOperations
                }
                presetOperations={config.defaultOperations}
                categoryLabel={category.label}
                saveTriggerRef={workflowSave}
                onComplete={handleToolConfigSaved}
              />
            </>
          ) : (
            <>
              <p className="pol-desc">
                {t(
                  "policies.wizard.builderDesc",
                  "Build the sequence of tools this policy runs on each document.",
                )}
              </p>
              <PolicyWorkflowStep
                automation={seedAutomation}
                mode={isEdit ? AutomationMode.EDIT : AutomationMode.SUGGESTED}
                saveTriggerRef={workflowSave}
                onComplete={handleWorkflowSaved}
                onSaveFailed={handleSaveFailed}
              />
            </>
          )}
        </div>

        {step === 2 && (
          <>
            <p className="pol-desc">{category.desc}</p>
            {config.fields.length > 0 && (
              <Card padding="none">
                {config.fields.map((f, i) => (
                  <PolicyFieldRow
                    key={f.key}
                    field={f}
                    value={fieldValues[f.key]}
                    first={i === 0}
                    onChange={(v) =>
                      setFieldValues((prev) => ({ ...prev, [f.key]: v }))
                    }
                  />
                ))}
              </Card>
            )}

            {/* Real, working output + retry settings (applied by the engine). */}
            <p className="pol-section-label">
              {t("policies.wizard.outputRetriesLabel", "Output & retries")}
            </p>
            <Card padding="none">
              {/* The editor event the policy runs on: input on upload, or
                  output on export (enforced before the file is exported). */}
              <div className="pol-subhead">
                {t("policies.wizard.runOnSubhead", "Run on")}
              </div>
              <div className="pol-field" data-first>
                <SettingsRow
                  label={t("policies.wizard.runOnLabel", "Run on")}
                  control={
                    <Select
                      inputSize="sm"
                      value={runOn}
                      onChange={(e) =>
                        setRunOn(e.target.value as "upload" | "export")
                      }
                      aria-label={t("policies.wizard.runOnLabel", "Run on")}
                      options={[
                        {
                          value: "upload",
                          label: t("policies.wizard.runOnUpload", "Upload"),
                        },
                        {
                          value: "export",
                          label: t("policies.wizard.runOnExport", "Export"),
                        },
                      ]}
                    />
                  }
                />
              </div>
              <div className="pol-subhead">
                {t("policies.wizard.outputSubhead", "Output")}
              </div>
              <div className="pol-field" data-first>
                <SettingsRow
                  label={t("policies.wizard.outputAsLabel", "Output as")}
                  control={
                    <Select
                      inputSize="sm"
                      value={outputMode}
                      onChange={(e) => {
                        const mode = e.target.value as
                          | "new_file"
                          | "new_version";
                        setOutputMode(mode);
                        // Auto-number only applies to new files; a new version
                        // replaces the file in place, so fall back to suffix.
                        if (
                          mode === "new_version" &&
                          outputNamePosition === "auto-number"
                        ) {
                          setOutputNamePosition("suffix");
                        }
                      }}
                      aria-label={t(
                        "policies.wizard.outputModeAria",
                        "Output mode",
                      )}
                      options={[
                        {
                          value: "new_file",
                          label: t("policies.wizard.outputNewFile", "New file"),
                        },
                        {
                          value: "new_version",
                          label: t(
                            "policies.wizard.outputNewVersion",
                            "New version",
                          ),
                        },
                      ]}
                    />
                  }
                />
              </div>
              {/* Output filename: position + custom text together as one row. */}
              <div className="pol-subhead">
                {t("policies.wizard.outputFilenameSubhead", "Output filename")}
              </div>
              <div className="pol-field" data-first>
                <div className="pol-name-row">
                  <Select
                    inputSize="sm"
                    value={outputNamePosition}
                    onChange={(e) =>
                      setOutputNamePosition(
                        e.target.value as "prefix" | "suffix" | "auto-number",
                      )
                    }
                    aria-label={t(
                      "policies.wizard.filenamePositionAria",
                      "Filename position",
                    )}
                    options={[
                      {
                        value: "prefix",
                        label: t("policies.wizard.filenamePrefix", "Prefix"),
                      },
                      {
                        value: "suffix",
                        label: t("policies.wizard.filenameSuffix", "Suffix"),
                      },
                      // Auto-number only makes sense for separate new files.
                      ...(outputMode === "new_file"
                        ? [
                            {
                              value: "auto-number",
                              label: t(
                                "policies.wizard.filenameAutoNumber",
                                "Auto-number",
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                  {/* Auto-number names the file itself, so there's no custom
                      text to add — only show the input for prefix/suffix. */}
                  {outputNamePosition !== "auto-number" && (
                    <Input
                      inputSize="sm"
                      value={outputName}
                      onChange={(e) => setOutputName(e.target.value)}
                      placeholder={t(
                        "policies.wizard.filenameTextPlaceholder",
                        "Text to add (optional)",
                      )}
                      aria-label={t(
                        "policies.wizard.filenameTextAria",
                        "Filename text",
                      )}
                    />
                  )}
                </div>
              </div>
              <div className="pol-field">
                <SettingsRow
                  label={t("policies.wizard.maxRetriesLabel", "Max retries")}
                  control={
                    <Input
                      type="number"
                      inputSize="sm"
                      value={String(maxRetries)}
                      onChange={(e) =>
                        setMaxRetries(Math.max(0, Number(e.target.value) || 0))
                      }
                      aria-label={t(
                        "policies.wizard.maxRetriesLabel",
                        "Max retries",
                      )}
                    />
                  }
                />
              </div>
              <div className="pol-field">
                <SettingsRow
                  label={t(
                    "policies.wizard.retryDelayLabel",
                    "Retry delay (min)",
                  )}
                  control={
                    <Input
                      type="number"
                      inputSize="sm"
                      value={String(retryDelayMinutes)}
                      onChange={(e) =>
                        setRetryDelayMinutes(
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                      aria-label={t(
                        "policies.wizard.retryDelayAria",
                        "Retry delay minutes",
                      )}
                    />
                  }
                />
              </div>
            </Card>
          </>
        )}

        {/* Sources step — kept in code, out of the flow for this release
            (SOURCES_IN_FLOW), since sources are always "editor" for now. */}
        {SOURCES_IN_FLOW && step === 3 && (
          <>
            <p className="pol-desc">
              {t(
                "policies.wizard.sourcesDesc",
                "Choose where this policy runs and which document types it applies to.",
              )}
            </p>
            <p className="pol-section-label">
              {t("policies.wizard.sourcesLabel", "Sources")}
            </p>
            <Card padding="none">
              {sourceDefs.map((src, i) => (
                <div
                  key={src.id}
                  className="pol-source"
                  data-first={i === 0 || undefined}
                >
                  <Checkbox
                    checked={sources.includes(src.id)}
                    onChange={() => toggleSource(src.id)}
                    leadingIcon={src.icon}
                    label={src.label}
                    description={src.desc}
                  />
                </div>
              ))}
            </Card>

            <p className="pol-section-label">
              {t("policies.wizard.docTypesLabel", "Document types")}
            </p>
            {!classificationEnabled ? (
              <Banner
                tone="warning"
                icon={<InfoOutlinedIcon sx={{ fontSize: "1rem" }} />}
                title={t(
                  "policies.wizard.allDocTypesTitle",
                  "All document types",
                )}
                description={t(
                  "policies.wizard.allDocTypesDescription",
                  "Enable the Classification policy to filter by document type.",
                )}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSetupClassification}
                  >
                    {t(
                      "policies.wizard.setupClassification",
                      "Set up Classification",
                    )}
                  </Button>
                }
              />
            ) : (
              <Card padding="none">
                <div className="pol-doctypes-head">
                  <span className="pol-field-label">
                    {scopeTypes.length === 0
                      ? t(
                          "policies.wizard.allDocTypesTitle",
                          "All document types",
                        )
                      : t(
                          "policies.wizard.typesSelected",
                          "{{count}} types selected",
                          { count: scopeTypes.length },
                        )}
                  </span>
                  <button
                    className="pol-link"
                    onClick={() => setScopeNarrow((v) => !v)}
                  >
                    {scopeNarrow
                      ? t("policies.wizard.clear", "Clear")
                      : t("policies.wizard.edit", "Edit")}
                  </button>
                </div>
                {scopeNarrow && (
                  <div className="pol-doctypes">
                    {docTypes.map((dt) => (
                      <Checkbox
                        key={dt}
                        checked={scopeTypes.includes(dt)}
                        onChange={() =>
                          setScopeTypes((prev) =>
                            prev.includes(dt)
                              ? prev.filter((d) => d !== dt)
                              : [...prev, dt],
                          )
                        }
                        label={dt}
                      />
                    ))}
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>

      <div className="pol-footer">
        <Button variant="ghost" size="sm" onClick={back}>
          {step > 1 ? t("policies.wizard.back", "Back") : t("cancel", "Cancel")}
        </Button>
        {step < TOTAL_STEPS ? (
          <Button
            variant="gradient"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
          >
            {t("policies.wizard.continue", "Continue")}
          </Button>
        ) : (
          <Button
            variant="gradient"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={submit}
            disabled={submitting}
          >
            {isEdit
              ? t("policies.wizard.saveChanges", "Save Changes")
              : t("policies.wizard.enablePolicy", "Enable Policy")}
          </Button>
        )}
      </div>
    </div>
  );
}
