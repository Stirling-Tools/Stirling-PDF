import type { AppConfig } from "@app/types/appConfig";

/**
 * Corrects the parts of the app-config that describe the user's own machine.
 *
 * Almost everything in the config describes the deployment - which tools are
 * enabled, how login works - and the backend answering the request is the right
 * source for all of it. A few fields are different: they describe the computer
 * the app is running on, and a remote backend can only ever answer them for
 * itself.
 *
 * There is nothing to correct in a browser, where the backend and the machine
 * are the same question, so this returns the config untouched. Builds that run
 * a local backend alongside a remote one override it.
 */
export async function applyDeviceCapabilities(
  config: AppConfig,
): Promise<AppConfig> {
  return config;
}
