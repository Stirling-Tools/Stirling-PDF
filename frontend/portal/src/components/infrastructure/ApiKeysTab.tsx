import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchApiKeys, type ApiKey } from "@portal/api/infrastructure";
import { ApiKeyCard } from "@portal/components/infrastructure/ApiKeyCard";
import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";

export function ApiKeysTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [modalOpen, setModalOpen] = useState(false);
  const state = useAsync<ApiKey[]>(() => fetchApiKeys(tier), [tier]);
  const { data: keys } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  return (
    <div className="portal-infra__stack">
      <div className="portal-infra__bar">
        <SectionHeader
          title={t("infrastructure.apiKeys.heading")}
          sub={t("infrastructure.apiKeys.subheading")}
        />
        <Button
          variant="gradient"
          size="sm"
          onClick={() => setModalOpen(true)}
          leadingIcon={<span aria-hidden>+</span>}
        >
          {t("infrastructure.apiKeys.createKey")}
        </Button>
      </div>

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
          title={t("infrastructure.apiKeys.empty.title")}
          description={t("infrastructure.apiKeys.empty.description")}
        />
      )}

      {keys && keys.length > 0 && (
        <div className="portal-infra__keys">
          {keys.map((k) => (
            <ApiKeyCard key={k.id} apiKey={k} />
          ))}
        </div>
      )}

      <CreateKeyModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
