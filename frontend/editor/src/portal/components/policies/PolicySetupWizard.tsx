import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Select,
  Tabs,
  ToggleSwitch,
} from "@app/ui";
import { SettingsRow } from "@app/ui/SettingsRow";
import {
  humanizeEndpoint,
  type CatalogueEntry,
  type PipelineStep,
  type PolicySetupResult,
} from "@portal/api/policies";
import {
  policyEndpoint,
  policyStepFromWire,
  policyStepToWire,
  type PolicyParams,
  type PolicyToolId,
  type PolicyToolStep,
} from "@app/policies/operations";
import { fetchSources } from "@portal/api/sources";
import { useAsync } from "@portal/hooks/useAsync";
import { PolicyFieldRow } from "@portal/components/policies/PolicyFieldRow";
import { policyIcon } from "@portal/components/policies/policyIcons";
import { sourceTypeMeta } from "@portal/components/sources/sourceTypes";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import "@portal/views/Policies.css";

interface PolicySetupWizardProps {
  /** The category being configured, or null when closed. */
  entry: CatalogueEntry | null;
  onClose: () => void;
  /**
   * Fires on submit with the collected settings + built pipeline steps. May be
   * async; if it rejects the wizard re-enables submit and surfaces the failure.
   */
  onSubmit: (entry: CatalogueEntry, result: PolicySetupResult) => Promise<void>;
}

type Step = "workflow" | "settings";

/** A policy step plus whether it runs. */
type ToolState = PolicyToolStep & { enabled: boolean };

/** Resolve each field's effective value: saved override, else definition default. */
function resolveFieldValues(
  entry: CatalogueEntry,
): Record<string, boolean | string | string[]> {
  const saved = entry.policy?.state.fieldValues ?? {};
  const out: Record<string, boolean | string | string[]> = {};
  for (const f of entry.config.fields) out[f.key] = saved[f.key] ?? f.value;
  return out;
}

/**
 * Seed the workflow's tools. A configured policy's saved steps win (so editing
 * round-trips); otherwise the category preset's default chain. Each preset step
 * starts enabled — the user toggles tools off in the workflow.
 */
// Temporary until the catalogue carries a defaultEnabled flag.
const DISABLED_BY_DEFAULT = new Set<PolicyToolId>(["watermark"]);

/**
 * Policy-facing framing for each capability a policy can include. Labels and
 * descriptions describe what the policy DOES to a document — deliberately not
 * naming the underlying tool — so the setup reads as the policy's own settings
 * rather than an assembled chain of tools. Endpoints with no entry fall back to
 * the humanised endpoint name with no description.
 */
const CAPABILITY_META: Record<
  PolicyToolId,
  { labelKey: string; labelEn: string; descKey: string; descEn: string }
> = {
  redact: {
    labelKey: "portal.policies.wizard.capability.redact.label",
    labelEn: "Redact sensitive information",
    descKey: "portal.policies.wizard.capability.redact.desc",
    descEn:
      "Finds and blacks out sensitive details — like Social Security and card numbers — so they can't be read.",
  },
  sanitize: {
    labelKey: "portal.policies.wizard.capability.sanitize.label",
    labelEn: "Strip active content",
    descKey: "portal.policies.wizard.capability.sanitize.desc",
    descEn:
      "Removes hidden JavaScript so nothing can run automatically when the document is opened.",
  },
  watermark: {
    labelKey: "portal.policies.wizard.capability.watermark.label",
    labelEn: "Apply a watermark",
    descKey: "portal.policies.wizard.capability.watermark.desc",
    descEn: "Stamps a visible mark (e.g. “Confidential”) across every page.",
  },
  ocr: {
    labelKey: "portal.policies.wizard.capability.ocr.label",
    labelEn: "Make text searchable",
    descKey: "portal.policies.wizard.capability.ocr.desc",
    descEn: "Runs OCR so scanned pages become selectable, searchable text.",
  },
  flatten: {
    labelKey: "portal.policies.wizard.capability.flatten.label",
    labelEn: "Flatten the document",
    descKey: "portal.policies.wizard.capability.flatten.desc",
    descEn:
      "Merges form fields and annotations into the page so they can't be edited.",
  },
  compress: {
    labelKey: "portal.policies.wizard.capability.compress.label",
    labelEn: "Reduce file size",
    descKey: "portal.policies.wizard.capability.compress.desc",
    descEn: "Compresses the document to a smaller file size.",
  },
};

function seedTools(entry: CatalogueEntry): ToolState[] {
  const savedSteps = entry.policy?.steps ?? [];
  const savedByTool = new Map<PolicyToolId, PolicyToolStep>();
  for (const wire of savedSteps) {
    const step = policyStepFromWire(wire);
    if (step) savedByTool.set(step.toolId, step);
  }
  // defaultOperations is the canonical list (so tools added later still show on edit); a saved
  // step's params win over the preset.
  return entry.config.defaultOperations.map((preset) => {
    const saved = savedByTool.get(preset.toolId);
    return {
      ...(saved ?? preset),
      enabled: saved
        ? true
        : savedSteps.length > 0
          ? false
          : !DISABLED_BY_DEFAULT.has(preset.toolId),
    };
  });
}

/**
 * The real "set up a policy" flow, mirroring the editor wizard: a Workflow step
 * (the tool chain — toggle which tools run) and a Settings step (policy fields,
 * sources, scope, reviewer, output/run). Submitting builds the pipeline steps
 * (each `operation` an endpoint path) and persists via the real POST.
 */
export function PolicySetupWizard({
  entry,
  onClose,
  onSubmit,
}: PolicySetupWizardProps) {
  // Re-key the wizard on the opened category so all state resets cleanly when a
  // different category is opened (avoids stale field values bleeding across).
  return entry ? (
    <PolicySetupWizardBody
      key={entry.category.id}
      entry={entry}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  ) : null;
}

function PolicySetupWizardBody({
  entry,
  onClose,
  onSubmit,
}: {
  entry: CatalogueEntry;
  onClose: () => void;
  onSubmit: (entry: CatalogueEntry, result: PolicySetupResult) => Promise<void>;
}) {
  const { t } = useTranslation();

  const { category, config, policy } = entry;
  const isEdit = policy != null;

  const [step, setStep] = useState<Step>("workflow");
  const [tools, setTools] = useState<ToolState[]>(() => seedTools(entry));
  const [fieldValues, setFieldValues] = useState(() =>
    resolveFieldValues(entry),
  );
  const [sources, setSources] = useState<string[]>(
    policy?.state.sources ?? ["editor"],
  );

  const sourcesAsync = useAsync(() => fetchSources(), []);
  const availableSources = useMemo(() => {
    const backendSources = (sourcesAsync.data?.sources ?? []).filter(
      (s) => s.status !== "disabled",
    );
    const editorSource = {
      id: "editor",
      name: t("portal.sources.types.editor.label"),
      type: "editor",
      status: "active" as const,
      referenceCount: 0,
      referencingPolicies: [],
      config: [],
      docsTotal: null,
    };
    return [editorSource, ...backendSources];
  }, [sourcesAsync.data, t]);
  // Document-type scoping has no UI; preserve any saved scope on edit and
  // default new policies to all document types.
  const [scopeTypes] = useState<string[]>(policy?.state.scopeTypes ?? []);
  // TODO: replace with user-picker backed by GET /api/v1/user/users (UserSummary[]).
  // Store username (which is the email in Spring Security) as reviewerEmail.
  // See UserSelector.tsx in the editor for the grouping/display pattern.
  const [reviewerEmail] = useState(policy?.state.reviewerEmail ?? "");
  const [outputMode, setOutputMode] = useState<"new_file" | "new_version">(
    policy?.state.outputMode ?? "new_version",
  );
  const [outputName, setOutputName] = useState(policy?.state.outputName ?? "");
  const [outputNamePosition, setOutputNamePosition] = useState<
    "prefix" | "suffix" | "auto-number"
  >(policy?.state.outputNamePosition ?? "suffix");
  const [runOn, setRunOn] = useState<"upload" | "export">(
    policy?.state.runOn ?? "upload",
  );
  // Policies run once; retry config has no UI. Preserve any saved values on
  // edit and default new policies to no retries (run once).
  const [maxRetries] = useState(policy?.state.maxRetries ?? 0);
  const [retryDelayMinutes] = useState(policy?.state.retryDelayMinutes ?? 0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledTools = useMemo(() => tools.filter((tl) => tl.enabled), [tools]);

  function setToolEnabled(toolId: PolicyToolId, enabled: boolean) {
    setTools((prev) =>
      prev.map((tl) => (tl.toolId === toolId ? { ...tl, enabled } : tl)),
    );
  }

  function setToolParams<Id extends PolicyToolId>(
    toolId: Id,
    params: PolicyParams<Id>,
  ) {
    setTools((prev) =>
      prev.map((tl) =>
        tl.toolId === toolId ? ({ ...tl, params } as ToolState) : tl,
      ),
    );
  }

  function toggleSource(id: string) {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function submit() {
    if (submitting) return;
    if (enabledTools.length === 0) {
      setError(t("portal.policies.wizard.errors.noTools"));
      setStep("workflow");
      return;
    }
    setError(null);
    setSubmitting(true);
    const steps: PipelineStep[] = enabledTools.map((tl) =>
      policyStepToWire(tl),
    );
    try {
      await onSubmit(entry, {
        fieldValues,
        sources,
        scopeTypes,
        reviewerEmail,
        outputMode,
        outputName: outputName.trim(),
        outputNamePosition,
        runOn,
        maxRetries,
        retryDelayMinutes,
        steps,
      });
    } catch {
      setSubmitting(false);
      setError(t("portal.policies.wizard.errors.saveFailed"));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={
        <span className="portal-policies__wizard-title">
          <span className="portal-policies__cat-icon" aria-hidden>
            {policyIcon(category.icon)}
          </span>
          {isEdit
            ? t("portal.policies.wizard.title.edit", {
                category: t(category.label),
              })
            : t("portal.policies.wizard.title.setUp", {
                category: t(category.label),
              })}
        </span>
      }
      subtitle={t(config.summary)}
      footer={
        <div className="portal-policies__wizard-foot">
          <Button variant="tertiary" size="sm" onClick={onClose}>
            {t("portal.policies.wizard.actions.cancel")}
          </Button>
          {step === "workflow" ? (
            <Button
              size="sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setStep("settings")}
            >
              {t("portal.policies.wizard.actions.continue")}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                style={{ marginLeft: "auto" }}
                onClick={() => setStep("workflow")}
              >
                {t("portal.policies.wizard.actions.back")}
              </Button>
              <Button size="sm" onClick={submit} loading={submitting}>
                {isEdit
                  ? t("portal.policies.wizard.actions.saveChanges")
                  : t("portal.policies.wizard.actions.enablePolicy")}
              </Button>
            </>
          )}
        </div>
      }
    >
      <Tabs
        variant="underline"
        ariaLabel={t("portal.policies.wizard.tabs.ariaLabel")}
        activeKey={step}
        onChange={(k) => setStep(k as Step)}
        items={[
          { key: "workflow", label: t("portal.policies.wizard.tabs.workflow") },
          { key: "settings", label: t("portal.policies.wizard.tabs.settings") },
        ]}
      />

      {error && (
        <Banner
          tone="danger"
          description={error}
          className="portal-policies__wizard-banner"
        />
      )}

      {step === "workflow" && (
        <div className="portal-policies__wizard-section">
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.workflow.description",
              "Choose what this policy does to every document it processes.",
            )}
          </p>
          <Card padding="none">
            <div className="portal-policies__capabilities">
              {tools.map((tl) => {
                const meta = CAPABILITY_META[tl.toolId];
                const label = meta
                  ? t(meta.labelKey, meta.labelEn)
                  : humanizeEndpoint(policyEndpoint(tl.toolId), t);
                const description = meta
                  ? t(meta.descKey, meta.descEn)
                  : undefined;
                return (
                  <div
                    key={tl.toolId}
                    className="portal-policies__capability"
                    data-on={tl.enabled || undefined}
                  >
                    <SettingsRow
                      label={label}
                      description={description}
                      control={
                        <ToggleSwitch
                          size="sm"
                          checked={tl.enabled}
                          onChange={(checked) =>
                            setToolEnabled(tl.toolId, checked)
                          }
                          label=""
                        />
                      }
                    />
                    {tl.enabled && (
                      <div className="portal-policies__capability-config">
                        {tl.toolId === "redact" && (
                          <PolicyRedactConfig
                            parameters={tl.params}
                            onChange={(params) =>
                              setToolParams("redact", params)
                            }
                          />
                        )}
                        {tl.toolId === "watermark" && (
                          <PolicyWatermarkConfig
                            parameters={tl.params}
                            onChange={(params) =>
                              setToolParams("watermark", params)
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {step === "settings" && (
        <div className="portal-policies__wizard-section">
          {config.fields.length > 0 && (
            <>
              <h3 className="portal-policies__wizard-heading">
                {t("portal.policies.wizard.settings.heading")}
              </h3>
              <div className="portal-policies__fields">
                {config.fields.map((field) => (
                  <PolicyFieldRow
                    key={field.key}
                    field={field}
                    value={fieldValues[field.key]}
                    onChange={(v) =>
                      setFieldValues((prev) => ({ ...prev, [field.key]: v }))
                    }
                  />
                ))}
              </div>
            </>
          )}

          <h3 className="portal-policies__wizard-heading">
            {t("portal.policies.wizard.sources.heading")}
          </h3>
          {sourcesAsync.loading && !sourcesAsync.data ? (
            <p className="portal-policies__sources-loading">
              {t("portal.policies.wizard.sources.loading")}
            </p>
          ) : (
            // The editor is always an available source (unconditionally prepended
            // to availableSources), so the list is never empty — no "no sources"
            // state exists.
            <div className="portal-policies__sources">
              {availableSources.map((src) => (
                // A selectable multi-line tile (icon + name + type + check).
                // Uses the shared Button (raw <button> is lint-banned); the tile
                // CSS overrides the Button's fixed height for the two-line layout.
                <Button
                  key={src.id}
                  variant="quiet"
                  justify="start"
                  className={
                    "portal-policies__source" +
                    (sources.includes(src.id)
                      ? " portal-policies__source--on"
                      : "")
                  }
                  onClick={() => toggleSource(src.id)}
                >
                  <span className="portal-policies__source-icon" aria-hidden>
                    {sourceTypeMeta(src.type).icon}
                  </span>
                  <span className="portal-policies__source-text">
                    <span className="portal-policies__source-label">
                      {src.name}
                    </span>
                    <span className="portal-policies__source-desc">
                      {src.type}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}

          <h3 className="portal-policies__wizard-heading">
            {t("portal.policies.wizard.output.heading")}
          </h3>
          <div className="portal-policies__fields">
            {sources.includes("editor") && (
              <>
                <FormField
                  label={t("portal.policies.wizard.output.runOn.label")}
                  helperText={t("portal.policies.wizard.output.runOn.helper")}
                >
                  <Select
                    inputSize="sm"
                    value={runOn}
                    onChange={(value) =>
                      setRunOn((value ?? "upload") as "upload" | "export")
                    }
                    options={[
                      {
                        value: "upload",
                        label: t("portal.policies.wizard.output.runOn.upload"),
                      },
                      {
                        value: "export",
                        label: t("portal.policies.wizard.output.runOn.export"),
                      },
                    ]}
                  />
                </FormField>
                <FormField
                  label={t("portal.policies.wizard.output.outputAs.label")}
                >
                  <Select
                    inputSize="sm"
                    value={outputMode}
                    onChange={(value) => {
                      const mode = (value ?? "new_file") as
                        | "new_file"
                        | "new_version";
                      setOutputMode(mode);
                      // Auto-number only applies to separate new files.
                      if (
                        mode === "new_version" &&
                        outputNamePosition === "auto-number"
                      ) {
                        setOutputNamePosition("suffix");
                      }
                    }}
                    options={[
                      {
                        value: "new_version",
                        label: t(
                          "portal.policies.wizard.output.outputAs.newVersion",
                        ),
                      },
                      {
                        value: "new_file",
                        label: t(
                          "portal.policies.wizard.output.outputAs.newFile",
                        ),
                      },
                    ]}
                  />
                </FormField>
                <FormField
                  label={t("portal.policies.wizard.output.filenameRule.label")}
                >
                  <div className="portal-policies__name-row">
                    <Select
                      inputSize="sm"
                      value={outputNamePosition}
                      onChange={(value) =>
                        setOutputNamePosition(
                          (value ?? "suffix") as
                            | "prefix"
                            | "suffix"
                            | "auto-number",
                        )
                      }
                      options={[
                        {
                          value: "prefix",
                          label: t(
                            "portal.policies.wizard.output.filenameRule.prefix",
                          ),
                        },
                        {
                          value: "suffix",
                          label: t(
                            "portal.policies.wizard.output.filenameRule.suffix",
                          ),
                        },
                        ...(outputMode === "new_file"
                          ? [
                              {
                                value: "auto-number",
                                label: t(
                                  "portal.policies.wizard.output.filenameRule.autoNumber",
                                ),
                              },
                            ]
                          : []),
                      ]}
                    />
                    {outputNamePosition !== "auto-number" && (
                      <Input
                        inputSize="sm"
                        value={outputName}
                        placeholder={t(
                          "portal.policies.wizard.output.filenameRule.placeholder",
                        )}
                        onChange={(e) => setOutputName(e.target.value)}
                      />
                    )}
                  </div>
                </FormField>
              </>
            )}
            {/* TODO: reviewer user-picker goes here */}
          </div>
        </div>
      )}
    </Modal>
  );
}
