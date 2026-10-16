import { useAppConfig } from "@app/contexts/AppConfigContext";

/** Self-hosted: the account card comes with login (see the settings nav). */
export function useAccountCardShown(): boolean {
  const { config } = useAppConfig();
  return config?.enableLogin === true;
}
