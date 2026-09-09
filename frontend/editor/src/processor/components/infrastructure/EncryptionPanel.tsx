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
import { errorMessage } from "@processor/api/http";
import {
  disableEncryptionKey,
  enableEncryptionKey,
  fetchEncryptionStatus,
  fetchMigrationStatus,
  isConflict,
  isMissing,
  pendingRotationCount,
  rotateMasterKey,
  RUNBOOK_BACKUP,
  startEncryptionMigration,
  unavailableReason,
  type EncryptionKeyInfo,
  type MigrationStatus,
  type StorageEncryptionStatus,
} from "@processor/api/storageEncryption";
import { InfoHint } from "@processor/components/InfoHint";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";
import { EncryptionKeyTable } from "@processor/components/infrastructure/EncryptionKeyTable";
import { EncryptionMigrationCard } from "@processor/components/infrastructure/EncryptionMigrationCard";
import { EncryptionRotationCard } from "@processor/components/infrastructure/EncryptionRotationCard";
import "@processor/components/infrastructure/EncryptionPanel.css";

/** How often to re-read migration progress while a run is going. */
const MIGRATION_POLL_MS = 2000;

export interface EncryptionPanelProps {
  /** Shows the cross-node propagation note when revoking. */
  clusterEnabled?: boolean;
  /**
   * Whether the licence records audit events (Enterprise). Supplied by the view
   * from the backend's `runningEE` flag rather than read here, because the
   * processor tier is derived from the SaaS account link and never reports
   * Enterprise on a self-hosted install.
   */
  auditAvailable?: boolean;
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
  auditAvailable = true,
}: EncryptionPanelProps) {
  const { t } = useTranslation();

  const [status, setStatus] = useState<StorageEncryptionStatus | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [migration, setMigration] = useState<MigrationStatus | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [lastRewrapped, setLastRewrapped] = useState<number | null>(null);
  // One per action area: a single shared string renders wherever it is passed,
  // so a failed revoke surfaced under "Encrypt existing files".
  const [keyActionError, setKeyActionError] = useState<string | null>(null);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const fingerprintRef = useRef<HTMLElement | null>(null);

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
          if (!mounted.current) return;
          setMigration(next);
          // The run has just changed the encrypted/plaintext split, so re-read
          // status: without this the coverage card keeps its pre-run counts.
          if (next.state !== "RUNNING") void load();
        })
        .catch(() => {
          /* transient: the next tick retries */
        });
    }, MIGRATION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [migration?.state, load]);

  const runKeyAction = async (
    key: EncryptionKeyInfo,
    action: (keyId: string) => Promise<EncryptionKeyInfo>,
  ) => {
    setBusyKeyId(key.keyId);
    setKeyActionError(null);
    try {
      await action(key.keyId);
      await load();
    } catch (error) {
      setKeyActionError(
        isConflict(error)
          ? errorMessage(error)
          : isMissing(error)
            ? t("processor.infrastructure.encryption.error.keyMissing")
            : t("processor.infrastructure.encryption.error.action"),
      );
      await load();
    } finally {
      if (mounted.current) setBusyKeyId(null);
    }
  };

  const onStartMigration = async () => {
    setStarting(true);
    setMigrationError(null);
    try {
      setMigration(await startEncryptionMigration());
    } catch (error) {
      setMigrationError(
        isConflict(error)
          ? errorMessage(error)
          : t("processor.infrastructure.encryption.error.migrationStart"),
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

  /**
   * navigator.clipboard is absent on plain-http origins, which is how plenty of
   * self-hosted installs are reached. Fall back to selecting the fingerprint so
   * the operator can copy it manually, and always confirm which happened.
   */
  const copyFingerprint = async (fingerprint: string | null) => {
    if (!fingerprint) return;
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setCopyError(null);
    } catch {
      const node = fingerprintRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setCopied(false);
      setCopyError(
        t("processor.infrastructure.encryption.masterKey.copyFailed"),
      );
    }
  };

  const onRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      const result = await rotateMasterKey();
      setLastRewrapped(result.rewrapped);
      await load();
    } catch (error) {
      setRotateError(
        isConflict(error)
          ? errorMessage(error)
          : t("processor.infrastructure.encryption.error.rotate"),
      );
      // A rotation can fail partway, so the pending count on screen is stale.
      await load();
    } finally {
      if (mounted.current) setRotating(false);
    }
  };

  if (loading) {
    return (
      <div className="processor-enc__stack" aria-hidden>
        <Skeleton height="7rem" />
        <Skeleton height="11rem" />
      </div>
    );
  }

  if (loadError || !status) {
    const reason = unavailableReason(loadError);
    // Keep the section heading: without it this is an unexplained message
    // floating in the middle of the Storage tab.
    return (
      <section className="processor-enc__stack">
        <SectionHeader
          title={t("processor.infrastructure.encryption.heading")}
          hint={t("processor.infrastructure.encryption.subheading")}
          hintLabel={t("processor.infrastructure.encryption.hintLabel")}
        />
        <Card padding="loose">
          <EmptyState
            size="compact"
            title={t(
              `processor.infrastructure.encryption.unavailable.${reason}.title`,
            )}
            description={t(
              `processor.infrastructure.encryption.unavailable.${reason}.description`,
            )}
          />
        </Card>
      </section>
    );
  }

  const totalFiles = status.encryptedFiles + status.plaintextFiles;
  const coverage = totalFiles > 0 ? status.encryptedFiles / totalFiles : 0;
  const coveragePercent = Math.round(coverage * 100);
  // Keyed off the count, not the fraction: rounding makes 4,127/4,128 display as
  // 100%, and a green badge over an amber bar is worse than either alone.
  const fullyCovered = status.plaintextFiles === 0 && totalFiles > 0;
  // Nothing encrypted, no keys, machinery never started: the key, rotation and
  // revocation cards describe machinery that does not exist yet, so showing
  // them is five cards of noise. Coverage and the backlog are the whole story.
  const neverUsed =
    !status.writeEnabled && !status.active && status.keys.length === 0;
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
    <div className="processor-enc__stack">
      {/* Sectioning elements, not divs: SectionHeader renders a <header>, which
          becomes a banner landmark unless it is scoped by a section. */}
      <section className="processor-enc__head">
        <SectionHeader
          title={t("processor.infrastructure.encryption.heading")}
          hint={t("processor.infrastructure.encryption.subheading")}
          hintLabel={t("processor.infrastructure.encryption.hintLabel")}
        />
        <StatusBadge tone={writeStateTone} size="sm">
          {t(`processor.infrastructure.encryption.writeState.${writeStateKey}`)}
        </StatusBadge>
      </section>

      {!auditAvailable ? (
        <Banner
          tone="info"
          title={t("processor.infrastructure.encryption.auditNotice.title")}
          description={t(
            "processor.infrastructure.encryption.auditNotice.description",
          )}
        />
      ) : null}

      {status.masterKeySource === "generated" ? (
        <Banner
          tone="warning"
          title={t("processor.infrastructure.encryption.generatedKey.title")}
          description={t(
            "processor.infrastructure.encryption.generatedKey.description",
          )}
          action={
            <Button
              variant="secondary"
              size="sm"
              as="a"
              href={RUNBOOK_BACKUP}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(
                "processor.infrastructure.encryption.generatedKey.backupGuide",
              )}
            </Button>
          }
        />
      ) : null}

      <section>
        <Card padding="loose">
          <SectionHeader
            title={t("processor.infrastructure.encryption.coverage.heading")}
            hint={t("processor.infrastructure.encryption.coverage.subheading")}
            hintLabel={t("processor.infrastructure.encryption.hintLabel")}
          />
          <div className="processor-enc__coverage">
            <div className="processor-enc__coverage-tiles">
              <StatTile
                label={t(
                  "processor.infrastructure.encryption.coverage.encrypted",
                )}
                value={status.encryptedFiles.toLocaleString()}
              />
              <StatTile
                label={t(
                  "processor.infrastructure.encryption.coverage.plaintext",
                )}
                value={status.plaintextFiles.toLocaleString()}
                tone={status.plaintextFiles > 0 ? "warning" : "default"}
              />
            </div>
            {totalFiles > 0 ? (
              <StatusBadge
                tone={fullyCovered ? "success" : "warning"}
                size="sm"
              >
                {t(
                  "processor.infrastructure.encryption.coverage.percentEncrypted",
                  { percent: coveragePercent },
                )}
              </StatusBadge>
            ) : null}
          </div>
          <div className="processor-enc__coverage-bar">
            <ProgressBar
              value={coverage}
              height={10}
              color={fullyCovered ? "var(--color-green)" : undefined}
              label={t(
                "processor.infrastructure.encryption.coverage.progressLabel",
                { percent: coveragePercent },
              )}
            />
          </div>
          {!status.writeEnabled && status.active ? (
            <p className="processor-enc__note">
              {t(
                "processor.infrastructure.encryption.coverage.decryptOnlyNote",
              )}
            </p>
          ) : null}
        </Card>
      </section>

      {neverUsed ? null : (
        <>
          <section className="processor-enc__split">
            <Card padding="loose">
              <SectionHeader
                title={t(
                  "processor.infrastructure.encryption.masterKey.heading",
                )}
                hint={t(
                  "processor.infrastructure.encryption.masterKey.subheading",
                )}
                hintLabel={t("processor.infrastructure.encryption.hintLabel")}
              />
              {status.masterKeyFingerprint ? (
                <>
                  <div className="processor-enc__kv">
                    <div className="processor-enc__fingerprint">
                      <span className="processor-enc__kv-label">
                        {t(
                          "processor.infrastructure.encryption.masterKey.fingerprint",
                        )}
                      </span>
                      <code ref={fingerprintRef}>
                        {status.masterKeyFingerprint}
                      </code>
                      <InfoHint
                        content={t(
                          "processor.infrastructure.encryption.masterKey.compareNote",
                        )}
                        label={t(
                          "processor.infrastructure.encryption.masterKey.fingerprintHelp",
                        )}
                      />
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() =>
                          void copyFingerprint(status.masterKeyFingerprint)
                        }
                      >
                        {copied
                          ? t(
                              "processor.infrastructure.encryption.masterKey.copied",
                            )
                          : t(
                              "processor.infrastructure.encryption.masterKey.copy",
                            )}
                      </Button>
                    </div>
                    <div className="processor-enc__kv-row">
                      <span className="processor-enc__kv-label">
                        {t(
                          "processor.infrastructure.encryption.masterKey.version",
                        )}
                      </span>
                      <span className="processor-enc__cell-strong">
                        {status.masterKeyVersion}
                      </span>
                    </div>
                    {status.provider ? (
                      <div className="processor-enc__kv-row">
                        <span className="processor-enc__kv-label">
                          {t(
                            "processor.infrastructure.encryption.masterKey.backend",
                          )}
                        </span>
                        <span className="processor-enc__cell-strong">
                          {status.provider}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {/* Presigned URLs are suppressed once anything is encrypted, so
                      object-store downloads start streaming through the app. */}
                  {status.provider === "s3" &&
                  (status.writeEnabled ||
                    status.active ||
                    status.keys.length > 0) ? (
                    <p className="processor-enc__note">
                      {t(
                        "processor.infrastructure.encryption.masterKey.s3StreamingNote",
                      )}
                    </p>
                  ) : null}
                  {copyError ? (
                    <Banner tone="warning" description={copyError} />
                  ) : null}
                </>
              ) : (
                <p className="processor-enc__note">
                  {t(
                    "processor.infrastructure.encryption.masterKey.notMaterialised",
                  )}
                </p>
              )}
            </Card>

            <EncryptionRotationCard
              actionError={rotateError}
              masterKeyVersion={status.masterKeyVersion}
              pendingRows={pendingRotationCount(status)}
              rotating={rotating}
              lastRewrapped={lastRewrapped}
              onRotate={() => void onRotate()}
            />
          </section>

          <EncryptionKeyTable
            actionError={keyActionError}
            keys={status.keys}
            clusterEnabled={clusterEnabled}
            busyKeyId={busyKeyId}
            onRevoke={(key) => void runKeyAction(key, disableEncryptionKey)}
            onRestore={(key) => void runKeyAction(key, enableEncryptionKey)}
          />
        </>
      )}

      <EncryptionMigrationCard
        status={migration}
        plaintextFiles={status.plaintextFiles}
        writeEnabled={status.writeEnabled}
        starting={starting}
        actionError={migrationError}
        onStart={() => void onStartMigration()}
      />
    </div>
  );
}
