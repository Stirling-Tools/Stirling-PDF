import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Banner,
  Button,
  Card,
  ProgressBar,
  StatTile,
  Modal,
  StatusBadge,
  Tooltip,
} from "@app/ui";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { StatusTone } from "@app/ui";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import type {
  MigrationState,
  MigrationStatus,
} from "@portal/api/storageEncryption";

const STATE_TONE: Record<MigrationState, StatusTone> = {
  IDLE: "neutral",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
};

export interface EncryptionMigrationCardProps {
  /** Null before the first status read. */
  status: MigrationStatus | null;
  plaintextFiles: number;
  /** Encryption must be writing before a run can start. */
  writeEnabled: boolean;
  starting?: boolean;
  /** Set when the last start attempt was rejected (409) or failed. */
  actionError?: string | null;
  onStart: () => void;
}

/**
 * The encrypt-existing job. FAILED is a first-class state rather than a stalled
 * spinner, because the run now ends FAILED when the write flag is turned off
 * mid-run, and the operator needs to be told why nothing else was processed.
 */
export function EncryptionMigrationCard({
  status,
  plaintextFiles,
  writeEnabled,
  starting = false,
  actionError = null,
  onStart,
}: EncryptionMigrationCardProps) {
  const { t } = useTranslation();
  const state: MigrationState = status?.state ?? "IDLE";
  const total = status?.total ?? 0;
  const processed = status?.processed ?? 0;
  const skipped = status?.skipped ?? 0;
  const failed = status?.failed ?? 0;
  const fraction = total > 0 ? Math.min(processed / total, 1) : 0;
  const canStart = writeEnabled && plaintextFiles > 0 && state !== "RUNNING";
  const [confirming, setConfirming] = useState(false);

  return (
    <section>
      <Card padding="loose">
        <div className="portal-enc__head">
          <SectionHeader
            title={t("portal.infrastructure.encryption.migration.heading")}
            sub={t("portal.infrastructure.encryption.migration.subheading")}
          />
          <StatusBadge tone={STATE_TONE[state]} size="sm">
            {t(`portal.infrastructure.encryption.migration.state.${state}`)}
          </StatusBadge>
        </div>
        {status?.startedAt ? (
          <p className="portal-enc__note">
            {t("portal.infrastructure.encryption.migration.startedAt", {
              when: new Date(status.startedAt).toLocaleString(),
            })}
          </p>
        ) : null}

        {state === "FAILED" ? (
          <Banner
            tone="danger"
            title={t("portal.infrastructure.encryption.migration.failed.title")}
            description={t(
              "portal.infrastructure.encryption.migration.failed.description",
            )}
          />
        ) : null}

        {actionError ? (
          <Banner tone="warning" description={actionError} />
        ) : null}

        {state === "RUNNING" || state === "COMPLETED" || state === "FAILED" ? (
          <>
            <ProgressBar
              value={fraction}
              height={10}
              // A stopped run should not read as healthy progress.
              color={
                state === "FAILED"
                  ? "var(--c-text-subtle)"
                  : state === "COMPLETED"
                    ? "var(--color-green)"
                    : undefined
              }
              label={t(
                "portal.infrastructure.encryption.migration.progressLabel",
                { processed, total },
              )}
            />
            <div className="portal-enc__migration-stats">
              <StatTile
                label={t(
                  "portal.infrastructure.encryption.migration.encrypted",
                )}
                value={processed.toLocaleString()}
              />
              <StatTile
                label={
                  <span className="portal-enc__stat-label">
                    {t("portal.infrastructure.encryption.migration.skipped")}
                    <Tooltip
                      content={t(
                        "portal.infrastructure.encryption.migration.skippedNote",
                      )}
                    >
                      <ActionIcon
                        variant="quiet"
                        size="sm"
                        aria-label={t(
                          "portal.infrastructure.encryption.migration.skippedHelp",
                        )}
                      >
                        <LocalIcon icon="info-rounded" width="0.875rem" />
                      </ActionIcon>
                    </Tooltip>
                  </span>
                }
                value={skipped.toLocaleString()}
              />
              <StatTile
                label={t(
                  "portal.infrastructure.encryption.migration.failedCount",
                )}
                value={failed.toLocaleString()}
                tone={failed > 0 ? "danger" : "default"}
              />
            </div>
          </>
        ) : (
          <p className="portal-enc__note">
            {plaintextFiles > 0
              ? t("portal.infrastructure.encryption.migration.backlog", {
                  count: plaintextFiles,
                  // count drives plural selection; formatted is what is rendered,
                  // so large backlogs read as 1,840 rather than 1840.
                  formatted: plaintextFiles.toLocaleString(),
                })
              : t("portal.infrastructure.encryption.migration.noBacklog")}
          </p>
        )}

        {/* Start is disabled without the write flag; say why rather than leaving a
          dead button next to a backlog the copy says can be encrypted. */}
        {!writeEnabled && plaintextFiles > 0 ? (
          <p className="portal-enc__note">
            {t(
              "portal.infrastructure.encryption.migration.requiresEncryptionOn",
            )}
          </p>
        ) : null}

        {/* Shown at IDLE too when a backlog remains: that is the state a run lost
            to a restart leaves behind, so it is where the caveat explains most. */}
        {state !== "IDLE" || plaintextFiles > 0 ? (
          <p className="portal-enc__note">
            {t("portal.infrastructure.encryption.migration.restartNote")}
          </p>
        ) : null}

        <div className="portal-enc__actions">
          <Button
            variant="primary"
            size="sm"
            disabled={!canStart || starting}
            onClick={() => setConfirming(true)}
          >
            {state === "FAILED" || state === "COMPLETED"
              ? t("portal.infrastructure.encryption.migration.runAgain")
              : t("portal.infrastructure.encryption.migration.start")}
          </Button>
        </div>

        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          width="md"
          title={t("portal.infrastructure.encryption.migration.confirm.title")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t("portal.infrastructure.encryption.migration.confirm.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirming(false);
                  onStart();
                }}
              >
                {t(
                  "portal.infrastructure.encryption.migration.confirm.confirm",
                )}
              </Button>
            </>
          }
        >
          <ul className="portal-enc__consequences">
            <li>
              {t(
                "portal.infrastructure.encryption.migration.confirm.rewrites",
                {
                  count: plaintextFiles,
                  formatted: plaintextFiles.toLocaleString(),
                },
              )}
            </li>
            {/* The reason this dialog exists: there is no stop control. */}
            <li>
              {t("portal.infrastructure.encryption.migration.confirm.noCancel")}
            </li>
            <li>
              {t(
                "portal.infrastructure.encryption.migration.confirm.throttled",
              )}
            </li>
          </ul>
        </Modal>
      </Card>
    </section>
  );
}
