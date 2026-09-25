import { connectionModeService } from "@app/services/connectionModeService";
import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import i18n from "@app/i18n";
import { type ExecutionTarget } from "@desktop/services/operationRouter";

export { type ExecutionTarget };

/**
 * Where an operation runs, on a phone.
 *
 * The desktop router exists to choose between a bundled local backend and a
 * remote server, and it defaults to local for both `saas` and `local` modes.
 * There is no bundled backend on iOS or Android, so every one of those local
 * branches would resolve to a URL that does not exist and throw "Backend URL
 * not available". This router therefore has one rule: always the connected
 * server, never local.
 *
 * That also means no local-capability probing. The desktop version asks the
 * local backend which endpoints it supports before deciding; here the answer
 * is always "none", so the question is skipped and the request goes straight
 * to whichever server the user is connected to.
 */
export class OperationRouter {
  private static instance: OperationRouter;

  static getInstance(): OperationRouter {
    if (!OperationRouter.instance) {
      OperationRouter.instance = new OperationRouter();
    }
    return OperationRouter.instance;
  }

  /** Always remote: there is nothing to execute against on the device. */
  async getExecutionTarget(_operation?: string): Promise<ExecutionTarget> {
    return "remote";
  }

  /** Automation must reach the connected server, which is the only target a phone has. */
  async getConnectedServerBaseUrl(): Promise<string> {
    return this.getBaseUrl();
  }

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

    // `local` is the desktop's offline mode. On a phone it means "no server
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

  async willRouteToSaaS(_endpoint: string): Promise<boolean> {
    return (await connectionModeService.getCurrentMode()) === "saas";
  }
}

export const operationRouter = OperationRouter.getInstance();
