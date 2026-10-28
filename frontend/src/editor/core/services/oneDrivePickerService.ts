import type {
  AccountInfo,
  IPublicClientApplication,
} from "@azure/msal-browser";
import { absoluteWithBasePath } from "@editor/constants/app";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@editor/styles/zIndex";
import { generateId } from "@editor/utils/generateId";
import { fetchAccessToken } from "@editor/services/connectedAccountsService";
import type { AppConfig } from "@editor/types/appConfig";
import { rememberCloudOrigin } from "@editor/services/cloudOrigin";

export interface OneDriveConfig {
  clientId: string;
  tenant: string;
  graphUrl: string;
}

interface PickerTokens {
  personal: boolean;
  graph(): Promise<string>;
  forResource(resource: string | undefined): Promise<string>;
}

export interface OneDrivePickOptions {
  multiple?: boolean;
  extensions?: string[];
  locale?: string;
  labels?: { title: string; close: string; loading: string };
  folders?: boolean;
}

interface PickerCommand {
  command: string;
  resource?: string;
  type?: string;
  items?: PickedItem[];
}

interface PickedItem {
  id: string;
  name?: string;
  parentReference: { driveId: string };
}

export interface PickedFolder {
  driveId: string;
  folderId: string;
  name: string;
}

interface DriveItemDownload {
  id: string;
  eTag?: string;
  webUrl?: string;
  parentReference?: { driveId?: string; id?: string };
  name: string;
  file?: { mimeType?: string };
  lastModifiedDateTime?: string;
  "@microsoft.graph.downloadUrl"?: string;
}

const DEFAULT_GRAPH_URL = "https://graph.microsoft.com/v1.0";
const PICKER_SETTLE_MS = 1200;
const PICKER_REVEAL_FALLBACK_MS = 15000;
const GRAPH_READ_SCOPES = ["Files.Read.All"];
const PERSONAL_PICKER_URL = "https://onedrive.live.com/picker";
const PERSONAL_PICKER_SCOPES = ["OneDrive.ReadOnly"];
const PERSONAL_ACCOUNTS_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
export const ONEDRIVE_REDIRECT_PATH = "msal-redirect.html";

class OneDrivePickerService {
  private app: IPublicClientApplication | null = null;
  private appKey: string | null = null;
  private interactionRequired:
    | typeof import("@azure/msal-browser").InteractionRequiredAuthError
    | null = null;
  private open = false;
  private graphUrl = DEFAULT_GRAPH_URL;

  async initialize(config: OneDriveConfig): Promise<void> {
    this.graphUrl = config.graphUrl.replace(/\/$/, "");
    const key = `${config.clientId}|${config.tenant}`;
    if (this.app && this.appKey === key) {
      return;
    }
    const msal = await import("@azure/msal-browser");
    this.interactionRequired = msal.InteractionRequiredAuthError;
    this.app = await msal.createStandardPublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}`,
        redirectUri: absoluteWithBasePath(ONEDRIVE_REDIRECT_PATH),
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    this.appKey = key;
  }

  async pick(
    options: OneDrivePickOptions = {},
    connected?: { accountId: number },
  ): Promise<File[]> {
    if (this.open) {
      return [];
    }
    this.open = true;
    try {
      const tokens = connected
        ? this.accountTokens(connected.accountId)
        : await this.msalTokens();
      const baseUrl = tokens.personal
        ? PERSONAL_PICKER_URL
        : await this.businessPickerBaseUrl(tokens);
      const items = await this.showPicker(tokens, baseUrl, options);
      if (items.length === 0) {
        return [];
      }
      const graphToken = await tokens.graph();
      return await Promise.all(
        items.map(async (item) => {
          const { file, details } = await this.download(item, graphToken);
          if (connected) {
            rememberCloudOrigin(file, {
              provider: "onedrive",
              accountId: connected.accountId,
              driveId:
                details.parentReference?.driveId ??
                item.parentReference.driveId,
              itemId: details.id ?? item.id,
              parentId: details.parentReference?.id ?? null,
              name: details.name,
              eTag: details.eTag ?? null,
              webUrl: details.webUrl ?? null,
            });
          }
          return file;
        }),
      );
    } finally {
      this.open = false;
    }
  }

  async pickFolder(
    options: OneDrivePickOptions,
    connected: { accountId: number },
  ): Promise<PickedFolder | null> {
    if (this.open) {
      return null;
    }
    this.open = true;
    try {
      const tokens = this.accountTokens(connected.accountId);
      const baseUrl = await this.businessPickerBaseUrl(tokens);
      const [folder] = await this.showPicker(tokens, baseUrl, {
        ...options,
        multiple: false,
        folders: true,
      });
      if (!folder) {
        return null;
      }
      return {
        driveId: folder.parentReference.driveId,
        folderId: folder.id,
        name: folder.name ?? "",
      };
    } finally {
      this.open = false;
    }
  }

  signOut(): void {
    const account = this.app?.getActiveAccount();
    if (this.app && account) {
      void this.app.clearCache({ account });
    }
  }

  private accountTokens(accountId: number): PickerTokens {
    return {
      personal: false,
      graph: () => fetchAccessToken(accountId, "graph"),
      forResource: (resource) => {
        if (!resource) {
          throw new Error(
            "The picker asked for a token without naming a resource",
          );
        }
        return fetchAccessToken(accountId, new URL(resource).origin);
      },
    };
  }

  private async msalTokens(): Promise<PickerTokens> {
    const account = await this.signIn();
    const personal = account.tenantId === PERSONAL_ACCOUNTS_TENANT;
    return {
      personal,
      graph: () => this.token(account, GRAPH_READ_SCOPES),
      forResource: (resource) =>
        this.token(account, this.pickerScopes(personal, resource)),
    };
  }

  private requireApp(): IPublicClientApplication {
    if (!this.app) {
      throw new Error("OneDrive is not initialized");
    }
    return this.app;
  }

  private async signIn(): Promise<AccountInfo> {
    const app = this.requireApp();
    const existing = app.getActiveAccount() ?? app.getAllAccounts()[0];
    if (existing) {
      app.setActiveAccount(existing);
      return existing;
    }
    const result = await app.loginPopup({
      scopes: GRAPH_READ_SCOPES,
      prompt: "select_account",
    });
    app.setActiveAccount(result.account);
    return result.account;
  }

  private async token(account: AccountInfo, scopes: string[]): Promise<string> {
    const app = this.requireApp();
    try {
      return (await app.acquireTokenSilent({ scopes, account })).accessToken;
    } catch (error) {
      if (
        this.interactionRequired &&
        error instanceof this.interactionRequired
      ) {
        return (await app.acquireTokenPopup({ scopes, account })).accessToken;
      }
      throw error;
    }
  }

  private async businessPickerBaseUrl(tokens: PickerTokens): Promise<string> {
    const graphToken = await tokens.graph();
    for (const path of [
      "/me/drive?$select=webUrl",
      "/sites/root?$select=webUrl",
    ]) {
      const response = await fetch(`${this.graphUrl}${path}`, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (response.ok) {
        const { webUrl } = (await response.json()) as { webUrl?: string };
        if (webUrl) {
          return new URL(webUrl).origin;
        }
      }
    }
    throw new Error(
      "Could not find a OneDrive or SharePoint site for this account",
    );
  }

  private pickerScopes(
    personal: boolean,
    resource: string | undefined,
  ): string[] {
    if (personal) {
      return PERSONAL_PICKER_SCOPES;
    }
    if (!resource) {
      throw new Error("The picker asked for a token without naming a resource");
    }
    return [`${new URL(resource).origin}/.default`];
  }

  private async showPicker(
    tokens: PickerTokens,
    baseUrl: string,
    options: OneDrivePickOptions,
  ): Promise<PickedItem[]> {
    const personal = tokens.personal;
    const initialToken = await tokens.forResource(baseUrl);
    const channelId = generateId();
    const pickerOptions = {
      sdk: "8.0",
      entry: { oneDrive: { files: {} } },
      authentication: {},
      messaging: { origin: window.location.origin, channelId },
      selection: { mode: options.multiple === false ? "single" : "multiple" },
      theme:
        document.documentElement.dataset.theme === "dark" ? "dark" : "default",
      accessibility: { enableFocusTrap: true },
      typesAndSources: {
        mode: options.folders ? "folders" : "files",
        ...(!options.folders &&
        options.extensions &&
        options.extensions.length > 0
          ? { filters: options.extensions }
          : {}),
        pivots: { oneDrive: true, recent: true, sharedLibraries: !personal },
      },
    };
    const query = new URLSearchParams({
      filePicker: JSON.stringify(pickerOptions),
      locale: (options.locale ?? "en-us").toLowerCase(),
    });

    const overlay = createOverlay(
      options.labels ?? {
        title: "OneDrive",
        close: "Close",
        loading: "Connecting to OneDrive…",
      },
    );
    const pickerUrl = personal
      ? `${baseUrl}?${query}`
      : `${baseUrl}/_layouts/15/FilePicker.aspx?${query}`;

    return new Promise<PickedItem[]>((resolve, reject) => {
      let port: MessagePort | null = null;
      let settled = false;

      let revealTimer: ReturnType<typeof setTimeout> | undefined;
      const reveal = (delayMs: number) => {
        clearTimeout(revealTimer);
        revealTimer = setTimeout(() => {
          overlay.frame.style.opacity = "1";
        }, delayMs);
      };

      const finish = (items: PickedItem[] | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(revealTimer);
        window.removeEventListener("message", onWindowMessage);
        document.removeEventListener("keydown", onKeyDown, true);
        port?.close();
        overlay.root.remove();
        if (items instanceof Error) reject(items);
        else resolve(items);
      };

      const reply = (id: string, data: Record<string, unknown>) =>
        port?.postMessage({ type: "result", id, data });

      const onCommand = async (id: string, command: PickerCommand) => {
        port?.postMessage({ type: "acknowledge", id });
        switch (command.command) {
          case "authenticate":
            try {
              const token = await tokens.forResource(command.resource);
              reply(id, { result: "token", token });
              reveal(PICKER_SETTLE_MS);
            } catch (error) {
              reply(id, {
                result: "error",
                error: {
                  code: "unableToObtainToken",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              });
            }
            break;
          case "pick":
            reply(id, { result: "success" });
            finish(command.items ?? []);
            break;
          case "close":
            finish([]);
            break;
          default:
            reply(id, {
              result: "error",
              error: { code: "unsupportedCommand", message: command.command },
            });
        }
      };

      const onWindowMessage = (event: MessageEvent) => {
        if (event.source !== overlay.frame.contentWindow) return;
        const message = event.data as { type?: string; channelId?: string };
        if (message?.type !== "initialize" || message.channelId !== channelId) {
          return;
        }
        port = event.ports[0];
        reveal(PICKER_REVEAL_FALLBACK_MS);
        port.addEventListener("message", (portEvent: MessageEvent) => {
          const payload = portEvent.data as {
            type?: string;
            id?: string;
            data?: PickerCommand;
          };
          if (payload.type === "command" && payload.id && payload.data) {
            void onCommand(payload.id, payload.data);
          }
        });
        port.start();
        port.postMessage({ type: "activate" });
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          finish([]);
        }
      };

      window.addEventListener("message", onWindowMessage);
      document.addEventListener("keydown", onKeyDown, true);
      overlay.closeButton.addEventListener("click", () => finish([]));
      overlay.root.addEventListener("click", (event) => {
        if (event.target === overlay.root) finish([]);
      });

      try {
        submitIntoFrame(overlay.frame, pickerUrl, initialToken);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async download(
    item: PickedItem,
    graphToken: string,
  ): Promise<{ file: File; details: DriveItemDownload }> {
    const driveId = encodeURIComponent(item.parentReference.driveId);
    const itemId = encodeURIComponent(item.id);
    const metadata = await fetch(
      `${this.graphUrl}/drives/${driveId}/items/${itemId}?$select=id,name,eTag,webUrl,parentReference,file,lastModifiedDateTime,content.downloadUrl`,
      { headers: { Authorization: `Bearer ${graphToken}` } },
    );
    if (!metadata.ok) {
      throw new Error(
        `Could not read ${item.name ?? "the file"} from OneDrive (HTTP ${metadata.status})`,
      );
    }
    const details = (await metadata.json()) as DriveItemDownload;
    const downloadUrl = details["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      throw new Error(`${details.name} cannot be downloaded`);
    }
    const content = await fetch(downloadUrl);
    if (!content.ok) {
      throw new Error(
        `Could not download ${details.name} (HTTP ${content.status})`,
      );
    }
    const blob = await content.blob();
    const file = new File([blob], details.name, {
      type: details.file?.mimeType ?? blob.type,
      lastModified: details.lastModifiedDateTime
        ? Date.parse(details.lastModifiedDateTime)
        : Date.now(),
    });
    return { file, details };
  }
}

interface PickerOverlay {
  root: HTMLDivElement;
  frame: HTMLIFrameElement;
  closeButton: HTMLButtonElement;
}

function createOverlay(labels: {
  title: string;
  close: string;
  loading: string;
}): PickerOverlay {
  const root = document.createElement("div");
  root.dataset.testid = "onedrive-picker";
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: String(Z_INDEX_OVER_FILE_MANAGER_MODAL),
    background: "var(--c-overlay)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  });

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    display: "flex",
    flexDirection: "column",
    width: "min(1080px, 100%)",
    height: "min(724px, 100%)",
    borderRadius: "var(--radius-lg, 12px)",
    overflow: "hidden",
    background: "var(--c-modal-surface, var(--c-surface))",
    boxShadow: "var(--shadow-xl)",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flex: "0 0 44px",
    padding: "0 8px 0 16px",
    borderBottom: "1px solid var(--c-border-subtle)",
    color: "var(--c-text)",
    fontSize: "14px",
    fontWeight: "600",
  });
  const title = document.createElement("span");
  title.textContent = labels.title;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", labels.close);
  closeButton.textContent = "×";
  Object.assign(closeButton.style, {
    width: "32px",
    height: "32px",
    border: "0",
    borderRadius: "50%",
    background: "transparent",
    color: "var(--c-text-muted)",
    fontSize: "22px",
    lineHeight: "1",
    cursor: "pointer",
  });
  header.append(title, closeButton);

  const body = document.createElement("div");
  Object.assign(body.style, { position: "relative", flex: "1 1 auto" });

  const frame = document.createElement("iframe");
  frame.name = `onedrive-picker-${generateId()}`;
  frame.title = labels.title;
  Object.assign(frame.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
    background: "transparent",
    opacity: "0",
    transition: "opacity 150ms ease-in",
  });

  const loading = document.createElement("div");
  loading.dataset.testid = "onedrive-picker-loading";
  loading.setAttribute("role", "status");
  Object.assign(loading.style, {
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    background: "var(--c-modal-surface, var(--c-surface))",
    color: "var(--c-text-muted)",
    fontSize: "14px",
  });
  const spinner = document.createElement("div");
  Object.assign(spinner.style, {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "3px solid var(--c-border)",
    borderTopColor: "var(--c-primary)",
  });
  spinner.animate?.(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 900, iterations: Infinity },
  );
  const message = document.createElement("span");
  message.textContent = labels.loading;
  loading.append(spinner, message);

  body.append(loading, frame);
  panel.append(header, body);
  root.append(panel);
  document.body.append(root);
  return { root, frame, closeButton };
}

function submitIntoFrame(
  frame: HTMLIFrameElement,
  url: string,
  accessToken: string,
): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.target = frame.name;
  form.style.display = "none";
  const token = document.createElement("input");
  token.type = "hidden";
  token.name = "access_token";
  token.value = accessToken;
  form.append(token);
  document.body.append(form);
  form.submit();
  form.remove();
}

let serviceInstance: OneDrivePickerService | null = null;

export function getOneDrivePickerService(): OneDrivePickerService {
  if (!serviceInstance) {
    serviceInstance = new OneDrivePickerService();
  }
  return serviceInstance;
}

export function getOneDriveConfig(
  appConfig: AppConfig | null | undefined,
): OneDriveConfig | null {
  if (!appConfig?.microsoftEnabled || !appConfig.microsoftClientId) {
    return null;
  }
  return {
    clientId: appConfig.microsoftClientId,
    tenant: appConfig.microsoftTenant || "common",
    graphUrl: appConfig.microsoftGraphUrl || DEFAULT_GRAPH_URL,
  };
}

export function acceptToExtensions(accept?: string): string[] {
  if (!accept) return [];
  return accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.startsWith("."));
}
