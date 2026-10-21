import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccountLinkNotice as SelfHostedAccountLinkNotice } from "@proprietary/components/AccountLinkNotice";
import {
  connectionModeService,
  type ConnectionConfig,
} from "@app/services/connectionModeService";
import {
  clearAccountLinkBlock,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";
import { useAuth } from "@app/auth";
import apiClient from "@app/services/apiClient";
import { openExternal } from "@app/platform/openExternal";
import { alert } from "@app/components/toast";
import type { FreeTierBalance } from "@app/components/account-link/FreeTierBalanceSummary";

function billingUrl(config: ConnectionConfig): string | null {
  if (config.mode !== "selfhosted" || !config.server_config?.url) return null;
  try {
    const url = new URL(config.server_config.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/settings/billing`;
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return null;
  }
}

/** Desktop has no Processor; self-hosted linking belongs to the connected server's browser UI. */
export function AccountLinkNotice() {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const { exhausted } = useAccountLinkBlock();
  const [target, setTarget] = useState<string | null>(null);
  const [balance, setBalance] = useState<FreeTierBalance>();

  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    let previous: string | null | undefined;
    const update = (config: ConnectionConfig) => {
      if (!active) return;
      const next = billingUrl(config);
      if (previous === next) return;
      if (previous !== undefined) clearAccountLinkBlock();
      previous = next;
      setBalance(undefined);
      setTarget(next);
    };
    const unsubscribe = connectionModeService.subscribeToModeChanges(
      (config) => {
        receivedUpdate = true;
        update(config);
      },
    );
    void connectionModeService.getCurrentConfig().then((config) => {
      if (!receivedUpdate) update(config);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!target || !exhausted || !isAdmin || loading) return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      const options = { suppressErrorToast: true, skipAuthRedirect: true };
      try {
        const status = await apiClient.get<{ linked: boolean }>(
          new URL("../api/v1/account-link/status", target).href,
          options,
        );
        if (!active) return;
        if (status.data.linked) {
          clearAccountLinkBlock();
          return;
        }
        const balance = await apiClient.get<FreeTierBalance>(
          new URL("../api/v1/account-link/free-tier", target).href,
          options,
        );
        if (active) {
          setBalance(balance.data);
          if (balance.data.remainingUnits > 0) clearAccountLinkBlock();
        }
      } catch {
        // An unavailable balance is not evidence that the server's allowance recovered.
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [target, exhausted, isAdmin, loading]);

  const showOptions = useCallback(() => {
    if (!target) return;
    void openExternal(target).catch(() => {
      alert({
        alertType: "error",
        title: t(
          "portal.accountLink.notice.openFailed",
          "Could not open your browser. Open Usage & billing on your connected server to link an account.",
        ),
      });
    });
  }, [target, t]);

  return target ? (
    <SelfHostedAccountLinkNotice
      key={target}
      onShowOptions={showOptions}
      onManagePipeline={(id) => {
        const url = new URL(
          `../processor/pipelines${id ? `/${encodeURIComponent(id)}` : ""}`,
          target,
        );
        void openExternal(url.href).catch(() => {
          alert({
            alertType: "error",
            title: t(
              "portal.accountLink.failure.openFailed",
              "Open the Processor on your connected server to manage this pipeline.",
            ),
          });
        });
      }}
      balance={balance}
    />
  ) : null;
}
