import { useState, useMemo, useRef } from "react";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { ChipFlow } from "@shared/components/ChipFlow";
import { DataRow } from "@shared/components/DataRow";
import { Input } from "@shared/components/Input";
import { Select } from "@shared/components/Select";
import { SettingsRow } from "@shared/components/SettingsRow";
import { FormField } from "@shared/components/FormField";
import { Checkbox } from "@shared/components/Checkbox";
import { Banner } from "@shared/components/Banner";
import { EmptyState } from "@shared/components/EmptyState";
import { StepIndicator } from "@shared/components/StepIndicator";
import { IconBadge } from "@shared/components/IconBadge";
import type {
  PolicyCategory,
  PolicyConfigDef,
  PolicySource,
  PolicyState,
  PolicyWizardResult,
} from "@app/types/policies";
import type { AutomationConfig } from "@app/types/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { SmartFolder } from "@app/types/smartFolders";
import { buildPipelineDefinition } from "@app/services/policyPipeline";
import { useAuth } from "@app/auth/UseSession";
import { PolicyFieldRow } from "@app/components/policies/PolicyFieldRow";
import { resolveFieldValues } from "@app/components/policies/policyValues";
import {
  PolicyWorkflowStep,
  AutomationMode,
} from "@app/components/policies/PolicyWorkflowStep";

const TOTAL_STEPS = 4;

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
  initialFolder?: SmartFolder;
  onCancel: () => void;
  /**
   * Fires on submit with the saved workflow + collected settings. May be async;
   * if the returned promise rejects, the wizard re-enables submit and surfaces
   * the failure rather than hanging on a permanently-disabled button.
   */
  onComplete: (result: PolicyWizardResult) => void | Promise<void>;
  onSetupClassification: () => void;
}

/**
 * The shared policy wizard, used for both setup and edit. Four steps:
 * Workflow (the tool pipeline, reusing the Watch Folders builder) → Settings
 * (the policy fields) → Sources → Review. The workflow builder is kept mounted
 * across steps so the final action can trigger its save.
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
  onSetupClassification,
}: PolicySetupWizardProps) {
  const isEdit = mode === "edit";
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
  // Default flagged-document reviewer to the signed-in user.
  const [reviewerEmail, setReviewerEmail] = useState(
    initial.reviewerEmail || user?.email || "",
  );
  // Output + retry settings — the real, working folder settings (the engine
  // applies them). Pre-filled from the backing folder in edit mode.
  const [outputMode, setOutputMode] = useState<"new_file" | "new_version">(
    initialFolder?.outputMode ?? "new_file",
  );
  const [outputName, setOutputName] = useState(initialFolder?.outputName ?? "");
  const [outputNamePosition, setOutputNamePosition] = useState<
    "prefix" | "suffix" | "auto-number"
  >(initialFolder?.outputNamePosition ?? "prefix");
  const [maxRetries, setMaxRetries] = useState(initialFolder?.maxRetries ?? 3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(
    initialFolder?.retryDelayMinutes ?? 5,
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
          title={`${isEdit ? "Edit" : "Set up"} ${category.label} Policy`}
          onBack={onCancel}
        />
        <div className="pol-scroll">
          <EmptyState
            title="Managed by your organization"
            description="Contact an admin to change this policy."
          />
        </div>
      </div>
    );
  }

  const back = () => (step > 1 ? setStep((s) => Math.max(1, s - 1)) : onCancel());

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
      setSaveError("Couldn't save the policy. Please try again.");
    });
  };

  // Final submit: guard against double-submit (the builder stays mounted, so a
  // second click would persist twice), then trigger the builder's save.
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
    setSaveError("Add at least one configured tool to the workflow first.");
    setStep(1);
  };

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        title={`${isEdit ? "Edit" : "Set up"} ${category.label} Policy`}
        subtitle={`Step ${step} of ${TOTAL_STEPS}`}
        onBack={back}
        actions={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Cancel"
            onClick={onCancel}
            leadingIcon={<CloseIcon sx={{ fontSize: "1.1rem" }} />}
          />
        }
      />

      <div className="pol-steps">
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
            submit can trigger its save. */}
        <div style={{ display: step === 1 ? undefined : "none" }}>
          <p className="pol-desc">
            Build the sequence of tools this policy runs on each document.
          </p>
          <PolicyWorkflowStep
            automation={seedAutomation}
            mode={isEdit ? AutomationMode.EDIT : AutomationMode.SUGGESTED}
            saveTriggerRef={workflowSave}
            onComplete={handleWorkflowSaved}
            onSaveFailed={handleSaveFailed}
          />
        </div>

        {step === 2 && (
          <>
            <p className="pol-desc">{category.desc}</p>
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

            {/* Real, working output + retry settings (applied by the engine). */}
            <p className="pol-section-label">Output &amp; retries</p>
            <Card padding="none">
              <div className="pol-field" data-first>
                <SettingsRow
                  label="Output"
                  control={
                    <Select
                      inputSize="sm"
                      value={outputMode}
                      onChange={(e) =>
                        setOutputMode(
                          e.target.value as "new_file" | "new_version",
                        )
                      }
                      aria-label="Output mode"
                      options={[
                        { value: "new_file", label: "New file" },
                        { value: "new_version", label: "New version" },
                      ]}
                    />
                  }
                />
              </div>
              <div className="pol-field">
                <SettingsRow
                  label="Output name"
                  control={
                    <Input
                      inputSize="sm"
                      value={outputName}
                      onChange={(e) => setOutputName(e.target.value)}
                      placeholder="optional"
                      aria-label="Output name"
                    />
                  }
                />
              </div>
              <div className="pol-field">
                <SettingsRow
                  label="Name position"
                  control={
                    <Select
                      inputSize="sm"
                      value={outputNamePosition}
                      onChange={(e) =>
                        setOutputNamePosition(
                          e.target.value as
                            | "prefix"
                            | "suffix"
                            | "auto-number",
                        )
                      }
                      aria-label="Name position"
                      options={[
                        { value: "prefix", label: "Prefix" },
                        { value: "suffix", label: "Suffix" },
                        { value: "auto-number", label: "Auto-number" },
                      ]}
                    />
                  }
                />
              </div>
              <div className="pol-field">
                <SettingsRow
                  label="Max retries"
                  control={
                    <Input
                      type="number"
                      inputSize="sm"
                      value={String(maxRetries)}
                      onChange={(e) =>
                        setMaxRetries(Math.max(0, Number(e.target.value) || 0))
                      }
                      aria-label="Max retries"
                    />
                  }
                />
              </div>
              <div className="pol-field">
                <SettingsRow
                  label="Retry delay (min)"
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
                      aria-label="Retry delay minutes"
                    />
                  }
                />
              </div>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <p className="pol-desc">
              Choose where this policy runs and which document types it applies
              to.
            </p>
            <p className="pol-section-label">Sources</p>
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

            <p className="pol-section-label">Document types</p>
            {!classificationEnabled ? (
              <Banner
                tone="warning"
                icon={<InfoOutlinedIcon sx={{ fontSize: "1rem" }} />}
                title="All document types"
                description="Enable the Classification policy to filter by document type."
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSetupClassification}
                  >
                    Set up Classification
                  </Button>
                }
              />
            ) : (
              <Card padding="none">
                <div className="pol-doctypes-head">
                  <span className="pol-field-label">
                    {scopeTypes.length === 0
                      ? "All document types"
                      : `${scopeTypes.length} types selected`}
                  </span>
                  <button
                    className="pol-link"
                    onClick={() => setScopeNarrow((v) => !v)}
                  >
                    {scopeNarrow ? "Clear" : "Edit"}
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

        {step === 4 && (
          <>
            <p className="pol-desc">
              When Stirling has low confidence in an enforcement action, it will
              send the document for human review.
            </p>
            <p className="pol-section-label">Reviewer</p>
            <Card padding="default">
              <FormField
                label="Send flagged documents to:"
                helperText="They'll open flagged documents directly in the Stirling editor."
              >
                <Input
                  type="email"
                  inputSize="sm"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  placeholder="email@company.com"
                />
              </FormField>
            </Card>

            <p className="pol-section-label">Summary</p>
            <Card padding="default">
              <div className="pol-summary-head">
                <IconBadge accent="blue" size="sm">
                  {category.icon}
                </IconBadge>
                <span className="pol-summary-title">
                  {category.label} Policy
                </span>
              </div>
              <div className="pol-summary-rows">
                <DataRow label="Enforces" align="top">
                  <ChipFlow items={config.rules} />
                </DataRow>
                <DataRow label="Sources">{sources.length} selected</DataRow>
                <DataRow label="Reviewer">
                  {reviewerEmail || <span className="pol-muted">Not set</span>}
                </DataRow>
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="pol-footer">
        <Button variant="ghost" size="sm" onClick={back}>
          {step > 1 ? "Back" : "Cancel"}
        </Button>
        {step < TOTAL_STEPS ? (
          <Button
            variant="gradient"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="gradient"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={submit}
            disabled={submitting}
          >
            {isEdit ? "Save Changes" : "Enable Policy"}
          </Button>
        )}
      </div>
    </div>
  );
}
