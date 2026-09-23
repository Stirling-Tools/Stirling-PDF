import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@app/auth";
import apiClient from "@app/services/apiClient";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { EditorLinkModal } from "@app/components/account-link/EditorLinkModal";
import { FreeTierBalanceSummary } from "@app/components/account-link/FreeTierBalanceSummary";
import type { FreeTierBalance } from "@app/components/account-link/FreeTierBalanceSummary";

import {
  acknowledgeAccountLinkPrompt,
  clearAccountLinkBlock,
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
    queryFn: async () =>
      (
        await apiClient.get<FreeTierBalance>("/api/v1/account-link/free-tier", {
          suppressErrorToast: true,
          skipAuthRedirect: true,
        })
      ).data,
    enabled: readsBalance,
    retry: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (
      readsBalance &&
      ledger.isSuccess &&
      !ledger.isFetching &&
      ledger.data.remainingUnits > 0
    ) {
      clearAccountLinkBlock();
    }
  }, [readsBalance, ledger.isSuccess, ledger.isFetching, ledger.data]);

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
    <EditorLinkModal
      open
      failureContext={context}
      onClose={() => setOpen(false)}
      onStart={onShowOptions}
      onManagePipeline={onManagePipeline}
      summary={
        <FreeTierBalanceSummary
          balance={
            onShowOptions ? balance : ledger.isSuccess ? ledger.data : undefined
          }
        />
      }
    />
  );
}
