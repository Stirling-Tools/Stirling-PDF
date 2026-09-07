import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
import { useLinkOptional } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useDevConnectBypass } from "@portal/hooks/useDevConnectBypass";

interface AppConfigShape {
  accountLinkAvailable?: boolean;
}

interface ConnectGate {
  /** Can link but has not, so gated features must ask first. */
  gated: boolean;
  /** Capability still unknown; hold the decision rather than flash a gate. */
  loading: boolean;
  /** Whether linking is possible here at all, i.e. the feature flag is on. */
  available: boolean;
  connect: () => void;
  /** Wraps a create or edit handler so the click asks for a connection instead. */
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
  const devBypass = useDevConnectBypass();

  const query = useQuery({
    queryKey: qk.appConfig(),
    queryFn: () =>
      apiClient.local.json<AppConfigShape>("/api/v1/config/app-config"),
  });

  const available = Boolean(query.data?.accountLinkAvailable) && link != null;
  // A status call that never succeeds leaves the gate open rather than blocking on an unknown.
  const statusKnown = link?.statusKnown ?? false;
  const loading = query.isPending || (link != null && !statusKnown);
  const gated = available && statusKnown && !link?.isLinked && !devBypass;

  const connect = useCallback(() => openLinkModal(), [openLinkModal]);

  const guard = useCallback(
    <A extends unknown[]>(action: (...args: A) => void) =>
      (...args: A) => {
        if (gated) {
          openLinkModal();
          return;
        }
        action(...args);
      },
    [gated, openLinkModal],
  );

  return { gated, loading, available, connect, guard };
}
