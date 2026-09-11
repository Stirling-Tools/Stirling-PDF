import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient, errorMessage } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
import { useLinkOptional } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useAccountLinkOptional } from "@portal/contexts/AccountLinkContext";

interface AppConfigShape {
  accountLinkAvailable?: boolean;
}

interface ConnectGate {
  /** Can link but has not, so gated features must ask first. */
  gated: boolean;
  /** A required capability or link-status check has not settled yet. */
  loading: boolean;
  /** A required check failed; guarded actions remain blocked until it succeeds. */
  error: string | null;
  retry: () => void;
  /** Whether linking is possible here at all, i.e. the feature flag is on. */
  available: boolean;
  connect: () => void;
  /** Blocks create/edit while checks are unresolved; asks to connect when confirmed unlinked. */
  guard: <A extends unknown[]>(
    action: (...args: A) => void,
  ) => (...args: A) => void;
}

/**
 * Two facts, not one: linked, and *could* be linked. The account-link endpoints 404 with the flag
 * off, which the client cannot tell from "not linked yet", so gating on link state alone would lock
 * these features on every default install.
 */
export function useConnectGate(): ConnectGate {
  // Optional: the SaaS portal mounts no LinkProvider, and no provider means nothing to gate.
  const link = useLinkOptional();
  const { openLinkModal } = useUI();
  const accountLink = useAccountLinkOptional();

  const query = useQuery({
    enabled: link != null,
    queryKey: qk.appConfig(),
    queryFn: () =>
      apiClient.local.json<AppConfigShape>("/api/v1/config/app-config"),
  });

  const available = Boolean(query.data?.accountLinkAvailable) && link != null;
  const statusKnown = link?.statusKnown ?? false;
  const error =
    link != null && query.isError
      ? errorMessage(query.error)
      : available && !statusKnown
        ? (accountLink?.statusError ?? null)
        : null;
  // A disabled capability has no status endpoint. Only wait for link status when linking applies.
  const loading =
    link != null && (query.isPending || (available && !statusKnown && !error));
  const gated = !error && available && statusKnown && !link?.isLinked;
  const retry = () => {
    if (query.isError) void query.refetch();
    else void accountLink?.refresh();
  };

  const connect = useCallback(() => openLinkModal(), [openLinkModal]);

  const guard = useCallback(
    <A extends unknown[]>(action: (...args: A) => void) =>
      (...args: A) => {
        if (loading || error) return;
        if (gated) {
          openLinkModal();
          return;
        }
        action(...args);
      },
    [gated, loading, error, openLinkModal],
  );

  return { gated, loading, error, retry, available, connect, guard };
}
