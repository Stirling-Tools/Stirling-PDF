import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, EmptyState, Modal, Skeleton } from "@app/ui";
import { useAsync } from "@processor/hooks/useAsync";
import {
  fetchApiKeys,
  revokeApiKey,
  type ApiKey,
  type ApiKeysResponse,
} from "@processor/api/infrastructure";
import { errorMessage } from "@processor/api/http";
import { ApiKeyCard } from "@processor/components/infrastructure/ApiKeyCard";
import { CreateKeyModal } from "@processor/components/infrastructure/CreateKeyModal";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";

export function ApiKeysTab() {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const state = useAsync<ApiKeysResponse>(() => fetchApiKeys(), [reloadKey]);
  const { data, loading, error: loadError } = state;

  const reload = () => setReloadKey((n) => n + 1);
  const keys = data?.keys ?? [];
  const isLoading = loading && data === null;
  // A failed load must not masquerade as a genuinely empty list.
  const isEmpty = !loading && !loadError && keys.length === 0;

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setError(null);
    setRevoking(true);
    try {
      await revokeApiKey(pendingRevoke.id);
      setPendingRevoke(null);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="processor-infra__stack">
      <div className="processor-infra__bar">
        <SectionHeader
          title={t("processor.infrastructure.apiKeys.heading")}
          sub={t("processor.infrastructure.apiKeys.subheading")}
        />
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          leftSection={<span aria-hidden>+</span>}
        >
          {t("processor.infrastructure.apiKeys.createKey")}
        </Button>
      </div>

      {error && <Banner tone="danger" description={error} />}
      {!loading && loadError && (
        <Banner
          tone="danger"
          description={t("processor.infrastructure.apiKeys.error.load")}
        />
      )}

      {isLoading && (
        <div className="processor-infra__stack" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="3.25rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          size="compact"
          title={t("processor.infrastructure.apiKeys.empty.title")}
          description={t("processor.infrastructure.apiKeys.empty.description")}
        />
      )}

      {keys.length > 0 && (
        <div className="processor-infra__keys">
          {keys.map((k) => (
            <ApiKeyCard key={k.id} apiKey={k} onRevoke={setPendingRevoke} />
          ))}
        </div>
      )}

      <CreateKeyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={reload}
      />

      <Modal
        open={pendingRevoke !== null}
        onClose={() => !revoking && setPendingRevoke(null)}
        width="sm"
        title={t("processor.infrastructure.apiKeys.revoke.title")}
        footer={
          <div className="processor-infra__modal-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={revoking}
              onClick={() => setPendingRevoke(null)}
            >
              {t("processor.infrastructure.apiKeys.revoke.cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              loading={revoking}
              onClick={confirmRevoke}
            >
              {t("processor.infrastructure.apiKeys.revoke.confirm")}
            </Button>
          </div>
        }
      >
        <p>
          {t("processor.infrastructure.apiKeys.revoke.body", {
            name: pendingRevoke?.name ?? "",
          })}
        </p>
      </Modal>
    </div>
  );
}
