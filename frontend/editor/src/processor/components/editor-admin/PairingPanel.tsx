import { useState } from "react";
import { useTranslation } from "react-i18next";
import CastRounded from "@mui/icons-material/CastRounded";
import TerminalRounded from "@mui/icons-material/TerminalRounded";
import VpnKeyRounded from "@mui/icons-material/VpnKeyRounded";
import { Button, Card, Chip, CodeBlock } from "@app/ui";
import type { PairingMethod, PairingOption } from "@processor/api/editorDeploy";

const METHOD_ICON: Record<PairingMethod, typeof VpnKeyRounded> = {
  token: VpnKeyRounded,
  shortcode: CastRounded,
  iac: TerminalRounded,
};

const METHOD_TONE: Record<PairingMethod, "blue" | "purple" | "green"> = {
  token: "blue",
  shortcode: "purple",
  iac: "green",
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
  const { t } = useTranslation();
  // Tracks which option just got a (mock) rotate so we can flash confirmation.
  const [rotated, setRotated] = useState<PairingMethod | null>(null);

  function rotate(method: PairingMethod) {
    // TODO(backend): POST /v1/editor/pairings { method } → returns a freshly
    // minted token / short code / IaC reference.
    setRotated(method);
    setTimeout(() => setRotated((m) => (m === method ? null : m)), 1800);
  }

  return (
    <div className="processor-editor__pairings">
      {pairings.map((p) => {
        const isCode = p.method === "iac";
        const Icon = METHOD_ICON[p.method];
        return (
          <Card
            key={p.method}
            padding="default"
            className="processor-editor__pairing"
          >
            <div className="processor-editor__pairing-head">
              <span
                className={`processor-editor__pairing-icon processor-editor__pairing-icon--${METHOD_TONE[p.method]}`}
                aria-hidden
              >
                <Icon style={{ fontSize: "1.2rem" }} />
              </span>
              <div className="processor-editor__pairing-titles">
                <h3 className="processor-editor__pairing-name">{p.label}</h3>
                <p className="processor-editor__pairing-desc">
                  {p.description}
                </p>
              </div>
            </div>

            {p.locked ? (
              <div className="processor-editor__lock">
                <p className="processor-editor__lock-copy">
                  {t("processor.editorAdmin.pairing.lockCopy")}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  accent="premium"
                  onClick={onUpgrade}
                >
                  {t("processor.editorAdmin.pairing.talkToSales")}
                </Button>
              </div>
            ) : (
              <>
                {isCode ? (
                  <CodeBlock code={p.value} lang="plain" maxHeight={80} />
                ) : (
                  <div className="processor-editor__pairing-value">
                    <code>{p.value}</code>
                  </div>
                )}
                <div className="processor-editor__pairing-foot">
                  {p.expires && (
                    <Chip size="sm" accent="neutral">
                      {p.expires}
                    </Chip>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => rotate(p.method)}
                  >
                    {rotated === p.method
                      ? t("processor.editorAdmin.pairing.generated")
                      : p.method === "shortcode"
                        ? t("processor.editorAdmin.pairing.generateNewCode")
                        : t("processor.editorAdmin.pairing.rotate")}
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
