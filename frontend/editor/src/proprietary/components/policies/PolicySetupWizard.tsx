import { isConditionComplete } from "@app/conditions/validation";
import {
  classificationCondition,
  documentFieldCondition,
  requiresClassification,
} from "@app/data/classificationConditions";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Banner, Button, Card, Modal, ToggleSwitch } from "@app/ui";
import { SettingsRow } from "@app/ui/SettingsRow";
import { EnforceAsPolicyControl } from "@app/components/policies/EnforceAsPolicyControl";
import {
  humanizeEndpoint,
  type CatalogueEntry,
  type PipelineStep,
  type PolicySetupResult,
} from "@app/policies/catalog";
import {
  policyEndpoint,
  policyStepFromWire,
  policyStepToWire,
  type PolicyParams,
  type PolicyToolId,
  type PolicyToolStep,
} from "@app/policies/operations";
import { resolveRunOn } from "@app/policies/runOn";
import type { WireRoutingRule, WireTriggerConfig } from "@app/policies/types";
import { PolicyCategoryBadge } from "@app/components/policies/PolicyCategoryBadge";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import { PolicyPdfaConfig } from "@app/components/policies/PolicyPdfaConfig";
import { ClassificationLabelsSection } from "@app/components/policies/ClassificationLabelsSection";
import { useAiClassificationEnabled } from "@app/hooks/useAiClassificationEnabled";
import "@app/components/policies/PolicySetupWizard.css";

/** What a host frame needs to wrap the form: the middle content plus submit state. */
export interface PolicySetupFrame {
  content: ReactNode;
  /** Current enabled steps, in execution order, for a host's review screen. */
  steps: PipelineStep[];
  submit: () => void;
  submitting: boolean;
  error: string | null;
  /** Routing requires complete rules and a fallback; other presets need an enabled step. */
  canSubmit: boolean;
}

/** Additional settings share the wizard's draft and participate in its save validation. */
export interface PolicySetupConfigProps {
  result: PolicySetupResult;
  onChange: (patch: Partial<PolicySetupResult>) => void;
  onValidityChange: (valid: boolean) => void;
}

/** What the routing category binds: where documents come from, where each type goes. */
export interface RoutingSetup {
  sourceId: string;
  trigger: WireTriggerConfig | null;
  outputIds: string[];
  routingRules: WireRoutingRule[];
}

interface PolicySetupWizardProps {
  /** The category being configured, or null when closed. */
  entry: CatalogueEntry | null;
  onClose: () => void;
  /** Fires on submit with settings + built steps; a rejection re-enables submit and
   *  surfaces the failure. */
  onSubmit: (entry: CatalogueEntry, result: PolicySetupResult) => Promise<void>;
  /** Fires when the user asks to Customise: hands the unsaved settings to the full builder.
   *  Surfaces without a builder omit it and the button hides. */
  onCustomise?: (entry: CatalogueEntry, result: PolicySetupResult) => void;
  /** Whether a Purview tenant is connected; gates the Purview-backed steps. */
  hasPurviewConnection?: boolean;
  setupConfig?: (props: PolicySetupConfigProps) => ReactNode;
  /**
   * Renders the routing category's source, routes and fallback destination. Folder hosts supply
   * their own input selection and render only the destinations here.
   */
  routingConfig?: (props: {
    value: RoutingSetup;
    onChange: (next: RoutingSetup) => void;
  }) => ReactNode;
  /** Renders the Purview step's inline config. Portal-only; without it the step shows bare. */
  purviewConfig?: (props: {
    parameters: PolicyParams<"purviewApplyLabel">;
    onChange: (params: PolicyParams<"purviewApplyLabel">) => void;
  }) => ReactNode;
  /** Turns a submit failure into user-facing copy; defaults to the error's own message. */
  formatError?: (e: unknown) => string;
  /** Whether the org-enforcement choice applies on this surface (it doesn't for folders). */
  enforceControl?: boolean;
  /** Folder setup shows an ordered chain with expandable per-step settings. */
  folderSetup?: boolean;
  /** False locks saving and the enforce toggle. Defaults true: only the portal gates on the role. */
  canManagePolicies?: boolean;
  /** The role check is still in flight, so the manager-only tooltip is withheld. */
  permissionsLoading?: boolean;
  /** Frame the form yourself: receives the middle content and submit state, returns the
   *  chrome. Without it the portal's own modal renders. */
  children?: (frame: PolicySetupFrame) => ReactNode;
}

type ToolState = PolicyToolStep & { enabled: boolean };

function StepSettings({
  collapsible,
  label,
  children,
}: {
  collapsible: boolean;
  label: string;
  children: ReactNode;
}) {
  return collapsible ? (
    <details className="portal-policies__capability-config">
      <summary>{label}</summary>
      {children}
    </details>
  ) : (
    <div className="portal-policies__capability-config">{children}</div>
  );
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

/** Seed the workflow's tools: a configured policy's saved steps win (editing round-trips),
 *  else the category preset's default chain. */
// Temporary until the catalogue carries a defaultEnabled flag: steps that cannot work
// unconfigured start off. Purview needs a tenant connection and a label GUID.
const DISABLED_BY_DEFAULT = new Set<PolicyToolId>([
  "watermark",
  "purviewApplyLabel",
  "purviewReadLabel",
  "externalApiCall",
]);

// Hidden without a Purview tenant connection; offered, they could only fail.
const PURVIEW_TOOLS = new Set<PolicyToolId>([
  "purviewApplyLabel",
  "purviewReadLabel",
]);

/**
 * Policy-facing framing per capability: labels describe what the policy DOES to a document,
 * not the underlying tool. Endpoints with no entry fall back to the humanised endpoint name.
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

  timestampPdf: {
    labelKey: "portal.policies.wizard.capability.timestampPdf.label",
    labelEn: "Add a trusted timestamp",
    descKey: "portal.policies.wizard.capability.timestampPdf.desc",
    descEn:
      "Proves the document existed in this exact form at a point in time, using an independent timestamp authority. Only a hash is sent - the document never leaves your server.",
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
  pdfa: {
    labelKey: "portal.policies.wizard.capability.pdfa.label",
    labelEn: "Convert to PDF/A for archiving",
    descKey: "portal.policies.wizard.capability.pdfa.desc",
    descEn:
      "Rewrites the document in the ISO archival format, embedding its fonts and colour profiles so it still renders the same years from now. Invalidates digital signatures.",
  },
  complianceCheck: {
    labelKey: "portal.policies.wizard.capability.complianceCheck.label",
    labelEn: "Check the document meets the standard",
    descKey: "portal.policies.wizard.capability.complianceCheck.desc",
    descEn:
      "Validates the finished document against PDF/A and stops the run if it does not hold up.",
  },
  classify: {
    labelKey: "portal.policies.wizard.capability.classify.label",
    labelEn: "Classify the document",
    descKey: "portal.policies.wizard.capability.classify.desc",
    descEn:
      "Identifies the document's type from your team's labels and tags it, so it files and searches by category.",
  },
  ragIngest: {
    labelKey: "portal.policies.wizard.capability.ragIngest.label",
    labelEn: "Prepare for knowledge search",
    descKey: "portal.policies.wizard.capability.ragIngest.desc",
    descEn:
      "Prepare searchable chunks for the built-in knowledge base, a connected RAG database, or a corpus export.",
  },
  purviewApplyLabel: {
    labelKey: "portal.policies.wizard.capability.purviewApplyLabel.label",
    labelEn: "Apply a Microsoft Purview sensitivity label",
    descKey: "portal.policies.wizard.capability.purviewApplyLabel.desc",
    descEn:
      "Marks the document with one of your organisation's Purview labels, so Purview-aware tools recognise how sensitive it is.",
  },
  purviewReadLabel: {
    labelKey: "portal.policies.wizard.capability.purviewReadLabel.label",
    labelEn: "Read the document's Purview label",
    descKey: "portal.policies.wizard.capability.purviewReadLabel.desc",
    descEn:
      "Reports the Purview label a document already carries, so the rest of the policy can act on how sensitive it is.",
  },
  externalApiCall: {
    labelKey: "portal.policies.wizard.capability.externalApiCall.label",
    labelEn: "Send the document to another system",
    descKey: "portal.policies.wizard.capability.externalApiCall.desc",
    descEn:
      "Hands the document to a system you have connected, and records what it answered.",
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

interface PolicySetupState {
  categoryId: string;
  policyId: string | undefined;
  routing: RoutingSetup;
  tools: ToolState[];
  required: boolean;
  /** The host panel's half of the draft, and whether that panel accepts it. */
  settings: Partial<PolicySetupResult>;
  settingsValid: boolean;
  submitting: boolean;
  error: string | null;
}

function initialWizardState(
  entry: CatalogueEntry,
  aiClassificationEnabled: boolean,
  hasSetupConfig: boolean,
): PolicySetupState {
  const { category, config, policy } = entry;
  const seeded = seedTools(entry);
  return {
    categoryId: category.id,
    policyId: policy?.state.backendId,
    routing: {
      sourceId: policy?.state.sources?.[0] ?? "",
      trigger: policy?.state.trigger ?? null,
      outputIds: (policy?.state.outputIds ?? []).slice(0, 1),
      // A blank route lets the form and the submitted rules share the same initial state.
      routingRules: policy?.state.routingRules ?? [
        {
          condition: aiClassificationEnabled
            ? classificationCondition()
            : documentFieldCondition("document.extension"),
          outputId: "",
        },
      ],
    },
    // Classification has no toggle, so its only tool must remain enabled.
    tools:
      category.id === "classification"
        ? seeded.map((tool) => ({ ...tool, enabled: true }))
        : seeded,
    required: policy?.state.required ?? category.id !== "classification",
    settings: {
      inputs: policy?.state.inputs ?? [],
      outputIds: policy?.state.outputIds ?? [],
      runsOnEditor: policy?.state.runsOnEditor ?? !config.needsSource,
    },
    settingsValid: !hasSetupConfig,
    submitting: false,
    error: null,
  };
}

/**
 * The "set up a policy" flow: a Workflow step (toggle which tools run) and a Settings step.
 * Submitting builds the pipeline steps and persists via the real POST.
 */
export function PolicySetupWizard({
  entry,
  onClose,
  onSubmit,
  onCustomise,
  hasPurviewConnection,
  setupConfig,
  purviewConfig,
  routingConfig,
  formatError,
  enforceControl,
  folderSetup,
  canManagePolicies,
  permissionsLoading,
  children,
}: PolicySetupWizardProps) {
  return entry ? (
    <PolicySetupWizardBody
      entry={entry}
      onClose={onClose}
      onSubmit={onSubmit}
      onCustomise={onCustomise}
      setupConfig={setupConfig}
      hasPurviewConnection={hasPurviewConnection}
      purviewConfig={purviewConfig}
      routingConfig={routingConfig}
      formatError={formatError}
      enforceControl={enforceControl}
      folderSetup={folderSetup}
      canManagePolicies={canManagePolicies}
      permissionsLoading={permissionsLoading}
    >
      {children}
    </PolicySetupWizardBody>
  ) : null;
}

function PolicySetupWizardBody({
  entry,
  onClose,
  onSubmit,
  onCustomise,
  hasPurviewConnection = false,
  setupConfig,
  purviewConfig,
  routingConfig,
  formatError,
  enforceControl = true,
  folderSetup = false,
  canManagePolicies = true,
  permissionsLoading = false,
  children,
}: {
  entry: CatalogueEntry;
  onClose: () => void;
  onSubmit: (entry: CatalogueEntry, result: PolicySetupResult) => Promise<void>;
  onCustomise?: (entry: CatalogueEntry, result: PolicySetupResult) => void;
  hasPurviewConnection?: boolean;
  setupConfig?: (props: PolicySetupConfigProps) => ReactNode;
  purviewConfig?: (props: {
    parameters: PolicyParams<"purviewApplyLabel">;
    onChange: (params: PolicyParams<"purviewApplyLabel">) => void;
  }) => ReactNode;
  routingConfig?: (props: {
    value: RoutingSetup;
    onChange: (next: RoutingSetup) => void;
  }) => ReactNode;
  formatError?: (e: unknown) => string;
  enforceControl?: boolean;
  folderSetup?: boolean;
  canManagePolicies?: boolean;
  permissionsLoading?: boolean;
  children?: (frame: PolicySetupFrame) => ReactNode;
}) {
  const { t } = useTranslation();
  const aiClassificationEnabled = useAiClassificationEnabled();

  const { category, config, policy } = entry;
  const isEdit = policy != null;
  const isClassification = category.id === "classification";
  const isRouting = category.id === "routing";
  const [form, setForm] = useState(() =>
    initialWizardState(entry, aiClassificationEnabled, Boolean(setupConfig)),
  );
  const {
    routing,
    tools,
    required,
    settings,
    settingsValid,
    submitting,
    error,
  } = form;
  // Reset before rendering the new preset, preserving the modal and its focus trap.
  if (
    form.categoryId !== category.id ||
    form.policyId !== policy?.state.backendId
  ) {
    setForm(
      initialWizardState(entry, aiClassificationEnabled, Boolean(setupConfig)),
    );
  }
  const fieldValues = resolveFieldValues(entry);
  const scopeTypes = policy?.state.scopeTypes ?? [];
  const reviewerEmail = policy?.state.reviewerEmail ?? "";
  const outputMode = policy?.state.outputMode ?? "new_version";
  const outputName = policy?.state.outputName ?? "";
  const outputNamePosition = policy?.state.outputNamePosition ?? "suffix";
  const runOn = resolveRunOn(policy?.state.runOn, category.id);
  const maxRetries = policy?.state.maxRetries ?? 0;
  const retryDelayMinutes = policy?.state.retryDelayMinutes ?? 0;
  const readOnly = !canManagePolicies;

  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  // Stable identity: the host panel reports validity from an effect, which would
  // otherwise re-run every render.
  const setSettingsValid = useCallback(
    (valid: boolean) =>
      setForm((current) =>
        current.settingsValid === valid
          ? current
          : { ...current, settingsValid: valid },
      ),
    [],
  );

  // Purview steps appear once a tenant is connected; an already-enabled one stays visible
  // so editing never silently drops it.
  const visibleTools = useMemo(
    () =>
      tools.filter(
        (tl) =>
          !PURVIEW_TOOLS.has(tl.toolId) || hasPurviewConnection || tl.enabled,
      ),
    [tools, hasPurviewConnection],
  );

  // Derive from the visible list: a hidden step is never submitted (hidden implies disabled).
  const enabledTools = useMemo(
    () => visibleTools.filter((tl) => tl.enabled),
    [visibleTools],
  );

  function setToolEnabled(toolId: PolicyToolId, enabled: boolean) {
    setForm((current) => ({
      ...current,
      tools: current.tools.map((tool) =>
        tool.toolId === toolId ? { ...tool, enabled } : tool,
      ),
    }));
  }

  function setToolParams<Id extends PolicyToolId>(
    toolId: Id,
    params: PolicyParams<Id>,
  ) {
    setForm((current) => ({
      ...current,
      tools: current.tools.map((tool) =>
        tool.toolId === toolId ? ({ ...tool, params } as ToolState) : tool,
      ),
    }));
  }

  /** The wizard's current state as a submit result: shared by Save and Customise. */
  function collectResult(): PolicySetupResult {
    const routingNeedsClassification = routing.routingRules.some((rule) =>
      requiresClassification(rule.condition),
    );
    const selectedTools = isRouting
      ? routingNeedsClassification
        ? tools.filter((tool) => tool.toolId === "classify")
        : []
      : enabledTools;
    const steps: PipelineStep[] = selectedTools.map((tool) => {
      const step = policyStepToWire(tool);
      const saved = policy?.steps.find(
        (original) => original.operation === step.operation,
      );
      return {
        ...saved,
        ...step,
        parameters: { ...saved?.parameters, ...step.parameters },
      };
    });
    return {
      required:
        (settings.runsOnEditor ?? true) &&
        !settings.outputIds?.length &&
        required,
      outputIds: policy?.state.outputIds,
      routingRules: policy?.state.routingRules,
      // Preserve stored options this wizard has no UI for rather than wiping them on save;
      // the builder is where those are edited.
      extraOptions: policy?.state.extraOptions,
      fieldValues,
      sources: policy?.state.sources ?? [],
      scopeTypes,
      reviewerEmail,
      outputMode,
      outputName: outputName.trim(),
      outputNamePosition,
      runOn,
      maxRetries,
      retryDelayMinutes,
      steps,
      ...settings,
      ...(isRouting
        ? {
            sources: routing.sourceId ? [routing.sourceId] : [],
            trigger: routing.trigger,
            outputIds: routing.outputIds,
            routingRules: routing.routingRules,
          }
        : {}),
      runsOnEditor: isRouting ? false : (settings.runsOnEditor ?? true),
    };
  }

  // No "needs at least one tool" guard here: the builder has its own.
  function customise() {
    onCustomise?.(entry, collectResult());
  }

  async function submit() {
    if (submitting || readOnly || !settingsValid || !routingComplete) return;
    if (!isRouting && enabledTools.length === 0) {
      setForm((current) => ({
        ...current,
        error: t("portal.policies.wizard.errors.noTools"),
      }));
      return;
    }
    setForm((current) => ({ ...current, error: null, submitting: true }));
    try {
      await onSubmit(entry, collectResult());
    } catch (e) {
      // Surface the backend's actual reason rather than a generic failure.
      const message = formatError?.(e) ?? (e instanceof Error ? e.message : "");
      setForm((current) => ({
        ...current,
        submitting: false,
        error: message || t("portal.policies.wizard.errors.saveFailed"),
      }));
    }
  }

  const routingNeedsClassification = routing.routingRules.some((rule) =>
    requiresClassification(rule.condition),
  );
  const routingComplete =
    !isRouting ||
    Boolean(
      (folderSetup || routing.sourceId) &&
      routing.outputIds.length === 1 &&
      routing.outputIds[0] &&
      routing.routingRules.length > 0 &&
      routing.routingRules.every(
        (rule) => rule.outputId && isConditionComplete(rule.condition),
      ) &&
      (!routingNeedsClassification || aiClassificationEnabled),
    );
  const canSubmit =
    (isRouting ? routingComplete : enabledTools.length > 0) &&
    settingsValid &&
    !readOnly;
  function updateSettings(patch: Partial<PolicySetupResult>) {
    const { steps, ...rest } = patch;
    const parsed = steps
      ?.map(policyStepFromWire)
      .filter((step) => step !== null);
    setForm((current) => ({
      ...current,
      settings: { ...current.settings, ...rest },
      tools: parsed
        ? current.tools.map((tool) => {
            const replacement = parsed.find(
              (step) => step.toolId === tool.toolId,
            );
            return replacement
              ? { ...replacement, enabled: true }
              : { ...tool, enabled: false };
          })
        : current.tools,
    }));
  }
  const content = (
    <Fragment key={`${category.id}:${policy?.state.backendId ?? "new"}`}>
      {error && !folderSetup && (
        <div ref={errorRef} role="alert" tabIndex={-1}>
          <Banner
            tone="danger"
            description={error}
            className="portal-policies__wizard-banner"
          />
        </div>
      )}

      {isClassification && (
        <div className="portal-policies__wizard-section">
          {!folderSetup && (
            <p className="portal-policies__wizard-desc">
              {t(
                "portal.policies.wizard.classification.description",
                "Every uploaded document is classified against the built-in labels and tagged with the types that fit. The label set is shared across your whole team.",
              )}
            </p>
          )}
          <h3 className="portal-policies__wizard-heading">
            {t(
              "portal.policies.wizard.classification.labelsHeading",
              "Classification labels",
            )}
          </h3>
          <ClassificationLabelsSection />
        </div>
      )}

      {isRouting &&
        routingConfig?.({
          value: routing,
          onChange: (next) =>
            setForm((current) => ({ ...current, routing: next })),
        })}

      {!isClassification && !isRouting && (
        <div className="portal-policies__wizard-section">
          {!folderSetup && (
            <p className="portal-policies__wizard-desc">
              {t("portal.policies.wizard.workflow.description")}
            </p>
          )}
          <Card padding="none">
            <div
              className={
                folderSetup
                  ? "portal-policies__capabilities folder-setup__chain"
                  : "portal-policies__capabilities"
              }
            >
              {visibleTools.map((tl) => {
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
                      description={folderSetup ? undefined : description}
                      control={
                        <ToggleSwitch
                          size="sm"
                          disabled={readOnly}
                          checked={tl.enabled}
                          onChange={(checked) =>
                            setToolEnabled(tl.toolId, checked)
                          }
                          aria-label={label}
                        />
                      }
                    />
                    {tl.enabled &&
                      (tl.toolId === "redact" ||
                        tl.toolId === "watermark" ||
                        tl.toolId === "pdfa" ||
                        tl.toolId === "purviewApplyLabel" ||
                        (folderSetup && tl.toolId === "classify")) && (
                        <StepSettings
                          collapsible={folderSetup}
                          label={t(
                            tl.toolId === "classify"
                              ? "processingFolders.setup.viewLabels"
                              : "processingFolders.setup.settings",
                          )}
                        >
                          {folderSetup && tl.toolId === "classify" && (
                            <ClassificationLabelsSection />
                          )}
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
                          {tl.toolId === "pdfa" && (
                            <PolicyPdfaConfig
                              parameters={tl.params}
                              onChange={(params) =>
                                setToolParams("pdfa", params)
                              }
                            />
                          )}
                          {tl.toolId === "purviewApplyLabel" &&
                            purviewConfig?.({
                              parameters: tl.params,
                              onChange: (params) =>
                                setToolParams("purviewApplyLabel", params),
                            })}
                        </StepSettings>
                      )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {setupConfig?.({
        result: collectResult(),
        onChange: updateSettings,
        onValidityChange: setSettingsValid,
      })}

      {enforceControl &&
        settings.runsOnEditor !== false &&
        !settings.outputIds?.length && (
          <div className="portal-policies__wizard-enforce">
            <EnforceAsPolicyControl
              required={required}
              onRequiredChange={(next) =>
                setForm((current) => ({ ...current, required: next }))
              }
              disabled={readOnly}
              permissionsLoading={permissionsLoading}
            />
          </div>
        )}
    </Fragment>
  );
  if (children) {
    return children({
      content,
      steps: collectResult().steps,
      submit,
      submitting,
      error,
      canSubmit,
    });
  }
  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={
        <span className="portal-policies__wizard-title">
          <PolicyCategoryBadge category={category} />
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
          <Button
            variant="tertiary"
            size="sm"
            onClick={customise}
            disabled={!onCustomise}
            title={
              onCustomise
                ? undefined
                : t(
                    "portal.policies.wizard.actions.customiseUnavailable",
                    "The full builder lives on Processor",
                  )
            }
            leftSection={<TuneRoundedIcon style={{ fontSize: "1.05rem" }} />}
          >
            {t("portal.policies.wizard.actions.customise")}
          </Button>
          <Button
            size="sm"
            style={{ marginInlineStart: "auto" }}
            onClick={submit}
            loading={submitting}
            disabled={!canSubmit}
          >
            {isEdit
              ? t("portal.policies.wizard.actions.saveChanges")
              : t("portal.policies.wizard.actions.enablePolicy")}
          </Button>
        </div>
      }
    >
      {content}
    </Modal>
  );
}
