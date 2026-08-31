import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CheckIcon from "@mui/icons-material/Check";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
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
import { resolveRunOn } from "@app/policies/runOn";
import { useSources } from "@portal/queries/sources";
import { availableOutputModes } from "@portal/components/pipelines/outputModes";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import type { WireRoutingRule, WireTriggerConfig } from "@app/policies/types";
import { fetchIntegrations } from "@portal/api/integrations";
import { errorMessage } from "@portal/api/http";
import { useAsync } from "@portal/hooks/useAsync";
import { PolicyFieldRow } from "@portal/components/policies/PolicyFieldRow";
import { PolicyCategoryBadge } from "@portal/components/policies/PolicyCategoryIcon";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import { PolicyPurviewConfig } from "@portal/components/policies/PolicyPurviewConfig";
import { PolicyExternalApiConfig } from "@portal/components/policies/PolicyExternalApiConfig";
import { RoutingRules } from "@portal/components/policies/RoutingRules";
import { ClassificationLabelsSection } from "@portal/components/policies/ClassificationLabelsSection";
import "@portal/views/Policies.css";

/** Outline icon for a source tile, keyed by the backend source `type`. */
function sourceIcon(type: string): ReactNode {
  const sx = { fontSize: "1.1rem" } as const;
  switch (type) {
    case "editor":
      return <EditOutlinedIcon sx={sx} />;
    case "folder":
      return <FolderOutlinedIcon sx={sx} />;
    case "s3":
      return <CloudOutlinedIcon sx={sx} />;
    default:
      return <StorageOutlinedIcon sx={sx} />;
  }
}

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
// Steps that cannot work until someone configures them, so they start off rather than failing
// every run of a freshly created policy. Purview needs a tenant connection and a label GUID.
const DISABLED_BY_DEFAULT = new Set<PolicyToolId>([
  "watermark",
  "purviewApplyLabel",
  "purviewReadLabel",
  "externalApiCall",
]);

// Steps that cannot work without a Purview tenant connection, so they are hidden entirely until one
// is configured rather than offered as an option that can only fail.
const PURVIEW_TOOLS = new Set<PolicyToolId>([
  "purviewApplyLabel",
  "purviewReadLabel",
]);

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
  classify: {
    labelKey: "portal.policies.wizard.capability.classify.label",
    labelEn: "Classify the document",
    descKey: "portal.policies.wizard.capability.classify.desc",
    descEn:
      "Identifies the document's type from your team's labels and tags it, so it files and searches by category.",
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

// Trigger from the bound source's type: folders are watched, webhooks fire on
// push, the rest sweep hourly; editor-only stays null (the frontend runs those).
function deriveTrigger(sourceType?: string): WireTriggerConfig | null {
  if (!sourceType || sourceType === "editor") return null;
  if (sourceType === "folder") return { type: "folder-watch", options: {} };
  if (sourceType === "webhook") return { type: "webhook", options: {} };
  return {
    type: "schedule",
    options: { schedule: { type: "every", count: 1, unit: "HOURS" } },
  };
}

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
  const isClassification = category.id === "classification";
  const isRouting = category.id === "routing";

  const [tools, setTools] = useState<ToolState[]>(() => {
    const seeded = seedTools(entry);
    // Classification's single tool has no toggle in the workflow step, so keep it
    // enabled unconditionally — otherwise editing a policy whose saved steps
    // somehow lack it would strand submit with no way to re-enable it.
    return isClassification
      ? seeded.map((t) => ({ ...t, enabled: true }))
      : seeded;
  });
  // Open on the tab that matters: when no action starts enabled (routing's
  // source-to-destination flow), the Settings tab IS the setup.
  const [step, setStep] = useState<Step>(() =>
    isClassification || tools.some((tl) => tl.enabled)
      ? "workflow"
      : "settings",
  );
  const [fieldValues, setFieldValues] = useState(() =>
    resolveFieldValues(entry),
  );
  // Real sources only (editor participation is its own flag), capped to the one
  // input the backend binds - trimming a wider legacy record on edit so it can't
  // re-save a body the backend rejects.
  const [sources, setSources] = useState<string[]>(() =>
    (policy?.state.sources ?? []).filter((s) => s !== "editor").slice(0, 1),
  );
  // One destination too: the backend caps outputs at one (PolicyValidator).
  const [outputIds, setOutputIds] = useState<string[]>(() =>
    (policy?.state.outputIds ?? []).slice(0, 1),
  );
  // Per-document routing rules (routing category only): label(s) -> destination, first match wins.
  const [routingRules, setRoutingRules] = useState<WireRoutingRule[]>(
    () => policy?.state.routingRules ?? [],
  );
  const navigate = useNavigate();
  // Whether the policy runs in the editor. Defaults on for a new policy (the common case);
  // on edit it comes straight from the stored flag, never re-derived from the sources list.
  const [runsOnEditor, setRunsOnEditor] = useState<boolean>(
    policy?.state.runsOnEditor ?? true,
  );

  const sourcesAsync = useSources();
  const availableSources = useMemo(() => {
    const backendSources = (sourcesAsync.data?.sources ?? []).filter(
      (s) => s.status !== "disabled",
    );
    // The editor is always an available source. The backend now returns it as a
    // virtual source too, so take that when present (avoids a duplicate tile) and
    // otherwise fall back to a synthetic one; keep it first, selected by default.
    const editorSource = backendSources.find((s) => s.id === "editor") ?? {
      id: "editor",
      name: t("portal.sources.types.editor.label"),
      type: "editor",
      status: "active" as const,
      referenceCount: 0,
      referencingPolicies: [],
      config: [],
      docsTotal: null,
    };
    return [editorSource, ...backendSources.filter((s) => s.id !== "editor")];
  }, [sourcesAsync.data, t]);
  // Real (non-editor) sources drive the empty-state prompt and trigger choice.
  const backendSources = useMemo(
    () => availableSources.filter((s) => s.type !== "editor"),
    [availableSources],
  );
  // Destinations are sources used as write targets: only writable types.
  const writableSources = useMemo(
    () =>
      backendSources.filter((s) =>
        (availableOutputModes() as string[]).includes(s.type),
      ),
    [backendSources],
  );
  // The one bound source, if any: it decides the trigger the policy is saved with.
  const selectedBackendSource = useMemo(
    () => backendSources.find((s) => sources.includes(s.id)),
    [backendSources, sources],
  );
  const sourcesPath = `${toPortalPath(VIEW_PATHS.sources)}/new`;
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
  const [runOn, setRunOn] = useState<"upload" | "export">(() =>
    resolveRunOn(policy?.state.runOn, category.id),
  );
  // Policies run once; retry config has no UI. Preserve any saved values on
  // edit and default new policies to no retries (run once).
  const [maxRetries] = useState(policy?.state.maxRetries ?? 0);
  const [retryDelayMinutes] = useState(policy?.state.retryDelayMinutes ?? 0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const integrationsAsync = useAsync(() => fetchIntegrations(), []);
  const hasPurviewConnection = useMemo(
    () =>
      (integrationsAsync.data ?? []).some(
        (c) => c.integrationType === "PURVIEW",
      ),
    [integrationsAsync.data],
  );

  // Purview steps only appear once a tenant is connected. An already-enabled one (a saved policy,
  // or a tenant connected earlier) stays visible so editing a policy never silently drops it.
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
    // The editor is not a real source: its tile toggles the runsOnEditor flag instead of
    // adding "editor" to the sources list.
    if (id === "editor") {
      setRunsOnEditor((on) => !on);
      return;
    }
    // The backend binds at most one real source, so picking one replaces
    // whichever was picked before (single-select).
    setSources((prev) => (prev.includes(id) ? [] : [id]));
  }

  // One destination too: the backend caps outputs at one (PolicyValidator).
  function toggleDestination(id: string) {
    setOutputIds((prev) => (prev.includes(id) ? [] : [id]));
  }

  async function submit() {
    if (submitting) return;
    // A policy must do SOMETHING: run at least one action, or route documents
    // to at least one destination (a zero-step policy is a pure move).
    if (enabledTools.length === 0 && outputIds.length === 0) {
      setError(t("portal.policies.wizard.errors.noTools"));
      setStep("workflow");
      return;
    }
    // The backend rejects a delivery step with no account anyway; catching it
    // here points at the workflow step instead of a save-time error banner.
    const unconfiguredDelivery = enabledTools.some(
      (tl) =>
        tl.toolId === "externalApiCall" &&
        (tl.params.operationId === "" || tl.params.connectionId === ""),
    );
    if (unconfiguredDelivery) {
      setError(t("portal.policies.wizard.errors.deliveryUnconfigured"));
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
        runsOnEditor,
        scopeTypes,
        reviewerEmail,
        outputMode,
        outputName: outputName.trim(),
        outputNamePosition,
        runOn,
        maxRetries,
        retryDelayMinutes,
        steps,
        trigger: deriveTrigger(selectedBackendSource?.type),
        outputIds,
        // Only the routing category authors rules; other categories deliver to all.
        routingRules: isRouting ? routingRules : [],
      });
    } catch (e) {
      setSubmitting(false);
      // Surface the backend's actual reason (e.g. a step missing its account) rather than a
      // generic failure the operator cannot act on.
      setError(
        errorMessage(e) || t("portal.policies.wizard.errors.saveFailed"),
      );
    }
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
        onChange={(k) => setStep(k)}
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

      {step === "workflow" && isClassification && (
        <div className="portal-policies__wizard-section">
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.classification.description",
              "Every uploaded document is classified against the built-in labels and tagged with the types that fit. The label set is shared across your whole team.",
            )}
          </p>
          <h3 className="portal-policies__wizard-heading">
            {t(
              "portal.policies.wizard.classification.labelsHeading",
              "Classification labels",
            )}
          </h3>
          <ClassificationLabelsSection />
        </div>
      )}

      {step === "workflow" && !isClassification && (
        <div className="portal-policies__wizard-section">
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.workflow.description",
              "Choose what this policy does to every document it processes.",
            )}
          </p>
          <Card padding="none">
            <div className="portal-policies__capabilities">
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
                        {tl.toolId === "purviewApplyLabel" && (
                          <PolicyPurviewConfig
                            parameters={tl.params}
                            onChange={(params) =>
                              setToolParams("purviewApplyLabel", params)
                            }
                          />
                        )}
                        {tl.toolId === "externalApiCall" && (
                          <PolicyExternalApiConfig
                            parameters={tl.params}
                            onChange={(params) =>
                              setToolParams("externalApiCall", params)
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
            // The backend always returns the editor as a virtual source, so the
            // loaded list is never empty - no "no sources" state exists.
            <div className="portal-policies__sources">
              {availableSources.map((src) => {
                const on =
                  src.id === "editor" ? runsOnEditor : sources.includes(src.id);
                return (
                  <Button
                    key={src.id}
                    variant={on ? "secondary" : "quiet"}
                    justify="between"
                    fullWidth
                    className={
                      "portal-policies__source" +
                      (on ? " portal-policies__source--on" : "")
                    }
                    // The check keeps its slot when unselected (hidden) so the
                    // icon + name stay put whether or not the tile is selected.
                    rightSection={
                      <CheckIcon
                        sx={{
                          fontSize: "1.1rem",
                          visibility: on ? "visible" : "hidden",
                        }}
                      />
                    }
                    onClick={() => toggleSource(src.id)}
                    aria-pressed={on}
                  >
                    <span className="portal-policies__source-label">
                      {sourceIcon(src.type)}
                      {src.name}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
          {!sourcesAsync.loading && backendSources.length === 0 && (
            <Banner
              tone="info"
              description={t(
                "portal.policies.wizard.sources.emptyPrompt",
                "No sources connected yet - the policy still covers editor uploads. Connect a folder, S3, SFTP or webhook source to process documents from other systems.",
              )}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    navigate(sourcesPath);
                  }}
                >
                  {t(
                    "portal.policies.wizard.sources.connect",
                    "Connect a source",
                  )}
                </Button>
              }
            />
          )}
          {selectedBackendSource && (
            <p className="portal-policies__wizard-desc">
              {t(
                "portal.policies.wizard.sources.triggerNote",
                "Folder and webhook sources run this policy automatically; other sources are checked hourly.",
              )}
            </p>
          )}

          {runsOnEditor && (
            <h3 className="portal-policies__wizard-heading">
              {t("portal.policies.wizard.output.heading")}
            </h3>
          )}
          <div className="portal-policies__fields">
            {runsOnEditor && (
              <>
                <FormField
                  label={t("portal.policies.wizard.output.runOn.label")}
                  helperText={t("portal.policies.wizard.output.runOn.helper")}
                >
                  <Select
                    inputSize="sm"
                    value={runOn}
                    onChange={(value) =>
                      setRunOn(resolveRunOn(value, category.id))
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

          {isRouting && (
            <RoutingRules
              rules={routingRules}
              onChange={setRoutingRules}
              destinations={writableSources.map((s) => ({
                id: s.id,
                name: s.name,
              }))}
              onCreateDestination={() => {
                onClose();
                navigate(sourcesPath);
              }}
            />
          )}

          <h3 className="portal-policies__wizard-heading">
            {isRouting
              ? t(
                  "portal.policies.wizard.destinations.fallbackHeading",
                  "Default destination",
                )
              : t(
                  "portal.policies.wizard.destinations.heading",
                  "Deliver output to",
                )}
          </h3>
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.destinations.description",
              "Results always stay in Stirling. Pick one destination to also receive a copy of every processed document.",
            )}
          </p>
          {writableSources.length === 0 ? (
            <Banner
              tone="info"
              description={t(
                "portal.policies.wizard.destinations.emptyPrompt",
                "No writable destinations yet. Connect a folder or S3 source to deliver processed documents outside Stirling.",
              )}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    navigate(sourcesPath);
                  }}
                >
                  {t(
                    "portal.policies.wizard.sources.connect",
                    "Connect a source",
                  )}
                </Button>
              }
            />
          ) : (
            <div className="portal-policies__sources">
              {writableSources.map((dest) => {
                const on = outputIds.includes(dest.id);
                return (
                  <Button
                    key={dest.id}
                    variant={on ? "secondary" : "quiet"}
                    justify="between"
                    fullWidth
                    className={
                      "portal-policies__source" +
                      (on ? " portal-policies__source--on" : "")
                    }
                    rightSection={
                      <CheckIcon
                        sx={{
                          fontSize: "1.1rem",
                          visibility: on ? "visible" : "hidden",
                        }}
                      />
                    }
                    onClick={() => toggleDestination(dest.id)}
                    aria-pressed={on}
                  >
                    <span className="portal-policies__source-label">
                      {sourceIcon(dest.type)}
                      {dest.name}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
