import { useState } from "react";
import { Banner, Button, Card, StatTile } from "@shared/components";
import type { DeploymentSummary } from "@portal/api/editorDeploy";

interface Props {
  serviceToken: DeploymentSummary["serviceToken"];
}

/**
 * Rotation control for the deployment's service token — the credential
 * instances use to authenticate back to the org. Rotation is a demo shell:
 * it flashes a warning that running instances must pick up the new value, but
 * there's no submit endpoint yet.
 */
export function CredentialRotationCard({ serviceToken }: Props) {
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState(false);

  function rotate() {
    // TODO(backend): POST /v1/editor/deployment/rotate → mints a new service
    // token and revokes the old one after a grace window.
    setRotating(true);
    setTimeout(() => {
      setRotating(false);
      setRotated(true);
    }, 700);
  }

  return (
    <Card padding="default" className="portal-editor__panel">
      <div className="portal-editor__panel-head">
        <div>
          <h3 className="portal-editor__panel-title">Service token</h3>
          <p className="portal-editor__panel-sub">
            Instances authenticate to the org with this credential. Rotate it on
            a schedule or immediately after a suspected leak.
          </p>
        </div>
      </div>

      <div className="portal-editor__token-row">
        <StatTile label="Current token" value={serviceToken.masked} />
        <StatTile label="Last rotated" value={serviceToken.lastRotated} />
      </div>

      {rotated && (
        <Banner
          tone="warning"
          title="Rotate running instances"
          description="A new token was issued. Update each self-hosted instance's STIRLING_SERVICE_TOKEN within the 24h grace window or they'll drop offline."
        />
      )}

      <div className="portal-editor__panel-actions">
        <Button
          variant="outline"
          accent="amber"
          loading={rotating}
          onClick={rotate}
        >
          Rotate service token
        </Button>
      </div>
    </Card>
  );
}
