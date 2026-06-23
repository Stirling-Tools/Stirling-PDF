import { useEffect } from "react";
import { fetchStatus } from "@portal/api/link";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";

/**
 * One-shot fetch of this instance's link status into LinkContext on app mount,
 * so always-mounted UI (sidebar footer affordance, gates) can read the linked
 * state without each consumer firing its own request. Mounted inside the
 * auth gate so it only runs for authenticated admins.
 *
 * Subscription dimension comes from the wallet separately; here we only flip
 * linked/unlinked.
 */
export function AccountLinkStatusBootstrap() {
  const applyLinkFacts = useApplyLinkFacts();

  useEffect(() => {
    let cancelled = false;
    void fetchStatus()
      .then((s) => {
        if (!cancelled && s.linked) {
          // Mark linked-free; the wallet read later promotes to linked-subscribed.
          applyLinkFacts(true, false);
        }
      })
      .catch(() => {
        // Status endpoint absent / unreachable -> stay unlinked (the default).
      });
    return () => {
      cancelled = true;
    };
  }, [applyLinkFacts]);

  return null;
}
