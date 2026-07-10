import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, EmptyState, Skeleton } from "@app/ui";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchApiKeys,
  revokeApiKey,
  type ApiKeysResponse,
} from "@portal/api/infrastructure";
import { errorMessage } from "@portal/api/http";
import { ApiKeyCard } from "@portal/components/infrastructure/ApiKeyCard";
import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";

export function ApiKeysTab() {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = useAsync<ApiKeysResponse>(() => fetchApiKeys(), [reloadKey]);
  const { data, loading } = state;

  const reload = () => setReloadKey((n) => n + 1);
  const keys = data?.keys ?? [];
  const isLoading = loading && data === null;
  const isEmpty = !loading && keys.length === 0;

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeApiKey(id);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="portal-infra__stack">
      <div className="portal-infra__bar">
        <SectionHeader
          title={t("portal.infrastructure.apiKeys.heading")}
          sub={t("portal.infrastructure.apiKeys.subheading")}
        />
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          leftSection={<span aria-hidden>+</span>}
        >
          {t("portal.infrastructure.apiKeys.createKey")}
        </Button>
      </div>

      {error && <Banner tone="danger" description={error} />}

      {isLoading && (
        <div className="portal-infra__stack" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="3.25rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          size="compact"
          title={t("portal.infrastructure.apiKeys.empty.title")}
          description={t("portal.infrastructure.apiKeys.empty.description")}
        />
      )}

      {keys.length > 0 && (
        <div className="portal-infra__keys">
          {keys.map((k) => (
            <ApiKeyCard key={k.id} apiKey={k} onRevoke={revoke} />
          ))}
        </div>
      )}

      <CreateKeyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        canCreateTeamKeys={data?.canCreateTeamKeys ?? false}
        teamName={data?.teamName ?? null}
        onCreated={reload}
      />
    </div>
  );
}
