import { useCallback } from "react";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useLinkOptional } from "@processor/contexts/LinkContext";
import { useUI } from "@processor/contexts/UIContext";
import { useAccountLinkOptional } from "@processor/contexts/AccountLinkContext";

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

  const appConfig = useAppConfig();

  const available =
    Boolean(appConfig.config?.accountLinkAvailable) && link != null;
  const statusKnown = link?.statusKnown ?? false;
  const configError = link != null ? appConfig.error : null;
  const statusError =
    available && !statusKnown ? (accountLink?.statusError ?? null) : null;
  const error = configError ?? statusError;
  // A disabled capability has no status endpoint. Only wait for link status when linking applies.
  const loading =
    link != null &&
    (appConfig.config == null || (available && !statusKnown && !error));
  const gated = !error && available && statusKnown && !link?.isLinked;
  const retry = () => {
    if (configError) void appConfig.refetch();
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
