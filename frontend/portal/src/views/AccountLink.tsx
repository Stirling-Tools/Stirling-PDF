import { useCallback, useState } from "react";
import { Skeleton, StatusBadge } from "@shared/components";
import { useAsync } from "@portal/hooks/useAsync";
import { useAccountLink } from "@portal/hooks/useAccountLink";
import { useLink, LINK_INFO } from "@portal/contexts/LinkContext";
import {
  fetchInstances,
  revokeInstance as apiRevokeInstance,
  type LinkedInstanceRow,
} from "@portal/api/link";
import { LinkAccountCard } from "@portal/components/account-link/LinkAccountCard";
import { LinkedInstancesTable } from "@portal/components/account-link/LinkedInstancesTable";
import "@portal/views/AccountLink.css";

export function AccountLink() {
  const link = useAccountLink();
  const { linkState } = useLink();

  // Refetch the team list whenever this instance's link status changes so a
  // freshly linked/unlinked instance appears without a manual reload. The
  // team-wide list/revoke target the SaaS backend (attended admin action).
  const linked = link.status?.linked ?? false;
  const [reloadKey, setReloadKey] = useState(0);
  const instancesState = useAsync<LinkedInstanceRow[]>(
    () => fetchInstances(null),
    [reloadKey, linked],
  );
  const instances = instancesState.loading ? null : instancesState.data;

  const [revokingId, setRevokingId] = useState<number | null>(null);

  const revoke = useCallback(async (instance: LinkedInstanceRow) => {
    setRevokingId(instance.instanceId);
    try {
      await apiRevokeInstance(null, instance.instanceId);
      setReloadKey((k) => k + 1);
    } finally {
      setRevokingId(null);
    }
  }, []);

  return (
    <div className="portal-link">
      <header className="portal-link__header">
        <div>
          <h1 className="portal-link__page-title">Account link</h1>
          <p className="portal-link__page-sub">
            Link this self-hosted org to its Stirling account so unattended
            processing bills against your org wallet.
          </p>
        </div>
        <StatusBadge
          tone={
            linkState === "linked-subscribed"
              ? "success"
              : linkState === "linked-free"
                ? "info"
                : "neutral"
          }
          size="md"
        >
          {LINK_INFO[linkState].label}
        </StatusBadge>
      </header>

      <LinkAccountCard link={link} />

      <section className="portal-link__instances">
        <div className="portal-link__section-head">
          <h2 className="portal-link__section-title">Linked instances</h2>
          <p className="portal-link__section-sub">
            Every self-hosted instance registered to this org. Revoke a
            credential to immediately cut off its unattended access.
          </p>
        </div>
        {instances === null ? (
          <div className="portal-link__skeleton" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height="3rem" />
            ))}
          </div>
        ) : (
          <LinkedInstancesTable
            instances={instances}
            onRevoke={revoke}
            revokingId={revokingId}
          />
        )}
      </section>
    </div>
  );
}
