import { useSaasAppConfig } from "@app/hooks/useSaasAppConfig";

/**
 * Desktop: the AI engine runs on the SaaS backend, so its enabled flag must come
 * from the SaaS app-config (not the local bundled backend, which never has the
 * engine). useSaasAppConfig() returns null outside SaaS mode, so AI is implicitly
 * hidden in local/self-hosted — and the cloud retains the on/off switch (flip
 * aiEngineEnabled server-side and the desktop FAB disappears on next load, no
 * release required).
 */
export function useAiEngineEnabled(): boolean {
  return Boolean(useSaasAppConfig()?.aiEngineEnabled);
}
