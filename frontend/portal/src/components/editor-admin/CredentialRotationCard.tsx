import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <h3 className="portal-editor__panel-title">
            {t("editorAdmin.serviceToken.title")}
          </h3>
          <p className="portal-editor__panel-sub">
            {t("editorAdmin.serviceToken.subtitle")}
          </p>
        </div>
      </div>

      <div className="portal-editor__token-row">
        <StatTile
          label={t("editorAdmin.serviceToken.currentToken")}
          value={serviceToken.masked}
        />
        <StatTile
          label={t("editorAdmin.serviceToken.lastRotated")}
          value={serviceToken.lastRotated}
        />
      </div>

      {rotated && (
        <Banner
          tone="warning"
          title={t("editorAdmin.serviceToken.rotatedBanner.title")}
          description={t("editorAdmin.serviceToken.rotatedBanner.description")}
        />
      )}

      <div className="portal-editor__panel-actions">
        <Button
          variant="outline"
          accent="amber"
          loading={rotating}
          onClick={rotate}
        >
          {t("editorAdmin.serviceToken.rotateButton")}
        </Button>
      </div>
    </Card>
  );
}
