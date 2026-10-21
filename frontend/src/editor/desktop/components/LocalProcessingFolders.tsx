import { useEffect } from "react";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { scanLocalProcessingFolders } from "@app/services/localProcessingFolders";

/** Polls local directories while signed in, including after reconnects and app restarts. */
export function LocalProcessingFolders() {
  const enabled = usePoliciesEnabled();
  useEffect(() => {
    if (!enabled) return;
    const scan = () => {
      void scanLocalProcessingFolders().catch(() => {});
    };
    scan();
    const timer = setInterval(scan, 5000);
    window.addEventListener("focus", scan);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", scan);
    };
  }, [enabled]);
  return null;
}
