import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  column,
  DataTable,
  EmptyState,
  Modal,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import type {
  EncryptionKeyInfo,
  EncryptionKeyStatus,
} from "@portal/api/storageEncryption";

const STATUS_TONE: Record<EncryptionKeyStatus, StatusTone> = {
  ACTIVE: "success",
  RETIRED: "neutral",
  DISABLED: "danger",
};

export interface EncryptionKeyTableProps {
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
      return t("portal.infrastructure.encryption.scope.global");
    if (key.scopeType === "SOURCE")
      return t("portal.infrastructure.encryption.scope.source", {
        id: key.scopeId,
      });
    return t("portal.infrastructure.encryption.scope.team", {
      id: key.scopeId,
    });
  };

  const columns: DataTableColumn<EncryptionKeyInfo>[] = [
    column.entity({
      key: "scope",
      header: t("portal.infrastructure.encryption.keys.columns.scope"),
      sortable: true,
      primary: (row) => scopeLabel(row),
      note: (row) =>
        t("portal.infrastructure.encryption.keys.keyVersion", {
          version: row.keyVersion,
        }),
    }),
    column.badge({
      key: "status",
      header: t("portal.infrastructure.encryption.keys.columns.status"),
      sortable: true,
      get: (row) => ({
        tone: STATUS_TONE[row.status],
        label: t(`portal.infrastructure.encryption.status.${row.status}`),
      }),
    }),
    column.muted({
      key: "lastChange",
      header: t("portal.infrastructure.encryption.keys.columns.lastChange"),
      get: (row) =>
        row.statusChangedBy
          ? t("portal.infrastructure.encryption.keys.changedBy", {
              actor: row.statusChangedBy,
            })
          : t("portal.infrastructure.encryption.keys.neverChanged"),
    }),
    column.actions({
      key: "actions",
      header: t("portal.infrastructure.encryption.keys.columns.actions"),
      get: (row) => [
        row.status === "DISABLED"
          ? {
              label: t("portal.infrastructure.encryption.keys.restore"),
              disabled: busyKeyId === row.keyId,
              onClick: () => onRestore(row),
            }
          : {
              label: t("portal.infrastructure.encryption.keys.revoke"),
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
          title={t("portal.infrastructure.encryption.keys.heading")}
          sub={t("portal.infrastructure.encryption.keys.subheading")}
        />
        {/* Column headers over an empty body are chrome around nothing. */}
        {keys.length === 0 ? (
          <EmptyState
            size="compact"
            title={t("portal.infrastructure.encryption.keys.empty.title")}
            description={t(
              "portal.infrastructure.encryption.keys.empty.description",
            )}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={keys}
            rowKey={(row) => row.keyId}
          />
        )}

        <Modal
          open={pendingRevoke !== null}
          onClose={() => setPendingRevoke(null)}
          width="md"
          title={t("portal.infrastructure.encryption.revoke.title")}
          subtitle={pendingRevoke ? scopeLabel(pendingRevoke) : undefined}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingRevoke(null)}
              >
                {t("portal.infrastructure.encryption.revoke.cancel")}
              </Button>
              <Button
                variant="primary"
                accent="danger"
                onClick={() => {
                  if (pendingRevoke) onRevoke(pendingRevoke);
                  setPendingRevoke(null);
                }}
              >
                {t("portal.infrastructure.encryption.revoke.confirm")}
              </Button>
            </>
          }
        >
          <ul className="portal-enc__consequences">
            <li>{t("portal.infrastructure.encryption.revoke.readsFail")}</li>
            <li>
              {t("portal.infrastructure.encryption.revoke.uploadsContinue")}
            </li>
            <li>{t("portal.infrastructure.encryption.revoke.reversible")}</li>
            {clusterEnabled ? (
              <li>
                {t("portal.infrastructure.encryption.revoke.clusterDelay")}
              </li>
            ) : null}
          </ul>
        </Modal>
      </Card>
    </section>
  );
}
