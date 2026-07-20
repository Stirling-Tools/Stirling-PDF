import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Skeleton } from "@editor/ui";
import { useTier } from "@processor/contexts/TierContext";
import { useAsync, useSectionFlags } from "@processor/hooks/useAsync";
import { fetchApiKeys, type ApiKey } from "@processor/api/infrastructure";
import { ApiKeyCard } from "@processor/components/infrastructure/ApiKeyCard";
import { CreateKeyModal } from "@processor/components/infrastructure/CreateKeyModal";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";

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
