import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Whether policy enforcement is active. Gates mounting the headless
 * PolicyAutoRunController. Driven by the backend's `paygEnabled` app-config flag
 * (true only where PAYG metering is active), so policies surface only against a
 * backend that will actually serve them. Shadows the core stub (no
 * implementation); the desktop build shadows this again to read the SaaS
 * backend's flag instead of the local bundled one.
 */
export function usePoliciesEnabled(): boolean {
  const { config } = useAppConfig();
  return Boolean(config?.paygEnabled);
}
