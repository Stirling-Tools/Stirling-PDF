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
    <Card
      padding="default"
      accent="premium"
      className="processor-editor__panel"
    >
      <div className="processor-editor__panel-head">
        <div>
          <h3 className="processor-editor__panel-title">
            {t("processor.editorAdmin.offlineActivation.title")}
            <span className="processor-editor__enterprise-tag">
              {t("processor.editorAdmin.offlineActivation.enterpriseTag")}
            </span>
          </h3>
          <p className="processor-editor__panel-sub">
            {t("processor.editorAdmin.offlineActivation.subtitle")}
          </p>
        </div>
      </div>

      {!available ? (
        <div className="processor-editor__lock">
          <p className="processor-editor__lock-copy">
            {t("processor.editorAdmin.offlineActivation.lockCopy")}
          </p>
          <Button
            variant="secondary"
            accent="premium"
            size="sm"
            onClick={onUpgrade}
          >
            {t("processor.editorAdmin.offlineActivation.talkToSales")}
          </Button>
        </div>
      ) : (
        <>
          {generated && (
            <Banner
              tone="success"
              title={t(
                "processor.editorAdmin.offlineActivation.readyBanner.title",
              )}
              description={t(
                "processor.editorAdmin.offlineActivation.readyBanner.description",
                { file: "activation-acme-3.2.1.stirlingpkg" },
              )}
            />
          )}
          <div className="processor-editor__panel-actions">
            <Button
              variant="secondary"
              accent="premium"
              loading={generating}
              onClick={generate}
            >
              {t("processor.editorAdmin.offlineActivation.generateButton")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
