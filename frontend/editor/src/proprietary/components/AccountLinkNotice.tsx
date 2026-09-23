import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@app/auth";
import apiClient from "@app/services/apiClient";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { FreeTierBalanceSummary } from "@app/components/account-link/FreeTierBalanceSummary";
import type { FreeTierBalance } from "@app/components/account-link/FreeTierBalanceSummary";

// Lazy: the linking UI drags in the account-link context tree and the Supabase
// SDK, neither of which the notice needs until a prompt actually opens.
const EditorLinkModal = lazy(() =>
  import("@app/components/account-link/EditorLinkModal").then((module) => ({
    default: module.EditorLinkModal,
  })),
);

import {
  acknowledgeAccountLinkPrompt,
  clearBlockIfAllowanceRemains,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

interface Props {
  /** Hosts without a Processor route open the connected server's billing page externally. */
  onShowOptions?: () => void;
  onManagePipeline?: (pipelineId?: string) => void;
  /** Native hosts fetch the connected server's ledger through their own HTTP client. */
  balance?: FreeTierBalance;
}

/** File failures share one explanatory linking prompt per tab session. */
export function AccountLinkNotice({
  onShowOptions,
  onManagePipeline,
  balance,
}: Props = {}) {
  const { isAdmin, loading } = useAuth();
  const { pathname } = useLocation();
  const { exhausted, promptPending, context } = useAccountLinkBlock();
  const [open, setOpen] = useState(false);
  const hasLinkDialog =
    !onShowOptions &&
    (pathname === PORTAL_BASENAME ||
      pathname.startsWith(`${PORTAL_BASENAME}/`) ||
      pathname === "/settings/billing" ||
      pathname === "/settings/account-link");
  const readsBalance =
    !onShowOptions && !hasLinkDialog && isAdmin && !loading && exhausted;
  const ledger = useQuery({
    queryKey: ["accountLink", "editorFreeTier"],
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<FreeTierBalance>(
        "/api/v1/account-link/free-tier",
        { suppressErrorToast: true, skipAuthRedirect: true },
      );
      clearBlockIfAllowanceRemains(data, signal);
      return data;
    },
    enabled: readsBalance,
    // This only runs while a block is up, so anything cached when one appears was
    // read before it; the first read has to be fresh or it lifts the block on an
    // older answer than the one that raised it.
    staleTime: 0,
    retry: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!exhausted || hasLinkDialog) setOpen(false);
  }, [exhausted, hasLinkDialog]);

  useEffect(() => {
    if (hasLinkDialog || loading || !promptPending) return;
    acknowledgeAccountLinkPrompt();
    setOpen(true);
  }, [hasLinkDialog, loading, promptPending]);

  if (!open || !exhausted || hasLinkDialog) return null;
  return (
    <Suspense fallback={null}>
      <EditorLinkModal
        open
        failureContext={context}
        onClose={() => setOpen(false)}
        onStart={onShowOptions}
        onManagePipeline={onManagePipeline}
        summary={
          <FreeTierBalanceSummary
            balance={
              onShowOptions
                ? balance
                : ledger.isSuccess
                  ? ledger.data
                  : undefined
            }
          />
        }
      />
    </Suspense>
  );
}
