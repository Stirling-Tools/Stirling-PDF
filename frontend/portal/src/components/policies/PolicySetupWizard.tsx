import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  Chip,
  FormField,
  Input,
  Modal,
  Select,
  Tabs,
  ToggleSwitch,
} from "@shared/components";
import {
  POLICY_DOC_TYPES,
  humanizeEndpoint,
  type CatalogueEntry,
  type PipelineStep,
  type PolicySetupResult,
} from "@portal/api/policies";
import { fetchSources } from "@portal/api/sources";
import { useAsync } from "@portal/hooks/useAsync";
import { PolicyFieldRow } from "@portal/components/policies/PolicyFieldRow";
import { policyIcon } from "@portal/components/policies/policyIcons";
import { sourceTypeMeta } from "@portal/components/sources/sourceTypes";
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

/** A configurable tool in the workflow step: whether it runs + its params. */
interface ToolState {
  operation: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
}

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
// Temporary: tracks which tools start disabled until the tool registry lands in
// the portal and can drive this via registry metadata or a defaultEnabled flag.
const DISABLED_BY_DEFAULT = new Set(["/api/v1/security/add-watermark"]);

function seedTools(entry: CatalogueEntry): ToolState[] {
  const savedSteps = entry.policy?.steps ?? [];
  const savedByOp = new Map(savedSteps.map((s) => [s.operation, s]));
  // Always use defaultOperations as the canonical list so tools added after a
  // policy was first saved still appear when editing.
  return entry.config.defaultOperations.map((s) => {
    const saved = savedByOp.get(s.operation);
    return {
      operation: s.operation,
      enabled: saved
        ? true
        : savedSteps.length > 0
          ? false
          : !DISABLED_BY_DEFAULT.has(s.operation),
      parameters: saved?.parameters ?? s.parameters,
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
      name: t("sources.types.editor.label"),
      type: "editor",
      status: "active" as const,
      referenceCount: 0,
      referencingPolicies: [],
      config: [],
      docsTotal: null,
    };
    return [editorSource, ...backendSources];
  }, [sourcesAsync.data, t]);
  const [scopeNarrow, setScopeNarrow] = useState(
    (policy?.state.scopeTypes.length ?? 0) > 0,
  );
  const [scopeTypes, setScopeTypes] = useState<string[]>(
    policy?.state.scopeTypes ?? [],
  );
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
  const [maxRetries, setMaxRetries] = useState(policy?.state.maxRetries ?? 3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState(
    policy?.state.retryDelayMinutes ?? 5,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledTools = useMemo(() => tools.filter((tl) => tl.enabled), [tools]);

  function patchTool(operation: string, patch: Partial<ToolState>) {
    setTools((prev) =>
      prev.map((tl) => (tl.operation === operation ? { ...tl, ...patch } : tl)),
    );
  }

  function toggleSource(id: string) {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function toggleScopeType(dt: string) {
    setScopeTypes((prev) =>
      prev.includes(dt) ? prev.filter((d) => d !== dt) : [...prev, dt],
    );
  }

  async function submit() {
    if (submitting) return;
    if (enabledTools.length === 0) {
      setError(t("policies.wizard.errors.noTools"));
      setStep("workflow");
      return;
    }
    setError(null);
    setSubmitting(true);
    const steps: PipelineStep[] = enabledTools.map((tl) => ({
      operation: tl.operation,
      parameters: tl.parameters,
    }));
    try {
      await onSubmit(entry, {
        fieldValues,
        sources,
        scopeTypes: scopeNarrow ? scopeTypes : [],
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
      setError(t("policies.wizard.errors.saveFailed"));
    }
  }

  const docTypesEnabled = category.providesClassification === true;

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
            ? t("policies.wizard.title.edit", { category: category.label })
            : t("policies.wizard.title.setUp", { category: category.label })}
        </span>
      }
      subtitle={config.summary}
      footer={
        <div className="portal-policies__wizard-foot">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("policies.wizard.actions.cancel")}
          </Button>
          {step === "workflow" ? (
            <Button
              size="sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setStep("settings")}
            >
              {t("policies.wizard.actions.continue")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                style={{ marginLeft: "auto" }}
                onClick={() => setStep("workflow")}
              >
                {t("policies.wizard.actions.back")}
              </Button>
              <Button size="sm" onClick={submit} loading={submitting}>
                {isEdit
                  ? t("policies.wizard.actions.saveChanges")
                  : t("policies.wizard.actions.enablePolicy")}
              </Button>
            </>
          )}
        </div>
      }
    >
      <Tabs
        variant="underline"
        ariaLabel={t("policies.wizard.tabs.ariaLabel")}
        activeKey={step}
        onChange={(k) => setStep(k as Step)}
        items={[
          { key: "workflow", label: t("policies.wizard.tabs.workflow") },
          { key: "settings", label: t("policies.wizard.tabs.settings") },
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
            {t("policies.wizard.workflow.description")}
          </p>
          {tools.map((tl) => (
            <Card key={tl.operation} padding="tight">
              <div className="portal-policies__tool-head">
                <span className="portal-policies__tool-name">
                  {humanizeEndpoint(tl.operation)}
                </span>
                <span style={{ flex: 1 }} />
                <ToggleSwitch
                  size="sm"
                  checked={tl.enabled}
                  onChange={(checked) =>
                    patchTool(tl.operation, { enabled: checked })
                  }
                  label=""
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {step === "settings" && (
        <div className="portal-policies__wizard-section">
          {config.fields.length > 0 && (
            <>
              <h3 className="portal-policies__wizard-heading">
                {t("policies.wizard.settings.heading")}
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
            {t("policies.wizard.sources.heading")}
          </h3>
          <div className="portal-policies__sources">
            {sourcesAsync.loading && !sourcesAsync.data ? (
              <p className="portal-policies__sources-loading">
                {t("policies.wizard.sources.loading")}
              </p>
            ) : availableSources.length === 1 ? (
              <Banner
                tone="neutral"
                title={t("policies.wizard.sources.emptyTitle")}
                description={t("policies.wizard.sources.emptyDescription")}
              />
            ) : (
              availableSources.map((src) => (
                <button
                  key={src.id}
                  type="button"
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
                </button>
              ))
            )}
          </div>

          <h3 className="portal-policies__wizard-heading">
            {t("policies.wizard.docTypes.heading")}
          </h3>
          {!docTypesEnabled ? (
            <Banner
              tone="neutral"
              title={t("policies.wizard.docTypes.allTitle")}
              description={t("policies.wizard.docTypes.allDescription")}
            />
          ) : (
            <Card padding="tight">
              <div className="portal-policies__doctypes-head">
                <span>
                  {scopeTypes.length === 0
                    ? t("policies.wizard.docTypes.allTitle")
                    : t("policies.wizard.docTypes.selected", {
                        count: scopeTypes.length,
                      })}
                </span>
                <button
                  type="button"
                  className="portal-policies__link"
                  onClick={() => setScopeNarrow((v) => !v)}
                >
                  {scopeNarrow
                    ? t("policies.wizard.docTypes.clear")
                    : t("policies.wizard.docTypes.narrow")}
                </button>
              </div>
              {scopeNarrow && (
                <div className="portal-policies__doctypes">
                  {POLICY_DOC_TYPES.map((dt) => (
                    <Chip
                      key={dt}
                      tone={scopeTypes.includes(dt) ? "blue" : "neutral"}
                      size="sm"
                      onClick={() => toggleScopeType(dt)}
                    >
                      {dt}
                    </Chip>
                  ))}
                </div>
              )}
            </Card>
          )}

          <h3 className="portal-policies__wizard-heading">
            {t("policies.wizard.output.heading")}
          </h3>
          <div className="portal-policies__fields">
            {sources.includes("editor") && (
              <>
                <FormField
                  label={t("policies.wizard.output.runOn.label")}
                  helperText={t("policies.wizard.output.runOn.helper")}
                >
                  <Select
                    inputSize="sm"
                    value={runOn}
                    onChange={(e) =>
                      setRunOn(e.target.value as "upload" | "export")
                    }
                    options={[
                      {
                        value: "upload",
                        label: t("policies.wizard.output.runOn.upload"),
                      },
                      {
                        value: "export",
                        label: t("policies.wizard.output.runOn.export"),
                      },
                    ]}
                  />
                </FormField>
                <FormField label={t("policies.wizard.output.outputAs.label")}>
                  <Select
                    inputSize="sm"
                    value={outputMode}
                    onChange={(e) => {
                      const mode = e.target.value as "new_file" | "new_version";
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
                        label: t("policies.wizard.output.outputAs.newVersion"),
                      },
                      {
                        value: "new_file",
                        label: t("policies.wizard.output.outputAs.newFile"),
                      },
                    ]}
                  />
                </FormField>
                <FormField
                  label={t("policies.wizard.output.filenameRule.label")}
                >
                  <div className="portal-policies__name-row">
                    <Select
                      inputSize="sm"
                      value={outputNamePosition}
                      onChange={(e) =>
                        setOutputNamePosition(
                          e.target.value as "prefix" | "suffix" | "auto-number",
                        )
                      }
                      options={[
                        {
                          value: "prefix",
                          label: t(
                            "policies.wizard.output.filenameRule.prefix",
                          ),
                        },
                        {
                          value: "suffix",
                          label: t(
                            "policies.wizard.output.filenameRule.suffix",
                          ),
                        },
                        ...(outputMode === "new_file"
                          ? [
                              {
                                value: "auto-number",
                                label: t(
                                  "policies.wizard.output.filenameRule.autoNumber",
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
                          "policies.wizard.output.filenameRule.placeholder",
                        )}
                        onChange={(e) => setOutputName(e.target.value)}
                      />
                    )}
                  </div>
                </FormField>
              </>
            )}
            {/* TODO: reviewer user-picker goes here */}
            <h4 className="portal-policies__wizard-subheading">
              {t("policies.wizard.output.retries.heading")}
            </h4>
            <FormField label={t("policies.wizard.output.retries.maxLabel")}>
              <Input
                inputSize="sm"
                type="number"
                value={String(maxRetries)}
                onChange={(e) =>
                  setMaxRetries(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </FormField>
            <FormField label={t("policies.wizard.output.retries.delayLabel")}>
              <Input
                inputSize="sm"
                type="number"
                value={String(retryDelayMinutes)}
                onChange={(e) =>
                  setRetryDelayMinutes(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </FormField>
          </div>
        </div>
      )}
    </Modal>
  );
}
