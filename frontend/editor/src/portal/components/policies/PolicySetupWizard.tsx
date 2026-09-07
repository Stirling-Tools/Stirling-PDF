import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Banner, Button, Card, Modal, ToggleSwitch } from "@app/ui";
import { SettingsRow } from "@app/ui/SettingsRow";
import { EnforceAsPolicyControl } from "@portal/components/pipelines/EnforceAsPolicyControl";
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
import { fetchIntegrations } from "@portal/api/integrations";
import { errorMessage } from "@portal/api/http";
import { useAsync } from "@portal/hooks/useAsync";
import { PolicyCategoryBadge } from "@portal/components/policies/PolicyCategoryIcon";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import { PolicyPurviewConfig } from "@portal/components/policies/PolicyPurviewConfig";
import { ClassificationLabelsSection } from "@portal/components/policies/ClassificationLabelsSection";
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
  /**
   * Fires when the user asks to Customise: hands the current (unsaved) settings to the full pipeline
   * builder, which takes over editing. The builder can express anything the simple wizard can't, so
   * this is a one-way step unless the pipeline stays simple-representable.
   */
  onCustomise: (entry: CatalogueEntry, result: PolicySetupResult) => void;
}

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
      "Finds and blacks out sensitive details - like Social Security and card numbers - so they can't be read.",
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
  onCustomise,
}: PolicySetupWizardProps) {
  // Re-key the wizard on the opened category so all state resets cleanly when a
  // different category is opened (avoids stale field values bleeding across).
  return entry ? (
    <PolicySetupWizardBody
      key={entry.category.id}
      entry={entry}
      onClose={onClose}
      onSubmit={onSubmit}
      onCustomise={onCustomise}
    />
  ) : null;
}

function PolicySetupWizardBody({
  entry,
  onClose,
  onSubmit,
  onCustomise,
}: {
  entry: CatalogueEntry;
  onClose: () => void;
  onSubmit: (entry: CatalogueEntry, result: PolicySetupResult) => Promise<void>;
  onCustomise: (entry: CatalogueEntry, result: PolicySetupResult) => void;
}) {
  const { t } = useTranslation();

  const { category, config, policy } = entry;
  const isEdit = policy != null;
  const isClassification = category.id === "classification";

  const [tools, setTools] = useState<ToolState[]>(() => {
    const seeded = seedTools(entry);
    // Classification's single tool has no toggle in the workflow step, so keep it
    // enabled unconditionally — otherwise editing a policy whose saved steps
    // somehow lack it would strand submit with no way to re-enable it.
    return isClassification
      ? seeded.map((t) => ({ ...t, enabled: true }))
      : seeded;
  });
  // No UI for any of these: each carries the stored value through on edit, and a sensible default for
  // a new policy - runOn per category (security enforces on export), the rest run-once/new-version.
  const [fieldValues] = useState(() => resolveFieldValues(entry));
  const [scopeTypes] = useState<string[]>(policy?.state.scopeTypes ?? []);
  const [reviewerEmail] = useState(policy?.state.reviewerEmail ?? "");
  const [outputMode] = useState<"new_file" | "new_version">(
    policy?.state.outputMode ?? "new_version",
  );
  const [outputName] = useState(policy?.state.outputName ?? "");
  const [outputNamePosition] = useState<"prefix" | "suffix" | "auto-number">(
    policy?.state.outputNamePosition ?? "suffix",
  );
  const [runOn] = useState<"upload" | "export">(() =>
    resolveRunOn(policy?.state.runOn, category.id),
  );
  const [maxRetries] = useState(policy?.state.maxRetries ?? 0);
  const [retryDelayMinutes] = useState(policy?.state.retryDelayMinutes ?? 0);
  // A suggested policy is something the org requires by nature, so new ones default to required;
  // editing preserves whatever was saved.
  const [required, setRequired] = useState(policy?.state.required ?? true);

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

  /** The wizard's current state as a submit result: shared by Save and Customise. */
  function collectResult(): PolicySetupResult {
    const steps: PipelineStep[] = enabledTools.map((tl) =>
      policyStepToWire(tl),
    );
    return {
      required,
      // Preserve any stored options this wizard has no UI for (a customised policy's sources, an
      // editor-authored automation blob) rather than wiping them on save; the builder is where
      // those are actually edited.
      extraOptions: policy?.state.extraOptions,
      runsOnEditor: true,
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
    };
  }

  // Hand the current settings to the full builder. No "needs at least one tool" guard here: the
  // builder has its own, and the point of customising is to keep shaping the chain.
  function customise() {
    onCustomise(entry, collectResult());
  }

  async function submit() {
    if (submitting) return;
    if (enabledTools.length === 0) {
      setError(t("portal.policies.wizard.errors.noTools"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(entry, collectResult());
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
          <Button
            variant="tertiary"
            size="sm"
            onClick={customise}
            leftSection={<TuneRoundedIcon style={{ fontSize: "1.05rem" }} />}
          >
            {t("portal.policies.wizard.actions.customise")}
          </Button>
          <Button
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={submit}
            loading={submitting}
          >
            {isEdit
              ? t("portal.policies.wizard.actions.saveChanges")
              : t("portal.policies.wizard.actions.enablePolicy")}
          </Button>
        </div>
      }
    >
      {error && (
        <Banner
          tone="danger"
          description={error}
          className="portal-policies__wizard-banner"
        />
      )}

      {isClassification && (
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

      {!isClassification && (
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div className="portal-policies__wizard-enforce">
        <EnforceAsPolicyControl
          required={required}
          onRequiredChange={setRequired}
        />
      </div>
    </Modal>
  );
}
