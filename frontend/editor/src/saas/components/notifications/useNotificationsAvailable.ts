import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";

/** The rail lives outside auth providers, so it reads the account published by the mounted app. */
export function useNotificationsAvailable(): boolean {
  const account = useQuickNavHost();
  return Boolean(account?.accountId) && !account?.isAnonymous;
}
