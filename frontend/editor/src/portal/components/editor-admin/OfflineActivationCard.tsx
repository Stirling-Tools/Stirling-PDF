import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card } from "@app/ui";

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
  const { t } = useTranslation();
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
    <Card padding="default" accent="premium" className="portal-editor__panel">
      <div className="portal-editor__panel-head">
        <div>
          <h3 className="portal-editor__panel-title">
            {t("portal.editorAdmin.offlineActivation.title")}
            <span className="portal-editor__enterprise-tag">
              {t("portal.editorAdmin.offlineActivation.enterpriseTag")}
            </span>
          </h3>
          <p className="portal-editor__panel-sub">
            {t("portal.editorAdmin.offlineActivation.subtitle")}
          </p>
        </div>
      </div>

      {!available ? (
        <div className="portal-editor__lock">
          <p className="portal-editor__lock-copy">
            {t("portal.editorAdmin.offlineActivation.lockCopy")}
          </p>
          <Button
            variant="secondary"
            accent="premium"
            size="sm"
            onClick={onUpgrade}
          >
            {t("portal.editorAdmin.offlineActivation.talkToSales")}
          </Button>
        </div>
      ) : (
        <>
          {generated && (
            <Banner
              tone="success"
              title={t(
                "portal.editorAdmin.offlineActivation.readyBanner.title",
              )}
              description={t(
                "portal.editorAdmin.offlineActivation.readyBanner.description",
                { file: "activation-acme-3.2.1.stirlingpkg" },
              )}
            />
          )}
          <div className="portal-editor__panel-actions">
            <Button
              variant="secondary"
              accent="premium"
              loading={generating}
              onClick={generate}
            >
              {t("portal.editorAdmin.offlineActivation.generateButton")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
