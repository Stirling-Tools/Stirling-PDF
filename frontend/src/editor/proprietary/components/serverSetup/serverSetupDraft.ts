/**
 * The answers the first-run setup wizard collects, and how they map onto
 * settings.yml keys. The wizard only ever saves keys whose value differs from
 * what the server already has, so a skipped step or an untouched field leaves
 * the server's own default (including env overrides) in place.
 */

import { EMBEDDING_MODEL_SUGGESTIONS } from "@app/components/shared/config/configSections/aiEngineSettings";

export type SetupMode = "quick" | "custom";

export type SetupStepId =
  | "addresses"
  | "language"
  | "signIn"
  | "email"
  | "files"
  | "ai"
  | "analytics"
  | "password"
  | "summary";

/** The settings each mode asks about; anything else keeps the server's value. */
export const SETUP_STEPS: Record<SetupMode, SetupStepId[]> = {
  quick: ["addresses", "signIn", "email", "ai", "analytics"],
  custom: [
    "addresses",
    "language",
    "signIn",
    "email",
    "files",
    "ai",
    "analytics",
  ],
};

/** Quick start shows these together on one summary card. */
export const QUICK_SUMMARY_STEPS: SetupStepId[] = [
  "addresses",
  "signIn",
  "email",
  "ai",
];

/**
 * The numbered cards after the mode choice. Quick start's settings share one
 * summary card before Analytics. The password, when one is owed, is set on
 * its own card before any of these and is not a setting.
 */
export function stepsFor(mode: SetupMode): SetupStepId[] {
  return mode === "quick" ? ["summary", "analytics"] : SETUP_STEPS.custom;
}

/**
 * Issuer fields `step` would save with a new value. Each must answer OIDC
 * discovery before saving: the server reads them on boot, and one it cannot
 * reach stops sign-in from registering. Unchanged ones are already in use.
 */
export function issuersToCheck(
  step: SetupStepId,
  draft: ServerSetupDraft,
  initial: ServerSetupDraft,
): "oauthIssuer"[] {
  const covers = step === "summary" ? QUICK_SUMMARY_STEPS : [step];
  return covers.includes("signIn") &&
    loginNeedsIssuer(draft.login) &&
    trimUrl(draft.oauthIssuer) !== trimUrl(initial.oauthIssuer)
    ? ["oauthIssuer"]
    : [];
}

/**
 * The sign-in fields for switching to `login`: the server's own values when
 * going back to the method it already uses, blank otherwise. Carrying values
 * over would hand one provider's (often masked) secret to another.
 */
export function loginChange(
  login: LoginMethod,
  initial: ServerSetupDraft,
): Partial<ServerSetupDraft> {
  if (login === initial.login) {
    return {
      login,
      oauthIssuer: initial.oauthIssuer,
      oauthClientId: initial.oauthClientId,
      oauthClientSecret: initial.oauthClientSecret,
      oauthProviderName: initial.oauthProviderName,
    };
  }
  return {
    login,
    oauthIssuer: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthProviderName: "",
  };
}

/** The same for the AI model provider, whose API key and base URL are its own. */
export function aiProviderChange(
  provider: AiProvider,
  initial: ServerSetupDraft,
): Partial<ServerSetupDraft> {
  return provider === initial.aiProvider
    ? {
        aiProvider: provider,
        aiApiKey: initial.aiApiKey,
        aiBaseUrl: initial.aiBaseUrl,
      }
    : { aiProvider: provider, aiApiKey: "", aiBaseUrl: "" };
}

/**
 * The same for the embedding provider. A new provider starts on its first
 * suggested model, since the previous provider's model name means nothing to it.
 */
export function embeddingProviderChange(
  provider: EmbeddingProvider,
  initial: ServerSetupDraft,
): Partial<ServerSetupDraft> {
  return provider === initial.embeddingProvider
    ? {
        embeddingProvider: provider,
        embeddingModel: initial.embeddingModel,
        embeddingApiKey: initial.embeddingApiKey,
        embeddingBaseUrl: initial.embeddingBaseUrl,
      }
    : {
        embeddingProvider: provider,
        embeddingModel: EMBEDDING_MODEL_SUGGESTIONS[provider]?.[0] ?? "",
        embeddingApiKey: "",
        embeddingBaseUrl: "",
      };
}

/** Field errors across several steps, as one map (their fields never overlap). */
export function validateSteps(
  steps: SetupStepId[],
  draft: ServerSetupDraft,
  mode: SetupMode,
): StepErrors {
  return steps.reduce<StepErrors>(
    (all, step) => ({ ...all, ...validateStep(step, draft, mode) }),
    {},
  );
}

export type LoginMethod =
  | "password"
  | "google"
  | "github"
  | "keycloak"
  | "oidc";

/** "stirling" is only ever read back from a server already on Stirling AI. */
export type AiChoice = "off" | "custom" | "stirling";

export type AiProvider = "anthropic" | "openai" | "ollama" | "custom";

export type EmbeddingProvider = "voyageai" | "openai" | "ollama" | "custom";

/** How MCP clients sign in: OAuth needs an identity provider, so setup only turns on API keys. */
export type McpAuthMode = "oauth" | "apikey";

export interface ServerSetupDraft {
  frontendUrl: string;
  backendUrl: string;
  defaultLocale: string;
  login: LoginMethod;
  oauthIssuer: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthProviderName: string;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpFrom: string;
  storageEnabled: boolean;
  sharingEnabled: boolean;
  ai: AiChoice;
  aiEngineUrl: string;
  aiProvider: AiProvider;
  aiApiKey: string;
  aiBaseUrl: string;
  aiFastModel: string;
  aiSmartModel: string;
  documentQuestions: boolean;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  embeddingApiKey: string;
  embeddingBaseUrl: string;
  mcpEnabled: boolean;
  mcpAuthMode: McpAuthMode;
  analytics: boolean | null;
  adminUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** The draft fields each step edits; Skip restores these to the server's values. */
export const STEP_FIELDS: Record<SetupStepId, (keyof ServerSetupDraft)[]> = {
  addresses: ["frontendUrl", "backendUrl"],
  language: ["defaultLocale"],
  signIn: [
    "login",
    "oauthIssuer",
    "oauthClientId",
    "oauthClientSecret",
    "oauthProviderName",
  ],
  email: [
    "emailEnabled",
    "smtpHost",
    "smtpPort",
    "smtpUsername",
    "smtpPassword",
    "smtpFrom",
  ],
  files: ["storageEnabled", "sharingEnabled"],
  ai: [
    "ai",
    "aiEngineUrl",
    "aiProvider",
    "aiApiKey",
    "aiBaseUrl",
    "aiFastModel",
    "aiSmartModel",
    "documentQuestions",
    "embeddingProvider",
    "embeddingModel",
    "embeddingApiKey",
    "embeddingBaseUrl",
    "mcpEnabled",
    "mcpAuthMode",
  ],
  analytics: ["analytics"],
  password: [
    "adminUsername",
    "currentPassword",
    "newPassword",
    "confirmPassword",
  ],
  summary: [],
};

/** Providers whose models are reached through an OpenAI-compatible base URL. */
export function providerNeedsBaseUrl(
  provider: AiProvider | EmbeddingProvider,
): boolean {
  return provider === "ollama" || provider === "custom";
}

/** Ollama runs locally and takes no key. */
export function embeddingNeedsApiKey(provider: EmbeddingProvider): boolean {
  return provider !== "ollama";
}

export function loginNeedsIssuer(login: LoginMethod): boolean {
  return login === "keycloak" || login === "oidc";
}

/**
 * The OAuth callback the identity provider must allow. Mirrors
 * OAuth2Configuration.REDIRECT_URI_PATH, whose registration id is the provider
 * key for the named providers and the provider name for generic OIDC.
 */
export function oauthRedirectUri(draft: ServerSetupDraft): string {
  const registrationId =
    draft.login === "oidc" ? draft.oauthProviderName.trim() : draft.login;
  return `${trimUrl(draft.backendUrl)}/login/oauth2/code/${registrationId}`;
}

type Settings = Record<string, unknown>;

function read(settings: Settings, path: string): unknown {
  let node: unknown = settings;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Settings)[part];
  }
  return node;
}

function readString(settings: Settings, path: string): string {
  const value = read(settings, path);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function readBool(settings: Settings, path: string): boolean {
  return read(settings, path) === true;
}

function readLogin(settings: Settings): LoginMethod {
  if (!readBool(settings, "security.oauth2.enabled")) return "password";
  if (readString(settings, "security.oauth2.client.google.clientId"))
    return "google";
  if (readString(settings, "security.oauth2.client.github.clientId"))
    return "github";
  if (readString(settings, "security.oauth2.client.keycloak.clientId"))
    return "keycloak";
  return "oidc";
}

function oauthPrefix(login: LoginMethod): string {
  switch (login) {
    case "google":
    case "github":
    case "keycloak":
      return `security.oauth2.client.${login}`;
    default:
      return "security.oauth2";
  }
}

function readAi(settings: Settings): AiChoice {
  if (!readBool(settings, "aiEngine.enabled")) return "off";
  return read(settings, "aiEngine.mode") === "CLOUD" ? "stirling" : "custom";
}

function readProvider(settings: Settings): AiProvider {
  const value = readString(settings, "aiEngine.models.provider");
  return value === "openai" || value === "ollama" || value === "custom"
    ? value
    : "anthropic";
}

function readEmbeddingProvider(settings: Settings): EmbeddingProvider {
  const value = readString(settings, "aiEngine.rag.embeddingProvider");
  return value === "openai" || value === "ollama" || value === "custom"
    ? value
    : "voyageai";
}

/** How GET /api/v1/admin/settings returns a secret. */
const MASKED_SECRET = "********";

/** settings.yml.template's sample host; shown empty so it is never saved as real. */
const TEMPLATE_SMTP_HOST = "smtp.example.com";

/**
 * The draft as the server currently stands. `settings` is the body of
 * GET /api/v1/admin/settings, where secrets come back masked; a masked secret
 * left untouched is never written back.
 */
export function draftFromSettings(settings: Settings): ServerSetupDraft {
  const login = readLogin(settings);
  const prefix = oauthPrefix(login);
  const analytics = read(settings, "system.enableAnalytics");
  return {
    frontendUrl: readString(settings, "system.frontendUrl"),
    backendUrl: readString(settings, "system.backendUrl"),
    defaultLocale: readString(settings, "system.defaultLocale"),
    login,
    oauthIssuer:
      login === "password" ? "" : readString(settings, `${prefix}.issuer`),
    oauthClientId:
      login === "password" ? "" : readString(settings, `${prefix}.clientId`),
    oauthClientSecret:
      login === "password"
        ? ""
        : readString(settings, `${prefix}.clientSecret`),
    oauthProviderName:
      login === "oidc" ? readString(settings, "security.oauth2.provider") : "",
    emailEnabled: readBool(settings, "mail.enabled"),
    smtpHost:
      readString(settings, "mail.host") === TEMPLATE_SMTP_HOST
        ? ""
        : readString(settings, "mail.host"),
    smtpPort: readString(settings, "mail.port"),
    smtpUsername: readString(settings, "mail.username"),
    smtpPassword: readString(settings, "mail.password"),
    smtpFrom: readString(settings, "mail.from"),
    storageEnabled: readBool(settings, "storage.enabled"),
    sharingEnabled: readBool(settings, "storage.sharing.enabled"),
    ai: readAi(settings),
    aiEngineUrl: readString(settings, "aiEngine.url"),
    aiProvider: readProvider(settings),
    aiApiKey: readString(settings, "aiEngine.models.apiKey"),
    aiBaseUrl: readString(settings, "aiEngine.models.baseUrl"),
    aiFastModel: readString(settings, "aiEngine.models.fastModel"),
    aiSmartModel: readString(settings, "aiEngine.models.smartModel"),
    documentQuestions: readBool(
      settings,
      "aiEngine.features.documentQuestions",
    ),
    embeddingProvider: readEmbeddingProvider(settings),
    embeddingModel: readString(settings, "aiEngine.rag.embeddingModel"),
    embeddingApiKey: readString(settings, "aiEngine.rag.embeddingApiKey"),
    embeddingBaseUrl: readString(settings, "aiEngine.rag.embeddingBaseUrl"),
    mcpEnabled: readBool(settings, "mcp.enabled"),
    mcpAuthMode:
      readString(settings, "mcp.auth.mode") === "apikey" ? "apikey" : "oauth",
    analytics: typeof analytics === "boolean" ? analytics : null,
    adminUsername: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  };
}

/**
 * Fills addresses the server has not set from the page's own origin. Applied
 * to the draft only, so the prefilled value counts as a change and is saved.
 */
export function prefillAddresses(
  draft: ServerSetupDraft,
  origin: string,
): ServerSetupDraft {
  const frontendUrl = draft.frontendUrl || origin;
  return {
    ...draft,
    frontendUrl,
    backendUrl: draft.backendUrl || frontendUrl,
  };
}

function trimUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function loginSettings(draft: ServerSetupDraft): Settings {
  if (draft.login === "password") return { "security.oauth2.enabled": false };
  const prefix = oauthPrefix(draft.login);
  const settings: Settings = {
    "security.oauth2.enabled": true,
    [`${prefix}.clientId`]: draft.oauthClientId.trim(),
    [`${prefix}.clientSecret`]: draft.oauthClientSecret.trim(),
  };
  if (loginNeedsIssuer(draft.login)) {
    settings[`${prefix}.issuer`] = trimUrl(draft.oauthIssuer);
  }
  if (draft.login === "oidc") {
    settings["security.oauth2.provider"] = draft.oauthProviderName.trim();
  }
  return settings;
}

function emailSettings(draft: ServerSetupDraft): Settings {
  if (!draft.emailEnabled) return { "mail.enabled": false };
  const port = Number(draft.smtpPort);
  return {
    "mail.enabled": true,
    "mail.host": draft.smtpHost.trim(),
    "mail.port": Number.isInteger(port) ? port : draft.smtpPort,
    "mail.username": draft.smtpUsername.trim(),
    "mail.password": draft.smtpPassword,
    "mail.from": draft.smtpFrom.trim(),
  };
}

function aiSettings(draft: ServerSetupDraft): Settings {
  if (draft.ai === "off") return { "aiEngine.enabled": false };
  if (draft.ai === "stirling") return { "aiEngine.enabled": true };
  const settings: Settings = {
    "aiEngine.enabled": true,
    "aiEngine.mode": "SELF_HOSTED",
    "aiEngine.url": trimUrl(draft.aiEngineUrl),
    "aiEngine.models.provider": draft.aiProvider,
    "aiEngine.models.apiKey": draft.aiApiKey.trim(),
    "aiEngine.models.fastModel": draft.aiFastModel.trim(),
    "aiEngine.models.smartModel": draft.aiSmartModel.trim(),
  };
  if (providerNeedsBaseUrl(draft.aiProvider)) {
    settings["aiEngine.models.baseUrl"] = trimUrl(draft.aiBaseUrl);
  }
  return { ...settings, ...documentQuestionSettings(draft) };
}

/** Document questions search an embedding index, so they need an embedding model. */
function documentQuestionSettings(draft: ServerSetupDraft): Settings {
  if (!draft.documentQuestions) {
    return { "aiEngine.features.documentQuestions": false };
  }
  const settings: Settings = {
    "aiEngine.features.documentQuestions": true,
    "aiEngine.rag.embeddingProvider": draft.embeddingProvider,
    "aiEngine.rag.embeddingModel": draft.embeddingModel.trim(),
  };
  if (embeddingNeedsApiKey(draft.embeddingProvider)) {
    settings["aiEngine.rag.embeddingApiKey"] = draft.embeddingApiKey.trim();
  }
  if (providerNeedsBaseUrl(draft.embeddingProvider)) {
    settings["aiEngine.rag.embeddingBaseUrl"] = trimUrl(draft.embeddingBaseUrl);
  }
  return settings;
}

function toSettings(draft: ServerSetupDraft): Settings {
  return {
    "system.frontendUrl": trimUrl(draft.frontendUrl),
    "system.backendUrl": trimUrl(draft.backendUrl),
    "system.defaultLocale": draft.defaultLocale,
    ...loginSettings(draft),
    ...emailSettings(draft),
    "storage.enabled": draft.storageEnabled,
    "storage.sharing.enabled": draft.sharingEnabled,
    ...aiSettings(draft),
    "mcp.enabled": draft.mcpEnabled,
    ...(draft.mcpEnabled ? { "mcp.auth.mode": draft.mcpAuthMode } : {}),
    ...(draft.analytics === null
      ? {}
      : { "system.enableAnalytics": draft.analytics }),
  };
}

/** Dotted settings keys whose value in `draft` differs from `initial`. */
export function settingsDelta(
  initial: ServerSetupDraft,
  draft: ServerSetupDraft,
): Settings {
  const before = toSettings(initial);
  const after = toSettings(draft);
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => value !== MASKED_SECRET && before[key] !== value,
    ),
  );
}

/** The draft with every field `step` edits put back to the server's value. */
export function revertStep(
  draft: ServerSetupDraft,
  initial: ServerSetupDraft,
  step: SetupStepId,
): ServerSetupDraft {
  const next = { ...draft };
  for (const field of STEP_FIELDS[step]) {
    Object.assign(next, { [field]: initial[field] });
  }
  return next;
}

/**
 * What Finish saves: steps outside the chosen mode go back to the server's
 * values, so Custom answers are dropped if the admin switches to Quick start.
 * MCP switched on here uses API keys, the one mode that needs no identity
 * provider; a server that already had MCP keeps its own mode.
 */
export function draftToSave(
  draft: ServerSetupDraft,
  initial: ServerSetupDraft,
  mode: SetupMode,
): ServerSetupDraft {
  const hidden = (Object.keys(STEP_FIELDS) as SetupStepId[]).filter(
    (step) => !SETUP_STEPS[mode].includes(step),
  );
  const saved = hidden.reduce(
    (next, step) => revertStep(next, initial, step),
    draft,
  );
  return saved.mcpEnabled && !initial.mcpEnabled
    ? { ...saved, mcpAuthMode: "apikey" }
    : saved;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ErrorCode =
  | "required"
  | "url"
  | "port"
  | "email"
  | "passwordLength"
  | "passwordMismatch"
  | "passwordUnchanged"
  | "passwordIncorrect"
  | "passwordRejected"
  | "issuerUnreachable"
  | "providerName"
  | "username"
  | "usernameTaken";

/** The provider name is the OAuth registration id and a redirect URI path segment. */
const PROVIDER_NAME = /^[A-Za-z0-9_-]+$/;

/** Mirrors RegexPatternUtils' username pattern; the server also takes an email address. */
const SIMPLE_USERNAME =
  /^[a-zA-Z0-9](?!.*[-@._+]{2,})[a-zA-Z0-9@._+-]{1,48}[a-zA-Z0-9]$/;
const EMAIL_USERNAME = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** Names UserService.isUsernameValid turns down whatever their shape. */
const RESERVED_USERNAMES = ["all_users", "anonymoususer"];

/** A first check only; the server's answer is final. */
export function isValidUsername(value: string): boolean {
  const name = value.trim();
  return (
    (SIMPLE_USERNAME.test(name) || EMAIL_USERNAME.test(name)) &&
    !RESERVED_USERNAMES.includes(name.toLowerCase())
  );
}

/** Matches the first-login password screen's rule. */
const MIN_PASSWORD_LENGTH = 8;

export type StepErrors = Partial<Record<keyof ServerSetupDraft, ErrorCode>>;

/**
 * Field errors for `step`, as codes the step translates; empty when it can
 * continue. Quick start hides the model names, so it does not require them.
 */
export function validateStep(
  step: SetupStepId,
  draft: ServerSetupDraft,
  mode: SetupMode,
): StepErrors {
  const errors: StepErrors = {};
  const require = (field: keyof ServerSetupDraft) => {
    if (!String(draft[field] ?? "").trim()) errors[field] = "required";
  };
  const requireUrl = (field: keyof ServerSetupDraft) => {
    require(field);
    if (!errors[field] && !isHttpUrl(String(draft[field])))
      errors[field] = "url";
  };

  switch (step) {
    case "addresses":
      requireUrl("frontendUrl");
      requireUrl("backendUrl");
      break;
    case "signIn":
      if (draft.login !== "password") {
        require("oauthClientId");
        require("oauthClientSecret");
        if (loginNeedsIssuer(draft.login)) requireUrl("oauthIssuer");
        if (draft.login === "oidc") {
          require("oauthProviderName");
          if (
            !errors.oauthProviderName &&
            !PROVIDER_NAME.test(draft.oauthProviderName.trim())
          ) {
            errors.oauthProviderName = "providerName";
          }
        }
      }
      break;
    case "email":
      if (draft.emailEnabled) {
        require("smtpHost");
        const port = Number(draft.smtpPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          errors.smtpPort = "port";
        }
        require("smtpFrom");
        if (
          !errors.smtpFrom &&
          !/^[^\s@]+@[^\s@]+$/.test(draft.smtpFrom.trim())
        ) {
          errors.smtpFrom = "email";
        }
      }
      break;
    case "ai":
      if (draft.ai === "custom") {
        requireUrl("aiEngineUrl");
        if (providerNeedsBaseUrl(draft.aiProvider)) requireUrl("aiBaseUrl");
        if (mode === "custom") {
          require("aiFastModel");
          require("aiSmartModel");
        }
      }
      if (draft.ai === "custom" && draft.documentQuestions) {
        require("embeddingModel");
        if (providerNeedsBaseUrl(draft.embeddingProvider)) {
          requireUrl("embeddingBaseUrl");
        }
      }
      break;
    case "summary":
      return validateSteps(QUICK_SUMMARY_STEPS, draft, mode);
    case "password":
      require("adminUsername");
      if (!errors.adminUsername && !isValidUsername(draft.adminUsername)) {
        errors.adminUsername = "username";
      }
      require("currentPassword");
      if (draft.newPassword.length < MIN_PASSWORD_LENGTH) {
        errors.newPassword = "passwordLength";
      } else if (draft.newPassword === draft.currentPassword) {
        errors.newPassword = "passwordUnchanged";
      }
      if (draft.confirmPassword !== draft.newPassword) {
        errors.confirmPassword = "passwordMismatch";
      }
      break;
    default:
      break;
  }
  return errors;
}
