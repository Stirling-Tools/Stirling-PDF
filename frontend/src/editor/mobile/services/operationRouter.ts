import { connectionModeService } from "@editor/services/connectionModeService";
import { STIRLING_SAAS_BACKEND_API_URL } from "@editor/constants/connection";
import i18n from "@editor/i18n";
import {
  isServerAutomationEndpoint,
  resolveAuthenticatedServerBaseUrl,
} from "@editor/services/authenticatedServerBaseUrl";

/**
 * Where an operation runs, on a phone.
 *
 * There is no bundled backend on iOS or Android, so the rule is always the
 * connected server, never local, and there is no local-capability probing.
 */
export class OperationRouter {
  private static instance: OperationRouter;

  static getInstance(): OperationRouter {
    if (!OperationRouter.instance) {
      OperationRouter.instance = new OperationRouter();
    }
    return OperationRouter.instance;
  }

  /** The signed-in server, for automation and AI; see resolveAuthenticatedServerBaseUrl. */
  async getConnectedServerBaseUrl(): Promise<string> {
    return resolveAuthenticatedServerBaseUrl();
  }

  /**
   * The connected server's base URL, without a trailing slash, for every
   * operation. Throws when no server is chosen, after asking the settings modal
   * to open on the connection section.
   */
  async getBaseUrl(
    operation?: string,
    _endpointName?: string,
  ): Promise<string> {
    if (isServerAutomationEndpoint(operation)) {
      return resolveAuthenticatedServerBaseUrl();
    }
    const mode = await connectionModeService.getCurrentMode();

    if (mode === "saas") {
      if (!STIRLING_SAAS_BACKEND_API_URL) {
        throw new Error(
          "VITE_SAAS_BACKEND_API_URL is not configured for this build.",
        );
      }
      return STIRLING_SAAS_BACKEND_API_URL.replace(/\/$/, "");
    }

    if (mode === "selfhosted") {
      const serverConfig = await connectionModeService.getServerConfig();
      if (!serverConfig?.url) {
        throw new Error(
          i18n.t(
            "mobile.notConnected",
            "You are not connected to a server. Sign in to Stirling Cloud or add your own server.",
          ),
        );
      }
      return serverConfig.url.replace(/\/$/, "");
    }

    // `local` is the bundled-backend mode. On a phone it means "no server
    // chosen yet", so point the user at the place that fixes it rather than
    // failing with a backend error they cannot act on.
    window.dispatchEvent(
      new CustomEvent("appConfig:navigate", {
        detail: { key: "connectionMode" },
      }),
    );
    throw new Error(
      i18n.t(
        "mobile.notConnected",
        "You are not connected to a server. Sign in to Stirling Cloud or add your own server.",
      ),
    );
  }

  async isSelfHostedMode(): Promise<boolean> {
    return (await connectionModeService.getCurrentMode()) === "selfhosted";
  }

  async isSaaSMode(): Promise<boolean> {
    return (await connectionModeService.getCurrentMode()) === "saas";
  }

  /**
   * Always true. The check this skips is "is the local bundled backend up",
   * which has no meaning here; server reachability is handled by the health
   * monitors that `useBackendHealth` reads.
   */
  async shouldSkipBackendReadyCheck(
    _endpoint?: string,
    _endpointName?: string,
  ): Promise<boolean> {
    return true;
  }

  /** Every request goes to the connected server, so this is true exactly in cloud mode. */
  async willRouteToSaaS(_endpoint: string): Promise<boolean> {
    return (await connectionModeService.getCurrentMode()) === "saas";
  }
}

export const operationRouter = OperationRouter.getInstance();
