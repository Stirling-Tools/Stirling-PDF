import { useState } from "react";
import { Button, Card, Chip, CodeBlock } from "@shared/components";
import type { PairingMethod, PairingOption } from "@portal/api/editorDeploy";

const METHOD_ICON: Record<PairingMethod, string> = {
  token: "🔑",
  shortcode: "📺",
  iac: "🧱",
};

interface Props {
  pairings: PairingOption[];
  onUpgrade?: () => void;
}

/**
 * Pairing options for connecting a self-hosted editor to the org — a long-lived
 * pairing token, a TV-style short code, and IaC provisioning. The
 * generate/rotate affordance is a demo shell: it shows transient feedback but
 * has no submit endpoint yet.
 */
export function PairingPanel({ pairings, onUpgrade }: Props) {
  // Tracks which option just got a (mock) rotate so we can flash confirmation.
  const [rotated, setRotated] = useState<PairingMethod | null>(null);

  function rotate(method: PairingMethod) {
    // TODO(backend): POST /v1/editor/pairings { method } → returns a freshly
    // minted token / short code / IaC reference.
    setRotated(method);
    setTimeout(() => setRotated((m) => (m === method ? null : m)), 1800);
  }

  return (
    <div className="portal-editor__pairings">
      {pairings.map((p) => {
        const isCode = p.method === "iac";
        return (
          <Card
            key={p.method}
            padding="default"
            className="portal-editor__pairing"
          >
            <div className="portal-editor__pairing-head">
              <span className="portal-editor__pairing-icon" aria-hidden>
                {METHOD_ICON[p.method]}
              </span>
              <div className="portal-editor__pairing-titles">
                <h3 className="portal-editor__pairing-name">{p.label}</h3>
                <p className="portal-editor__pairing-desc">{p.description}</p>
              </div>
            </div>

            {p.locked ? (
              <div className="portal-editor__lock">
                <p className="portal-editor__lock-copy">
                  IaC provisioning is part of Enterprise.
                </p>
                <Button
                  size="sm"
                  variant="outlined"
                  accent="neutral"
                  onClick={onUpgrade}
                >
                  Talk to sales
                </Button>
              </div>
            ) : (
              <>
                {isCode ? (
                  <CodeBlock code={p.value} lang="plain" maxHeight={80} />
                ) : (
                  <div className="portal-editor__pairing-value">
                    <code>{p.value}</code>
                  </div>
                )}
                <div className="portal-editor__pairing-foot">
                  {p.expires && (
                    <Chip size="sm" accent="neutral">
                      {p.expires}
                    </Chip>
                  )}
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => rotate(p.method)}
                  >
                    {rotated === p.method
                      ? "Generated ✓"
                      : p.method === "shortcode"
                        ? "Generate new code"
                        : "Rotate"}
                  </Button>
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
