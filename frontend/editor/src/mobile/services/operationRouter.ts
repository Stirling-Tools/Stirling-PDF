import { connectionModeService } from "@app/services/connectionModeService";
import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import i18n from "@app/i18n";

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

  /** Automation must reach the connected server, which is the only target a phone has. */
  async getConnectedServerBaseUrl(): Promise<string> {
    return this.getBaseUrl();
  }

  /**
   * The connected server's base URL, without a trailing slash, for every
   * operation. Throws when no server is chosen, after asking the settings modal
   * to open on the connection section.
   */
  async getBaseUrl(_operation?: string): Promise<string> {
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
  async shouldSkipBackendReadyCheck(_endpoint?: string): Promise<boolean> {
    return true;
  }

  /** Every request goes to the connected server, so this is true exactly in cloud mode. */
  async willRouteToSaaS(_endpoint: string): Promise<boolean> {
    return (await connectionModeService.getCurrentMode()) === "saas";
  }
}

export const operationRouter = OperationRouter.getInstance();
