import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";

/**
 * Desktop: the account card concerns a self-hosted server, so it shows only
 * while signed in to one (see the settings nav).
 */
export function useAccountCardShown(): boolean {
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();
  return isSelfHosted && isAuthenticated;
}
