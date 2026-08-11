import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Skeleton,
  StatTile,
  StatusBadge,
} from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { errorMessage } from "@portal/api/http";
import {
  disableEncryptionKey,
  enableEncryptionKey,
  fetchEncryptionStatus,
  fetchMigrationStatus,
  isConflict,
  pendingRotationCount,
  rotateMasterKey,
  startEncryptionMigration,
  unavailableReason,
  type EncryptionKeyInfo,
  type MigrationStatus,
  type StorageEncryptionStatus,
} from "@portal/api/storageEncryption";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import { EncryptionKeyTable } from "@portal/components/infrastructure/EncryptionKeyTable";
import { EncryptionMigrationCard } from "@portal/components/infrastructure/EncryptionMigrationCard";
import { EncryptionRotationCard } from "@portal/components/infrastructure/EncryptionRotationCard";
import "@portal/components/infrastructure/EncryptionPanel.css";

/** How often to re-read migration progress while a run is going. */
const MIGRATION_POLL_MS = 2000;

export interface EncryptionPanelProps {
  /** Shows the cross-node propagation note when revoking. */
  clusterEnabled?: boolean;
}

/**
 * Encryption at rest, as an operator sees it: whether it is on, whether the key
 * backup matches, which scopes have keys, and the two long-running actions
 * (encrypt the backlog, re-wrap after a master-key change).
 *
 * Audit events need an Enterprise licence even though encryption itself is Pro,
 * so a Pro operator is told explicitly rather than assuming a trail exists.
 */
export function EncryptionPanel({
  clusterEnabled = false,
}: EncryptionPanelProps) {
  const { t } = useTranslation();
  const { tier } = useTier();

  const [status, setStatus] = useState<StorageEncryptionStatus | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [migration, setMigration] = useState<MigrationStatus | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [lastRewrapped, setLastRewrapped] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [next, run] = await Promise.all([
        fetchEncryptionStatus(),
        fetchMigrationStatus().catch(() => null),
      ]);
      if (!mounted.current) return;
      setStatus(next);
      setMigration(run);
      setLoadError(null);
    } catch (error) {
      if (!mounted.current) return;
      setLoadError(error);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Progress lives in the backend's memory, so poll only while a run is active.
  useEffect(() => {
    if (migration?.state !== "RUNNING") return;
    const timer = window.setInterval(() => {
      void fetchMigrationStatus()
        .then((next) => {
          if (mounted.current) setMigration(next);
        })
        .catch(() => {
          /* transient: the next tick retries */
        });
    }, MIGRATION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [migration?.state]);

  const runKeyAction = async (
    key: EncryptionKeyInfo,
    action: (keyId: string) => Promise<EncryptionKeyInfo>,
  ) => {
    setBusyKeyId(key.keyId);
    setActionError(null);
    try {
      await action(key.keyId);
      await load();
    } catch (error) {
      setActionError(
        isConflict(error)
          ? errorMessage(error)
          : t("portal.infrastructure.encryption.error.action"),
      );
    } finally {
      if (mounted.current) setBusyKeyId(null);
    }
  };

  const onStartMigration = async () => {
    setStarting(true);
    setActionError(null);
    try {
      setMigration(await startEncryptionMigration());
    } catch (error) {
      setActionError(
        isConflict(error)
          ? errorMessage(error)
          : t("portal.infrastructure.encryption.error.migrationStart"),
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

  const onRotate = async () => {
    setRotating(true);
    setActionError(null);
    try {
      const result = await rotateMasterKey();
      setLastRewrapped(result.rewrapped);
      await load();
    } catch (error) {
      setActionError(
        isConflict(error)
          ? errorMessage(error)
          : t("portal.infrastructure.encryption.error.rotate"),
      );
    } finally {
      if (mounted.current) setRotating(false);
    }
  };

  if (loading) {
    return (
      <div className="portal-enc__stack" aria-hidden>
        <Skeleton height="7rem" />
        <Skeleton height="11rem" />
      </div>
    );
  }

  if (loadError || !status) {
    const reason = unavailableReason(loadError);
    return (
      <EmptyState
        size="compact"
        title={t(
          `portal.infrastructure.encryption.unavailable.${reason}.title`,
        )}
        description={t(
          `portal.infrastructure.encryption.unavailable.${reason}.description`,
        )}
      />
    );
  }

  const totalFiles = status.encryptedFiles + status.plaintextFiles;
  const coverage = totalFiles > 0 ? status.encryptedFiles / totalFiles : 0;
  const writeStateTone = status.writeEnabled
    ? "success"
    : status.active
      ? "warning"
      : "neutral";
  const writeStateKey = status.writeEnabled
    ? "encrypting"
    : status.active
      ? "decryptOnly"
      : "off";

  return (
    <div className="portal-enc__stack">
      <div className="portal-enc__head">
        <SectionHeader
          title={t("portal.infrastructure.encryption.heading")}
          sub={t("portal.infrastructure.encryption.subheading")}
        />
        <StatusBadge tone={writeStateTone} size="sm">
          {t(`portal.infrastructure.encryption.writeState.${writeStateKey}`)}
        </StatusBadge>
      </div>

      {tier !== "enterprise" ? (
        <Banner
          tone="info"
          title={t("portal.infrastructure.encryption.auditNotice.title")}
          description={t(
            "portal.infrastructure.encryption.auditNotice.description",
          )}
        />
      ) : null}

      {status.masterKeySource === "generated" ? (
        <Banner
          tone="warning"
          title={t("portal.infrastructure.encryption.generatedKey.title")}
          description={t(
            "portal.infrastructure.encryption.generatedKey.description",
          )}
        />
      ) : null}

      <Card padding="loose">
        <SectionHeader
          title={t("portal.infrastructure.encryption.coverage.heading")}
          sub={t("portal.infrastructure.encryption.coverage.subheading")}
        />
        <div className="portal-enc__coverage">
          <StatTile
            label={t("portal.infrastructure.encryption.coverage.encrypted")}
            value={status.encryptedFiles.toLocaleString()}
          />
          <StatTile
            label={t("portal.infrastructure.encryption.coverage.plaintext")}
            value={status.plaintextFiles.toLocaleString()}
            tone={status.plaintextFiles > 0 ? "warning" : "default"}
          />
        </div>
        <div className="portal-enc__coverage-bar">
          <ProgressBar
            value={coverage}
            height={10}
            label={t(
              "portal.infrastructure.encryption.coverage.progressLabel",
              {
                percent: Math.round(coverage * 100),
              },
            )}
          />
        </div>
        {!status.writeEnabled && status.active ? (
          <p className="portal-enc__note">
            {t("portal.infrastructure.encryption.coverage.decryptOnlyNote")}
          </p>
        ) : null}
      </Card>

      <section className="portal-enc__split">
        <Card padding="loose">
          <SectionHeader
            title={t("portal.infrastructure.encryption.masterKey.heading")}
            sub={t("portal.infrastructure.encryption.masterKey.subheading")}
          />
          {status.masterKeyFingerprint ? (
            <div className="portal-enc__kv">
              <div className="portal-enc__kv-row">
                <span className="portal-enc__kv-label">
                  {t("portal.infrastructure.encryption.masterKey.fingerprint")}
                </span>
                <span className="portal-enc__fingerprint">
                  <code>{status.masterKeyFingerprint}</code>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() =>
                      void navigator.clipboard?.writeText(
                        status.masterKeyFingerprint ?? "",
                      )
                    }
                  >
                    {t("portal.infrastructure.encryption.masterKey.copy")}
                  </Button>
                </span>
              </div>
              <div className="portal-enc__kv-row">
                <span className="portal-enc__kv-label">
                  {t("portal.infrastructure.encryption.masterKey.version")}
                </span>
                <span className="portal-enc__cell-strong">
                  {status.masterKeyVersion}
                </span>
              </div>
            </div>
          ) : (
            <p className="portal-enc__note">
              {t("portal.infrastructure.encryption.masterKey.notMaterialised")}
            </p>
          )}
          <p className="portal-enc__note">
            {t("portal.infrastructure.encryption.masterKey.compareNote")}
          </p>
        </Card>

        <EncryptionRotationCard
          masterKeyVersion={status.masterKeyVersion}
          pendingRows={pendingRotationCount(status)}
          rotating={rotating}
          lastRewrapped={lastRewrapped}
          onRotate={() => void onRotate()}
        />
      </section>

      <EncryptionKeyTable
        keys={status.keys}
        clusterEnabled={clusterEnabled}
        busyKeyId={busyKeyId}
        onRevoke={(key) => void runKeyAction(key, disableEncryptionKey)}
        onRestore={(key) => void runKeyAction(key, enableEncryptionKey)}
      />

      <EncryptionMigrationCard
        status={migration}
        plaintextFiles={status.plaintextFiles}
        writeEnabled={status.writeEnabled}
        starting={starting}
        actionError={actionError}
        onStart={() => void onStartMigration()}
      />
    </div>
  );
}
