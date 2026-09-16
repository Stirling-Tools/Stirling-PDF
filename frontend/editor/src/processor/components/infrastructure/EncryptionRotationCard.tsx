import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card, Modal } from "@app/ui";
import { RUNBOOK_ROTATION } from "@processor/api/storageEncryption";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";

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
  const [confirming, setConfirming] = useState(false);

  return (
    <section>
      <Card padding="loose">
        <SectionHeader
          title={t("processor.infrastructure.encryption.rotation.heading")}
          hint={t("processor.infrastructure.encryption.rotation.hint")}
          hintLabel={t("processor.infrastructure.encryption.hintLabel")}
        />

        <div className="processor-enc__kv">
          <div className="processor-enc__kv-row">
            <span className="processor-enc__kv-label">
              {t("processor.infrastructure.encryption.rotation.currentVersion")}
            </span>
            <span className="processor-enc__cell-strong">
              {masterKeyVersion ??
                t("processor.infrastructure.encryption.unknown")}
            </span>
          </div>
          <div className="processor-enc__kv-row">
            <span className="processor-enc__kv-label">
              {t("processor.infrastructure.encryption.rotation.pendingRows")}
            </span>
            <span className="processor-enc__cell-strong">{pendingRows}</span>
          </div>
        </div>

        {pendingRows > 0 ? (
          <Banner
            tone="warning"
            title={t(
              "processor.infrastructure.encryption.rotation.pending.title",
              {
                count: pendingRows,
              },
            )}
            description={t(
              "processor.infrastructure.encryption.rotation.pending.description",
            )}
          />
        ) : null}

        {lastRewrapped !== null ? (
          <Banner
            tone="success"
            description={t(
              "processor.infrastructure.encryption.rotation.rewrapped",
              {
                count: lastRewrapped,
              },
            )}
          />
        ) : null}

        {actionError ? (
          <Banner tone="warning" description={actionError} />
        ) : null}

        <div className="processor-enc__actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={pendingRows === 0 || rotating}
            onClick={() => setConfirming(true)}
          >
            {t("processor.infrastructure.encryption.rotation.rewrap")}
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            as="a"
            href={RUNBOOK_ROTATION}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("processor.infrastructure.encryption.rotation.runbook")}
          </Button>
        </div>

        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          width="md"
          title={t(
            "processor.infrastructure.encryption.rotation.confirm.title",
          )}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t(
                  "processor.infrastructure.encryption.rotation.confirm.cancel",
                )}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirming(false);
                  onRotate();
                }}
              >
                {t(
                  "processor.infrastructure.encryption.rotation.confirm.confirm",
                )}
              </Button>
            </>
          }
        >
          <ul className="processor-enc__consequences">
            <li>
              {t(
                "processor.infrastructure.encryption.rotation.confirm.rewraps",
                {
                  count: pendingRows,
                },
              )}
            </li>
            <li>
              {t(
                "processor.infrastructure.encryption.rotation.confirm.noFiles",
              )}
            </li>
            <li>
              {t(
                "processor.infrastructure.encryption.rotation.confirm.rerunnable",
              )}
            </li>
          </ul>
        </Modal>
      </Card>
    </section>
  );
}
