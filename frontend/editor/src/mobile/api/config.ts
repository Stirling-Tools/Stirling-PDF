import { connectionModeService } from "@app/services/connectionModeService";
import type { AppConfig } from "@app/types/appConfig";
import {
  DEFAULT_APP_CONFIG,
  fetchAppConfig as fetchAppConfigFromServer,
  fetchEndpointsAvailability,
  fetchEndpointEnabled,
  fetchFooterInfo,
  fetchGroupEnabled,
  type EndpointAvailabilityMap,
  type FooterInfo,
} from "@core/api/config";

export {
  DEFAULT_APP_CONFIG,
  fetchEndpointsAvailability,
  fetchEndpointEnabled,
  fetchFooterInfo,
  fetchGroupEnabled,
  type EndpointAvailabilityMap,
  type FooterInfo,
};

/**
 * App config, with Stirling's own user management switched off in cloud mode.
 *
 * `enableLogin` means "this server manages its own users", which turns on the
 * self-hosted account surfaces: the first-login forced password change, the
 * default-credentials warning, MFA enrolment and the admin user screens. In
 * Stirling Cloud none of that applies, because the session comes from the
 * cloud identity provider and the account is not a row in a Stirling server's
 * user table.
 *
 * The desktop app never hits this because it reads app config from the bundled
 * local backend, which ships with security off, so `enableLogin` is false there
 * whatever the cloud reports. A phone has no bundled backend, so config comes
 * from the connected server: in cloud mode that is the cloud API, which
 * correctly reports `enableLogin: true` for its own purposes. Taken at face
 * value that switched a self-hosted-only flow on for a cloud session, and the
 * password change it demanded could never succeed, because the endpoint
 * validates against credentials the cloud identity provider owns.
 *
 * Self-hosted mode is passed through untouched: there `enableLogin` is exactly
 * the question the server is answering, and those surfaces are real.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const config = await fetchAppConfigFromServer();
  const mode = await connectionModeService.getCurrentMode();
  if (mode !== "saas") return config;
  return { ...config, enableLogin: false };
}
