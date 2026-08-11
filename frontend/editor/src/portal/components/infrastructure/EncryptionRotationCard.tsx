import { useTranslation } from "react-i18next";
import { Banner, Button, Card } from "@app/ui";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";

export interface EncryptionRotationCardProps {
  masterKeyVersion: number | null;
  /** Key rows still wrapped by an older master-key version. */
  pendingRows: number;
  rotating?: boolean;
  /** Rows re-wrapped by the last run, for confirmation after the action. */
  lastRewrapped?: number | null;
  actionError?: string | null;
  onRotate: () => void;
}

/**
 * Rotation is a re-wrap of the key table, never a file rewrite, and key material
 * never crosses HTTP. The warning while rows are pending is the load-bearing
 * part: removing the outgoing key at that point would seal those files.
 */
export function EncryptionRotationCard({
  masterKeyVersion,
  pendingRows,
  rotating = false,
  lastRewrapped = null,
  actionError = null,
  onRotate,
}: EncryptionRotationCardProps) {
  const { t } = useTranslation();

  return (
    <Card padding="loose">
      <SectionHeader
        title={t("portal.infrastructure.encryption.rotation.heading")}
        sub={t("portal.infrastructure.encryption.rotation.subheading")}
      />

      <div className="portal-enc__kv">
        <div className="portal-enc__kv-row">
          <span className="portal-enc__kv-label">
            {t("portal.infrastructure.encryption.rotation.currentVersion")}
          </span>
          <span className="portal-enc__cell-strong">
            {masterKeyVersion ?? t("portal.infrastructure.encryption.unknown")}
          </span>
        </div>
        <div className="portal-enc__kv-row">
          <span className="portal-enc__kv-label">
            {t("portal.infrastructure.encryption.rotation.pendingRows")}
          </span>
          <span className="portal-enc__cell-strong">{pendingRows}</span>
        </div>
      </div>

      {pendingRows > 0 ? (
        <Banner
          tone="warning"
          title={t("portal.infrastructure.encryption.rotation.pending.title", {
            count: pendingRows,
          })}
          description={t(
            "portal.infrastructure.encryption.rotation.pending.description",
          )}
        />
      ) : null}

      {lastRewrapped !== null ? (
        <Banner
          tone="success"
          description={t(
            "portal.infrastructure.encryption.rotation.rewrapped",
            {
              count: lastRewrapped,
            },
          )}
        />
      ) : null}

      {actionError ? <Banner tone="warning" description={actionError} /> : null}

      <p className="portal-enc__note">
        {t("portal.infrastructure.encryption.rotation.keyNeverOverHttp")}
      </p>

      <div className="portal-enc__actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={pendingRows === 0 || rotating}
          onClick={onRotate}
        >
          {t("portal.infrastructure.encryption.rotation.rewrap")}
        </Button>
      </div>
    </Card>
  );
}
