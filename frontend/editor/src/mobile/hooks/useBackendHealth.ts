import { useCallback, useEffect, useState } from "react";
import i18n from "@app/i18n";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";
import {
  saasServerMonitor,
  type SaasServerState,
} from "@app/services/saasServerMonitor";
import {
  selfHostedServerMonitor,
  type SelfHostedServerState,
} from "@app/services/selfHostedServerMonitor";
import type { BackendHealthState } from "@app/types/backendHealth";

interface MobileBackendHealth extends BackendHealthState {
  checkHealth: () => Promise<boolean>;
}

function resolveHealth(
  mode: ConnectionMode | null,
  saasStatus: SaasServerState["status"],
  selfHostedStatus: SelfHostedServerState["status"],
): BackendHealthState {
  const unreachable = i18n.t(
    "setup.server.error.unreachable",
    "Could not connect to server",
  );

  if (mode === null) {
    // Connection config has not loaded yet.
    return { status: "starting", message: null, error: null, isOnline: false };
  }

  if (mode === "saas") {
    if (saasStatus === "online") {
      return {
        status: "healthy",
        message: i18n.t("backendHealth.online", "Backend Online"),
        error: null,
        isOnline: true,
      };
    }
    if (saasStatus === "offline") {
      return {
        status: "unhealthy",
        message: unreachable,
        error: unreachable,
        isOnline: false,
      };
    }
    return { status: "starting", message: null, error: null, isOnline: false };
  }

  if (mode === "selfhosted") {
    // Matches the desktop rule: only a confirmed offline server blocks the run,
    // so the button is not dead while the first check is still in flight.
    if (selfHostedStatus === "offline") {
      return {
        status: "unhealthy",
        message: unreachable,
        error: unreachable,
        isOnline: false,
      };
    }
    return {
      status: "healthy",
      message: i18n.t("backendHealth.online", "Backend Online"),
      error: null,
      isOnline: true,
    };
  }

  const notConnected = i18n.t(
    "mobile.account.signedOutBody",
    "Sign in to run tools on Stirling Cloud or your own server.",
  );
  return {
    status: "stopped",
    message: notConnected,
    error: null,
    isOnline: false,
  };
}

/**
 * Backend health for the UI (the Run button, the health indicator).
 *
 * On a phone there is no bundled backend, so "the backend" is whichever server
 * the app is connected to. Health therefore follows the connection mode:
 *
 * - Stirling Cloud: reachability of the cloud API (`saasServerMonitor`).
 * - Self-hosted: the existing `selfHostedServerMonitor`, which the app already
 *   starts when it enters that mode. There is no local backend to fall back to,
 *   so an offline server blocks the run.
 * - Not connected (no server chosen, or signed out): blocked, and the reason
 *   says so rather than blaming a backend that was never meant to exist here.
 *
 * Each monitor is only subscribed to in its own mode, so the app polls one
 * server at most and nothing at all while disconnected.
 */
export function useBackendHealth(): MobileBackendHealth {
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [saasStatus, setSaasStatus] = useState(
    () => saasServerMonitor.getSnapshot().status,
  );
  const [selfHostedStatus, setSelfHostedStatus] = useState(
    () => selfHostedServerMonitor.getSnapshot().status,
  );

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setMode);
    return connectionModeService.subscribeToModeChanges((config) =>
      setMode(config.mode),
    );
  }, []);

  useEffect(() => {
    if (mode !== "saas") {
      return;
    }
    return saasServerMonitor.subscribe((state) => setSaasStatus(state.status));
  }, [mode]);

  useEffect(() => {
    if (mode !== "selfhosted") {
      return;
    }
    return selfHostedServerMonitor.subscribe((state) =>
      setSelfHostedStatus(state.status),
    );
  }, [mode]);

  const checkHealth = useCallback(async () => {
    if (mode === "saas") {
      return saasServerMonitor.checkNow();
    }
    if (mode === "selfhosted") {
      await selfHostedServerMonitor.checkNow();
      return selfHostedServerMonitor.getSnapshot().status !== "offline";
    }
    return false;
  }, [mode]);

  return {
    ...resolveHealth(mode, saasStatus, selfHostedStatus),
    checkHealth,
  };
}
