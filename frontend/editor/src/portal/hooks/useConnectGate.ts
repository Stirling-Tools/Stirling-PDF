import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useDevConnectBypass } from "@portal/hooks/useDevConnectBypass";

interface AppConfigShape {
  accountLinkAvailable?: boolean;
}

export interface ConnectGate {
  /** True when this instance CAN link but has not, so gated features must ask first. */
  gated: boolean;
  /** True while the capability is still unknown. Hold the decision rather than flash a gate. */
  loading: boolean;
  /** Whether linking is possible here at all, i.e. the feature flag is on. */
  available: boolean;
  /** Opens the Connect flow. */
  connect: () => void;
  /**
   * Wraps an action so it asks for a connection first when gated. Use on create and edit
   * handlers: the admin's click still does something, it just does the thing that has to happen
   * before the feature can work.
   */
  guard: <A extends unknown[]>(
    action: (...args: A) => void,
  ) => (...args: A) => void;
}

/**
 * The one place that decides whether a feature needing a linked Stirling account may be used.
 *
 * <p>Two facts, not one. Whether the instance is linked comes from {@link useLink}; whether it
 * could be linked comes from the backend, because the account-link endpoints 404 when the feature
 * flag is off and the client cannot tell that apart from "not linked yet". Gating on link state
 * alone would lock these features on every instance running with the flag off, which is the
 * default. Shares the app-config query key with the other config-flag hooks, so this costs no
 * extra request.
 */
export function useConnectGate(): ConnectGate {
  const { isLinked, statusKnown } = useLink();
  const { openLinkModal } = useUI();
  const devBypass = useDevConnectBypass();

  const query = useQuery({
    queryKey: qk.appConfig(),
    queryFn: () =>
      apiClient.local.json<AppConfigShape>("/api/v1/config/app-config"),
  });

  const available = Boolean(query.data?.accountLinkAvailable);
  // Both answers have to be in. The link status arrives separately from the app config and
  // starts out as "unlinked" simply because the type has no third value, so gating before it
  // lands blocks and nags an instance that is in fact linked. If the status call fails we never
  // learn the answer and stay open: a gate that cannot read its own precondition should not be
  // the thing standing in the way.
  const loading = query.isPending || !statusKnown;
  // Dev-only, and absent from every build. See useDevConnectBypass for why this cannot be a
  // setting: the gate is currently the only thing enforcing that these features need a link.
  const gated = available && statusKnown && !isLinked && !devBypass;

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
