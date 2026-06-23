import { useState } from "react";
import { Button, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchApiKeys, type ApiKey } from "@portal/api/infrastructure";
import { ApiKeyCard } from "@portal/components/infrastructure/ApiKeyCard";
import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";

export function ApiKeysTab() {
  const { tier } = useTier();
  const [modalOpen, setModalOpen] = useState(false);
  const state = useAsync<ApiKey[]>(() => fetchApiKeys(tier), [tier]);
  const { data: keys } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  return (
    <div className="portal-infra__stack">
      <div className="portal-infra__bar">
        <SectionHeader
          title="API keys"
          sub="Scoped credentials with per-key rate limits, permissions, and IP allowlists."
        />
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          leftSection={<span aria-hidden>+</span>}
        >
          Create key
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
          title="No API keys yet"
          description="Create a scoped key to start calling the Stirling API."
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
