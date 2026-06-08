import { useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { ChipFlow } from "@shared/components/ChipFlow";
import { DataRow } from "@shared/components/DataRow";
import { Input } from "@shared/components/Input";
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
  PolicySetupStep,
} from "@app/types/policies";
import { PolicyFieldRow } from "@app/components/policies/PolicyFieldRow";
import { resolveFieldValues } from "@app/components/policies/policyValues";
import type { PolicyEnableInput } from "@app/hooks/usePolicies";

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
  onCancel: () => void;
  onEnable: (input: PolicyEnableInput) => void;
  onSetupClassification: () => void;
}

export function PolicySetupWizard({
  category,
  config,
  initial,
  sources: sourceDefs,
  docTypes,
  canConfigure,
  classificationEnabled,
  onCancel,
  onEnable,
  onSetupClassification,
}: PolicySetupWizardProps) {
  const [step, setStep] = useState<PolicySetupStep>(1);
  const [fieldValues, setFieldValues] = useState(() =>
    resolveFieldValues(config, initial),
  );
  const [sources, setSources] = useState<string[]>(
    initial.sources.length ? initial.sources : ["editor"],
  );
  const [scopeNarrow, setScopeNarrow] = useState(initial.scopeTypes.length > 0);
  const [scopeTypes, setScopeTypes] = useState<string[]>(initial.scopeTypes);
  const [reviewerEmail, setReviewerEmail] = useState(initial.reviewerEmail);

  if (!canConfigure) {
    return (
      <div className="pol-detail">
        <PanelHeader
          icon={category.icon}
          title={`Set up ${category.label} Policy`}
          onBack={onCancel}
        />
        <div className="pol-scroll">
          <EmptyState
            title="Managed by your organization"
            description="Contact an admin to enable this policy."
          />
        </div>
      </div>
    );
  }

  const back = () =>
    step > 1
      ? setStep((s) => Math.max(1, s - 1) as PolicySetupStep)
      : onCancel();

  const toggleSource = (id: string) =>
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        title={`Set up ${category.label} Policy`}
        subtitle={`Step ${step} of 3`}
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

      {/* Step indicator */}
      <div className="pol-steps">
        <StepIndicator total={3} current={step} />
      </div>

      {/* Step content */}
      <div className="pol-scroll">
        {step === 1 && (
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
          </>
        )}

        {step === 2 && (
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

        {step === 3 && (
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
                  {reviewerEmail || (
                    <span className="pol-muted">Not set</span>
                  )}
                </DataRow>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="pol-footer">
        <Button variant="ghost" size="sm" onClick={back}>
          {step > 1 ? "Back" : "Cancel"}
        </Button>
        {step < 3 ? (
          <Button
            variant="gradient"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={() =>
              setStep((s) => Math.min(3, s + 1) as PolicySetupStep)
            }
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="gradient"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={() =>
              onEnable({
                sources,
                scopeTypes: scopeNarrow ? scopeTypes : [],
                reviewerEmail,
                fieldValues,
              })
            }
          >
            Enable Policy
          </Button>
        )}
      </div>
    </div>
  );
}
