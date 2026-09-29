import { getHardwareSigningCapabilities } from "@app/services/hardwareSigningService";
import type { AppConfig } from "@app/types/appConfig";

/** Ample for a backend that is up; the config load waits on it. */
const CAPABILITIES_TIMEOUT_MS = 5000;

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
 * hardware signing simply stays as the backend reported it. Nor is a slow
 * answer: the desktop HTTP client applies no timeout of its own, so the wait is
 * bounded here. DesktopConfigSync refetches the config, and so asks again, once
 * the bundled backend is healthy.
 */
export async function applyDeviceCapabilities(
  config: AppConfig,
): Promise<AppConfig> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const capabilities = await Promise.race([
      getHardwareSigningCapabilities(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("No answer from the local backend")),
          CAPABILITIES_TIMEOUT_MS,
        );
      }),
    ]);
    return { ...config, hardwareSigningAvailable: capabilities.desktop };
  } catch (error) {
    console.debug(
      "[appConfigExtensions] Could not read local hardware signing capabilities; keeping the backend's value",
      error,
    );
    return config;
  } finally {
    clearTimeout(timer);
  }
}
