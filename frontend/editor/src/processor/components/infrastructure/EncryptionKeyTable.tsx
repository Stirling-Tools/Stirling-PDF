import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  column,
  DataTable,
  EmptyState,
  Modal,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";
import type {
  EncryptionKeyInfo,
  EncryptionKeyStatus,
} from "@processor/api/storageEncryption";

const STATUS_TONE: Record<EncryptionKeyStatus, StatusTone> = {
  ACTIVE: "success",
  RETIRED: "neutral",
  DISABLED: "danger",
};

export interface EncryptionKeyTableProps {
  /** Why the last revoke or restore failed. Shown here, beside the rows it concerns. */
  actionError?: string | null;
  keys: EncryptionKeyInfo[];
  /** Shows the cross-node propagation delay in the revoke dialog. */
  clusterEnabled?: boolean;
  /** Key id currently being changed, so its row can show pending state. */
  busyKeyId?: string | null;
  onRevoke: (key: EncryptionKeyInfo) => void;
  onRestore: (key: EncryptionKeyInfo) => void;
}

/**
 * One row per scope key, with the kill switch. Revoking opens a confirmation
 * that spells out the consequences: the surprising ones (the scope keeps
 * uploading, and a cluster takes a minute to converge) are the reason the
 * dialog exists at all.
 */
export function EncryptionKeyTable({
  actionError = null,
  keys,
  clusterEnabled = false,
  busyKeyId = null,
  onRevoke,
  onRestore,
}: EncryptionKeyTableProps) {
  const { t } = useTranslation();
  const [pendingRevoke, setPendingRevoke] = useState<EncryptionKeyInfo | null>(
    null,
  );

  const scopeLabel = (key: EncryptionKeyInfo): string => {
    if (key.scopeType === "GLOBAL")
      return t("processor.infrastructure.encryption.scope.global");
    if (key.scopeType === "SOURCE")
      return t("processor.infrastructure.encryption.scope.source", {
        id: key.scopeId,
      });
    return t("processor.infrastructure.encryption.scope.team", {
      id: key.scopeId,
    });
  };

  const lastChange = (key: EncryptionKeyInfo): string => {
    const when = key.statusChangedAt
      ? new Date(key.statusChangedAt).toLocaleString()
      : null;
    if (key.statusChangedBy && when)
      return t("processor.infrastructure.encryption.keys.changedByAt", {
        actor: key.statusChangedBy,
        when,
      });
    if (key.statusChangedBy)
      return t("processor.infrastructure.encryption.keys.changedBy", {
        actor: key.statusChangedBy,
      });
    if (when)
      return t("processor.infrastructure.encryption.keys.changedAt", { when });
    return t("processor.infrastructure.encryption.keys.neverChanged");
  };

  const columns: DataTableColumn<EncryptionKeyInfo>[] = [
    column.entity({
      key: "scope",
      header: t("processor.infrastructure.encryption.keys.columns.scope"),
      sortable: true,
      primary: (row) => scopeLabel(row),
      note: (row) =>
        t("processor.infrastructure.encryption.keys.keyVersion", {
          version: row.keyVersion,
        }),
    }),
    column.badge({
      key: "status",
      header: t("processor.infrastructure.encryption.keys.columns.status"),
      sortable: true,
      get: (row) => ({
        tone: STATUS_TONE[row.status],
        label: t(`processor.infrastructure.encryption.status.${row.status}`),
      }),
    }),
    column.muted({
      key: "lastChange",
      header: t("processor.infrastructure.encryption.keys.columns.lastChange"),
      get: (row) => lastChange(row),
    }),
    column.actions({
      key: "actions",
      header: t("processor.infrastructure.encryption.keys.columns.actions"),
      get: (row) => [
        row.status === "DISABLED"
          ? {
              label: t("processor.infrastructure.encryption.keys.restore"),
              disabled: busyKeyId === row.keyId,
              onClick: () => onRestore(row),
            }
          : {
              label: t("processor.infrastructure.encryption.keys.revoke"),
              tone: "danger",
              disabled: busyKeyId === row.keyId,
              onClick: () => setPendingRevoke(row),
            },
      ],
    }),
  ];

  return (
    <section>
      <Card padding="loose">
        <SectionHeader
          title={t("processor.infrastructure.encryption.keys.heading")}
          hint={t("processor.infrastructure.encryption.keys.subheading")}
          hintLabel={t("processor.infrastructure.encryption.hintLabel")}
        />
        {actionError ? (
          <Banner tone="warning" description={actionError} />
        ) : null}

        {/* Column headers over an empty body are chrome around nothing. */}
        {keys.length === 0 ? (
          <EmptyState
            size="compact"
            title={t("processor.infrastructure.encryption.keys.empty.title")}
            description={t(
              "processor.infrastructure.encryption.keys.empty.description",
            )}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={keys}
              rowKey={(row) => row.keyId}
            />
            {keys.some((key) => key.status === "RETIRED") ? (
              <p className="processor-enc__note">
                {t("processor.infrastructure.encryption.keys.retiredNote")}
              </p>
            ) : null}
          </>
        )}

        <Modal
          open={pendingRevoke !== null}
          onClose={() => setPendingRevoke(null)}
          width="md"
          title={t("processor.infrastructure.encryption.revoke.title")}
          subtitle={pendingRevoke ? scopeLabel(pendingRevoke) : undefined}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingRevoke(null)}
              >
                {t("processor.infrastructure.encryption.revoke.cancel")}
              </Button>
              <Button
                variant="primary"
                accent="danger"
                onClick={() => {
                  if (pendingRevoke) onRevoke(pendingRevoke);
                  setPendingRevoke(null);
                }}
              >
                {t("processor.infrastructure.encryption.revoke.confirm")}
              </Button>
            </>
          }
        >
          <ul className="processor-enc__consequences">
            <li>{t("processor.infrastructure.encryption.revoke.readsFail")}</li>
            <li>
              {t("processor.infrastructure.encryption.revoke.uploadsContinue")}
            </li>
            <li>
              {t("processor.infrastructure.encryption.revoke.reversible")}
            </li>
            {clusterEnabled ? (
              <li>
                {t("processor.infrastructure.encryption.revoke.clusterDelay")}
              </li>
            ) : null}
          </ul>
        </Modal>
      </Card>
    </section>
  );
}
