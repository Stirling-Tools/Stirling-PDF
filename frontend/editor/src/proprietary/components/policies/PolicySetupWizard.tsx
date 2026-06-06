import { useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { Chip } from "@shared/components/Chip";
import { Input } from "@shared/components/Input";
import { Checkbox } from "@shared/components/Checkbox";
import { Banner } from "@shared/components/Banner";
import { EmptyState } from "@shared/components/EmptyState";
import { POLICY_SOURCES, POLICY_DOC_TYPES } from "@app/data/policyDefinitions";
import type {
  PolicyCategory,
  PolicyConfigDef,
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
        {[1, 2, 3].map((s) => (
          <div key={s} className={`pol-step-bar${s <= step ? " is-on" : ""}`} />
        ))}
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
              {POLICY_SOURCES.map((src, i) => (
                <div
                  key={src.id}
                  className="pol-source"
                  data-first={i === 0 || undefined}
                >
                  <Checkbox
                    checked={sources.includes(src.id)}
                    onChange={() => toggleSource(src.id)}
                    label={
                      <span className="pol-source-lbl">
                        <span className="pol-source-icon">{src.icon}</span>
                        {src.label}
                      </span>
                    }
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
                    {POLICY_DOC_TYPES.map((dt) => (
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
              <p className="pol-info-sub">Send flagged documents to:</p>
              <Input
                type="email"
                inputSize="sm"
                aria-label="Reviewer email"
                value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                placeholder="email@company.com"
                style={{ margin: "0.4rem 0" }}
              />
              <p className="pol-info-sub">
                They'll open flagged documents directly in the Stirling editor.
              </p>
            </Card>

            <p className="pol-section-label">Summary</p>
            <Card padding="default">
              <div className="pol-summary-head">
                <span className="pol-summary-icon">{category.icon}</span>
                <span className="pol-summary-title">
                  {category.label} Policy
                </span>
              </div>
              <div className="pol-summary-row">
                <span className="pol-summary-key">Enforces</span>
                <div className="pol-rule-chips">
                  {config.rules.map((r) => (
                    <Chip key={r} tone="neutral" size="sm">
                      {r}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="pol-summary-row">
                <span className="pol-summary-key">Sources</span>
                <span>{sources.length} selected</span>
              </div>
              <div className="pol-summary-row">
                <span className="pol-summary-key">Reviewer</span>
                <span className="pol-summary-val">{reviewerEmail}</span>
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
