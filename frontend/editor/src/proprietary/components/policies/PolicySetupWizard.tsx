import { useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckIcon from "@mui/icons-material/Check";
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
        <div className="pol-header">
          <button className="pol-icon-btn" onClick={onCancel} aria-label="Back">
            <ChevronLeftIcon sx={{ fontSize: "1.1rem" }} />
          </button>
          <span className="pol-header-title">
            Set up {category.label} Policy
          </span>
        </div>
        <div className="pol-managed">
          <p className="pol-managed-title">Managed by your organization</p>
          <p className="pol-managed-sub">
            Contact an admin to enable this policy.
          </p>
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
      {/* Header */}
      <div className="pol-header">
        <button className="pol-icon-btn" onClick={back} aria-label="Back">
          <ChevronLeftIcon sx={{ fontSize: "1.1rem" }} />
        </button>
        <span className="pol-header-icon">{category.icon}</span>
        <div className="pol-header-text">
          <span className="pol-header-title">
            Set up {category.label} Policy
          </span>
          <span className="pol-header-sub">Step {step} of 3</span>
        </div>
        <button className="pol-icon-btn" onClick={onCancel} aria-label="Cancel">
          <CloseIcon sx={{ fontSize: "1.1rem" }} />
        </button>
      </div>

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
            <div className="pol-card">
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
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="pol-desc">
              Choose where this policy runs and which document types it applies
              to.
            </p>
            <p className="pol-section-label">Sources</p>
            <div className="pol-card">
              {POLICY_SOURCES.map((src, i) => {
                const on = sources.includes(src.id);
                return (
                  <div
                    key={src.id}
                    className="pol-source"
                    data-first={i === 0 || undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSource(src.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSource(src.id);
                      }
                    }}
                  >
                    <span className={`pol-check${on ? " is-on" : ""}`}>
                      {on && <CheckIcon sx={{ fontSize: "0.7rem" }} />}
                    </span>
                    <span className="pol-source-icon">{src.icon}</span>
                    <div className="pol-source-text">
                      <span className="pol-source-label">{src.label}</span>
                      <span className="pol-source-desc">{src.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="pol-section-label">Document types</p>
            {!classificationEnabled ? (
              <div className="pol-info">
                <InfoOutlinedIcon
                  sx={{ fontSize: "0.9rem", color: "#F59E0B" }}
                />
                <div>
                  <p className="pol-info-title">All document types</p>
                  <p className="pol-info-sub">
                    Enable the Classification policy to filter by document type.
                  </p>
                  <button className="pol-link" onClick={onSetupClassification}>
                    Set up Classification →
                  </button>
                </div>
              </div>
            ) : (
              <div className="pol-card">
                <div className="pol-doctypes-head">
                  <span className="pol-field-label">
                    {scopeTypes.length === 0
                      ? "All document types"
                      : `${scopeTypes.length} types selected`}
                  </span>
                  <button
                    className="pol-link"
                    onClick={() => {
                      const next = !scopeNarrow;
                      setScopeNarrow(next);
                      if (!next) setScopeTypes([]);
                    }}
                  >
                    {scopeNarrow ? "Clear" : "Edit"}
                  </button>
                </div>
                {scopeNarrow && (
                  <div className="pol-doctypes">
                    {POLICY_DOC_TYPES.map((dt) => (
                      <label key={dt} className="pol-doctype">
                        <input
                          type="checkbox"
                          checked={scopeTypes.includes(dt)}
                          onChange={() =>
                            setScopeTypes((prev) =>
                              prev.includes(dt)
                                ? prev.filter((d) => d !== dt)
                                : [...prev, dt],
                            )
                          }
                        />
                        <span>{dt}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
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
            <div className="pol-card pol-card-pad">
              <p className="pol-info-sub">Send flagged documents to:</p>
              <input
                className="pol-text-input"
                type="email"
                aria-label="Reviewer email"
                value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                placeholder="email@company.com"
              />
              <p className="pol-info-sub">
                They'll open flagged documents directly in the Stirling editor.
              </p>
            </div>

            <p className="pol-section-label">Summary</p>
            <div className="pol-card pol-card-pad">
              <div className="pol-summary-head">
                <span className="pol-header-icon">{category.icon}</span>
                <span className="pol-summary-title">
                  {category.label} Policy
                </span>
              </div>
              <div className="pol-summary-row">
                <span className="pol-summary-key">Enforces</span>
                <div className="pol-rule-chips">
                  {config.rules.map((r) => (
                    <span key={r} className="pol-rule-chip">
                      {r}
                    </span>
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
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="pol-footer">
        <button className="pol-btn-text" onClick={back}>
          {step > 1 ? "Back" : "Cancel"}
        </button>
        {step < 3 ? (
          <button
            className="pol-btn-primary"
            onClick={() =>
              setStep((s) => Math.min(3, s + 1) as PolicySetupStep)
            }
          >
            Continue
          </button>
        ) : (
          <button
            className="pol-btn-primary"
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
          </button>
        )}
      </div>
    </div>
  );
}
