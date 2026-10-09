import {
  Fragment,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { connectionModeService } from "@app/services/connectionModeService";
import {
  connectionIdentityKey,
  subscribeToConnectionIdentity,
} from "@app/services/connectionIdentity";
import { resetPortalSaasSessionState } from "@app/portal/auth/portalSaasSession";
import { ProcessorEditionContext, editionForMode } from "@portal/edition";

/** Module-level so a switch made while no processor surface was mounted still counts. */
let sessionIdentity: string | null = null;

/**
 * Wraps every desktop entry into processor code: the processor route and each
 * processor settings section. It remounts its subtree when the mode, server or
 * account changes, which is what makes {@link editionHook} safe and keeps one
 * connection's state out of the next. The query client is scoped the same way
 * (see portal-desktop/queryClient).
 */
export function ProcessorEditionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const identity = useSyncExternalStore(
    subscribeToConnectionIdentity,
    connectionIdentityKey,
  );
  const edition = editionForMode(connectionModeService.getCachedMode());

  useEffect(() => {
    // Drops a billing-session renewal still in flight for the previous connection.
    if (sessionIdentity !== null && sessionIdentity !== identity) {
      resetPortalSaasSessionState();
    }
    sessionIdentity = identity;
  }, [identity]);

  return (
    <ProcessorEditionContext.Provider value={edition}>
      <Fragment key={identity}>{children}</Fragment>
    </ProcessorEditionContext.Provider>
  );
}
