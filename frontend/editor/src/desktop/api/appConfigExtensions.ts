import { getHardwareSigningCapabilities } from "@app/services/hardwareSigningService";
import type { AppConfig } from "@app/types/appConfig";

/**
 * Re-answers `hardwareSigningAvailable` from the machine the app is running on.
 *
 * Here the backend answering the config and the computer the user is sitting at
 * can be two different things. Connected to a self-hosted server, the config
 * comes from that server, and it reports `hardwareSigningAvailable: false` -
 * truthfully, about itself. The certificate store and any plugged-in token are
 * on this machine, so the app then hid "This device" as a signing source even
 * though it was perfectly usable (#7316).
 *
 * The capabilities endpoint is device-local (see
 * @app/constants/deviceLocalEndpoints), so it always reaches the bundled
 * backend and describes this machine. Every other field is left as the backend
 * sent it: those describe the deployment, and there the server is the authority.
 *
 * A failure is not worth breaking startup for - the config still loads, and
 * hardware signing simply stays as the backend reported it.
 */
export async function applyDeviceCapabilities(
  config: AppConfig,
): Promise<AppConfig> {
  try {
    const capabilities = await getHardwareSigningCapabilities();
    return { ...config, hardwareSigningAvailable: capabilities.desktop };
  } catch (error) {
    console.debug(
      "[appConfigExtensions] Could not read local hardware signing capabilities; keeping the backend's value",
      error,
    );
    return config;
  }
}
