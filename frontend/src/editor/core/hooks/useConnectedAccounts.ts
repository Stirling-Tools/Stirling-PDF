import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import type { AppConfig } from "@editor/types/appConfig";
import {
  connectAccount,
  disconnectAccount,
  fetchConnectedAccounts,
  type CloudProvider,
  type ConnectedAccount,
  type ConnectedAccountsState,
  type ConnectOutcome,
} from "@editor/services/connectedAccountsService";

const EMPTY: ConnectedAccountsState = {
  providers: { microsoft: false, google: false },
  accounts: [],
};

let snapshot: ConnectedAccountsState = EMPTY;
let loaded = false;
let inflight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

const CONFIG_FLAG: Record<
  CloudProvider,
  "microsoftAccountConnections" | "googleDriveAccountConnections"
> = {
  microsoft: "microsoftAccountConnections",
  google: "googleDriveAccountConnections",
};

function providerOffered(
  config: AppConfig | null | undefined,
  provider: CloudProvider,
): boolean {
  return Boolean(config?.[CONFIG_FLAG[provider]]);
}

export function accountConnectionsOffered(
  config: AppConfig | null | undefined,
): boolean {
  return (
    providerOffered(config, "microsoft") || providerOffered(config, "google")
  );
}

function findConnected(
  accounts: ConnectedAccount[],
  provider: CloudProvider,
): ConnectedAccount | undefined {
  return accounts.find(
    (account) =>
      account.provider === provider && account.status === "CONNECTED",
  );
}

function publish(next: ConnectedAccountsState) {
  snapshot = next;
  loaded = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshConnectedAccounts(): Promise<void> {
  if (!inflight) {
    const started = generation;
    const request: Promise<void> = fetchConnectedAccounts()
      .then((next) => {
        if (started === generation) publish(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (inflight === request) inflight = null;
      });
    inflight = request;
  }
  return inflight;
}

export function clearConnectedAccounts() {
  generation++;
  snapshot = EMPTY;
  loaded = false;
  inflight = null;
  listeners.forEach((listener) => listener());
}

export function connectedAccountFor(
  provider: CloudProvider,
): ConnectedAccount | undefined {
  return findConnected(snapshot.accounts, provider);
}

export function latestConnectedAccounts(): ConnectedAccount[] {
  return snapshot.accounts;
}

export async function ensureConnectedAccount(
  provider: CloudProvider,
  connect: (provider: CloudProvider) => Promise<ConnectOutcome>,
): Promise<{ account?: ConnectedAccount; outcome?: ConnectOutcome }> {
  const existing = connectedAccountFor(provider);
  if (existing) {
    return { account: existing };
  }
  const outcome = await connect(provider);
  return { account: connectedAccountFor(provider), outcome };
}

export interface UseConnectedAccounts {
  available: (provider: CloudProvider) => boolean;
  accounts: ConnectedAccount[];
  accountFor: (provider: CloudProvider) => ConnectedAccount | undefined;
  loaded: boolean;
  connect: (provider: CloudProvider) => Promise<ConnectOutcome>;
  disconnect: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConnectedAccounts(): UseConnectedAccounts {
  const { config } = useAppConfig();
  const microsoftOffered = providerOffered(config, "microsoft");
  const googleOffered = providerOffered(config, "google");
  const offered = microsoftOffered || googleOffered;
  const state = useSyncExternalStore(subscribe, () => snapshot);

  useEffect(() => {
    if (offered && !loaded) {
      void refreshConnectedAccounts();
    }
  }, [offered]);

  const available = useCallback(
    (provider: CloudProvider) =>
      provider === "microsoft" ? microsoftOffered : googleOffered,
    [microsoftOffered, googleOffered],
  );

  const accountFor = useCallback(
    (provider: CloudProvider) => findConnected(state.accounts, provider),
    [state.accounts],
  );

  const connect = useCallback(async (provider: CloudProvider) => {
    const outcome = await connectAccount(provider);
    await refreshConnectedAccounts();
    return outcome;
  }, []);

  const disconnect = useCallback(async (id: number) => {
    const started = generation;
    await disconnectAccount(id);
    if (started !== generation) return;
    generation++;
    inflight = null;
    publish({
      ...snapshot,
      accounts: snapshot.accounts.filter((account) => account.id !== id),
    });
    await refreshConnectedAccounts();
  }, []);

  return {
    available,
    accounts: state.accounts,
    accountFor,
    loaded: loaded || !offered,
    connect,
    disconnect,
    refresh: refreshConnectedAccounts,
  };
}
