import { fetchAppConfig as fetchCoreAppConfig } from "@core/api/config";
import { getHardwareSigningCapabilities } from "@app/services/hardwareSigningService";
import type { AppConfig } from "@app/types/appConfig";

// Everything else behaves exactly as in core; only the app-config call is wrapped.
export {
  DEFAULT_APP_CONFIG,
  fetchEndpointsAvailability,
  fetchEndpointEnabled,
  fetchFooterInfo,
  fetchGroupEnabled,
} from "@core/api/config";
export type { EndpointAvailabilityMap, FooterInfo } from "@core/api/config";

/**
 * The app-config, with `hardwareSigningAvailable` answered by this machine.
 *
 * That flag is the odd one out in the config: everything else describes the
 * deployment - which tools are on, how login works - and rightly comes from
 * whichever backend the app is talking to. This one describes the computer the
 * user is sitting at, and a self-hosted server can only ever answer for itself.
 * It says `false`, and the desktop then hides "This device" as a certificate
 * source, even though the store and any plugged-in token are right there. That
 * is the bug in #7316.
 *
 * So the flag is re-answered locally: the capabilities endpoint is device-local
 * (see @app/constants/deviceLocalEndpoints), so it reaches the bundled backend
 * whatever the connection mode. Every other field is left untouched - the
 * server's view of its own deployment is the correct one.
 *
 * A failure here is not worth breaking startup for: the config still loads and
 * hardware signing simply stays as the server reported it.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const config = await fetchCoreAppConfig();

  try {
    const capabilities = await getHardwareSigningCapabilities();
    return { ...config, hardwareSigningAvailable: capabilities.desktop };
  } catch (error) {
    console.debug(
      "[desktop/api/config] Could not read local hardware signing capabilities; keeping the backend's value",
      error,
    );
    return config;
  }
}
