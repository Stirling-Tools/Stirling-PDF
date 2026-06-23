import { useState } from "react";
import { Banner, Button, Card } from "@shared/components";

interface Props {
  /** Enterprise-only. When false the card renders an upgrade nudge. */
  available: boolean;
  onUpgrade?: () => void;
}

/**
 * Air-gapped / offline activation. Networks with no outbound path can't pair
 * live, so this generates a signed activation bundle to carry in by hand.
 * Enterprise-only; lower tiers see an upgrade nudge. Generation is a demo
 * shell with no submit endpoint yet.
 */
export function OfflineActivationCard({ available, onUpgrade }: Props) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  function generate() {
    // TODO(backend): POST /v1/editor/deployment/offline-bundle → streams a
    // signed .stirlingpkg activation bundle for an air-gapped install.
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 900);
  }

  return (
    <Card padding="default" accent="purple" className="portal-editor__panel">
      <div className="portal-editor__panel-head">
        <div>
          <h3 className="portal-editor__panel-title">
            Air-gapped activation
            <span className="portal-editor__enterprise-tag">Enterprise</span>
          </h3>
          <p className="portal-editor__panel-sub">
            Generate a signed activation bundle for an offline or on-prem
            install with no outbound network path. Transfer it to the instance
            and apply it during first-run setup.
          </p>
        </div>
      </div>

      {!available ? (
        <div className="portal-editor__lock">
          <p className="portal-editor__lock-copy">
            Offline and on-prem activation is part of Enterprise.
          </p>
          <Button
            variant="outlined"
            accent="neutral"
            size="sm"
            onClick={onUpgrade}
          >
            Talk to sales
          </Button>
        </div>
      ) : (
        <>
          {generated && (
            <Banner
              tone="success"
              title="Bundle ready"
              description="activation-acme-3.2.1.stirlingpkg is signed and ready to transfer. It activates one instance and expires in 14 days."
            />
          )}
          <div className="portal-editor__panel-actions">
            <Button
              variant="outlined"
              accent="neutral"
              loading={generating}
              onClick={generate}
            >
              Generate offline bundle
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
