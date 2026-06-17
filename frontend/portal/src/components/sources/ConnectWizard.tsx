import { useState } from "react";
import { Button, CodeBlock, Modal, StatTile } from "@shared/components";
import { type Source, SOURCE_TYPE_META } from "@portal/api/sources";
import "@portal/views/Sources.css";

const WIZARD_STEPS = ["Choose type", "Configure", "Review & connect"] as const;

const CONNECT_SNIPPET = `curl https://api.stirlingpdf.com/v1/extract \\
  -H "Authorization: Bearer sk_live_••••" \\
  -F "file=@invoice.pdf" \\
  -F "pipeline=invoice-v3"`;

interface ConnectWizardProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Guided shell for connecting a new source. The final step is a demo stub that
 * closes without provisioning — wiring it to the backend creates the source.
 */
export function ConnectWizard({ open, onClose }: ConnectWizardProps) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<Source["type"]>("agent");

  function close() {
    onClose();
    // Reset for the next open, after the close transition has finished.
    setTimeout(() => {
      setStep(0);
      setType("agent");
    }, 200);
  }

  const isLast = step === WIZARD_STEPS.length - 1;

  function advance() {
    if (isLast) {
      // TODO(backend): POST /api/v1/sources { type, pipeline, region } — provision
      // the source, then close on success.
      close();
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="lg"
      title="Connect a source"
      subtitle={`Step ${step + 1} of ${WIZARD_STEPS.length} · ${WIZARD_STEPS[step]}`}
      footer={
        <div className="portal-sources__wizard-footer">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button
            size="sm"
            onClick={advance}
            trailingIcon={!isLast ? <span aria-hidden>→</span> : undefined}
          >
            {isLast ? "Connect source" : "Continue"}
          </Button>
        </div>
      }
    >
      <ol className="portal-sources__steps" aria-hidden>
        {WIZARD_STEPS.map((label, i) => (
          <li
            key={label}
            className={
              "portal-sources__step" +
              (i === step ? " is-active" : i < step ? " is-done" : "")
            }
          >
            <span className="portal-sources__step-mark">
              {i < step ? "✓" : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="portal-sources__type-grid">
          {(Object.keys(SOURCE_TYPE_META) as Source["type"][]).map((t) => {
            const meta = SOURCE_TYPE_META[t];
            return (
              <button
                key={t}
                type="button"
                className={
                  "portal-sources__type-card" +
                  (type === t ? " is-selected" : "")
                }
                onClick={() => setType(t)}
              >
                <span className="portal-sources__type-icon" aria-hidden>
                  {meta.icon}
                </span>
                <span className="portal-sources__type-name">{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="portal-sources__wizard-body">
          <p className="portal-sources__wizard-lead">
            Configure your <strong>{SOURCE_TYPE_META[type].label}</strong>.
            Point it at Stirling and attach a default pipeline — every document
            this source ingests runs through it automatically.
          </p>
          <CodeBlock code={CONNECT_SNIPPET} caption="quickstart.sh" />
          <p className="portal-sources__wizard-note">
            Scopes, rate limits and IP allowlists can be tuned after the source
            is connected.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="portal-sources__wizard-body">
          <p className="portal-sources__wizard-lead">
            Ready to connect a new{" "}
            <strong>{SOURCE_TYPE_META[type].label}</strong>. It starts paused so
            you can verify the first few documents before going live.
          </p>
          <div className="portal-sources__stat-grid">
            <StatTile label="Type" value={SOURCE_TYPE_META[type].label} />
            <StatTile label="Default pipeline" value="Redact & Flatten" />
            <StatTile label="Initial state" value="Paused" />
            <StatTile label="Region" value="us-east-1" />
          </div>
        </div>
      )}
    </Modal>
  );
}
