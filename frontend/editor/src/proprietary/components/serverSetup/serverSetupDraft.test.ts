import { describe, expect, it } from "vitest";
import {
  aiProviderChange,
  draftFromSettings,
  embeddingProviderChange,
  isValidUsername,
  issuersToCheck,
  loginChange,
  draftToSave,
  oauthRedirectUri,
  prefillAddresses,
  revertStep,
  settingsDelta,
  validateStep,
} from "@app/components/serverSetup/serverSetupDraft";

const SETTINGS = {
  system: {
    frontendUrl: "",
    backendUrl: "",
    defaultLocale: "",
    enableAnalytics: null,
  },
  security: {
    oauth2: {
      enabled: false,
      provider: "google",
      client: { google: { clientId: "" }, github: {}, keycloak: {} },
    },
  },
  mail: {
    enabled: false,
    host: "smtp.example.com",
    port: 587,
    password: "********",
  },
  storage: { enabled: true, sharing: { enabled: false } },
  aiEngine: {
    enabled: false,
    mode: "SELF_HOSTED",
    url: "http://localhost:5001",
    models: {
      provider: "anthropic",
      fastModel: "claude-haiku-4-5",
      smartModel: "claude-haiku-4-5",
      apiKey: "",
    },
    rag: {
      embeddingProvider: "voyageai",
      embeddingModel: "voyage-4",
      embeddingApiKey: "********",
      embeddingBaseUrl: "",
    },
    features: { documentQuestions: true },
  },
  mcp: { enabled: false, auth: { mode: "oauth" } },
};

const ORIGIN = "https://pdf.example.com";

describe("draftFromSettings", () => {
  it("leaves addresses as the server has them", () => {
    expect(draftFromSettings(SETTINGS).frontendUrl).toBe("");
  });

  it("reads an unanswered analytics question as null", () => {
    expect(draftFromSettings(SETTINGS).analytics).toBeNull();
  });

  it("reads Stirling AI from cloud mode", () => {
    const draft = draftFromSettings({
      ...SETTINGS,
      aiEngine: { ...SETTINGS.aiEngine, enabled: true, mode: "CLOUD" },
    });
    expect(draft.ai).toBe("stirling");
  });
});

describe("settingsDelta", () => {
  it("saves prefilled addresses and nothing the admin left alone", () => {
    const initial = draftFromSettings(SETTINGS);
    const draft = prefillAddresses(initial, ORIGIN);
    const delta = settingsDelta(initial, { ...draft, analytics: true });
    expect(delta).toEqual({
      "system.frontendUrl": ORIGIN,
      "system.backendUrl": ORIGIN,
      "system.enableAnalytics": true,
    });
  });

  it("writes the provider's client and switches OAuth on", () => {
    const initial = draftFromSettings(SETTINGS);
    const delta = settingsDelta(initial, {
      ...initial,
      login: "keycloak",
      oauthIssuer: "https://id.example.com/realms/main/",
      oauthClientId: "stirling",
      oauthClientSecret: "s3cret",
    });
    expect(delta).toMatchObject({
      "security.oauth2.enabled": true,
      "security.oauth2.client.keycloak.issuer":
        "https://id.example.com/realms/main",
      "security.oauth2.client.keycloak.clientId": "stirling",
      "security.oauth2.client.keycloak.clientSecret": "s3cret",
    });
    expect(delta).not.toHaveProperty("security.ssoAutoLogin");
  });

  it("never writes a masked secret the admin left alone", () => {
    const initial = draftFromSettings(SETTINGS);
    const delta = settingsDelta(initial, {
      ...initial,
      emailEnabled: true,
      smtpFrom: "pdf@example.com",
    });
    expect(delta).toMatchObject({ "mail.enabled": true, "mail.port": 587 });
    expect(delta).not.toHaveProperty("mail.password");
  });
});

describe("revertStep", () => {
  it("restores only the skipped step's fields", () => {
    const initial = draftFromSettings(SETTINGS);
    const edited = { ...initial, emailEnabled: true, mcpEnabled: true };
    const reverted = revertStep(edited, initial, "email");
    expect(reverted.emailEnabled).toBe(false);
    expect(reverted.mcpEnabled).toBe(true);
  });
});

describe("validateStep", () => {
  const initial = prefillAddresses(draftFromSettings(SETTINGS), ORIGIN);

  it("requires full http(s) addresses", () => {
    expect(
      validateStep(
        "addresses",
        { ...initial, frontendUrl: "pdf.example.com" },
        "quick",
      ),
    ).toEqual({ frontendUrl: "url" });
  });

  it("requires credentials once an OAuth provider is picked", () => {
    expect(
      validateStep("signIn", { ...initial, login: "oidc" }, "quick"),
    ).toEqual({
      oauthClientId: "required",
      oauthClientSecret: "required",
      oauthIssuer: "required",
      oauthProviderName: "required",
    });
  });

  it("only asks for model names in Custom, where they are shown", () => {
    const draft = { ...initial, ai: "custom" as const, aiFastModel: "" };
    expect(validateStep("ai", draft, "quick")).toEqual({});
    expect(validateStep("ai", draft, "custom")).toEqual({
      aiFastModel: "required",
    });
  });
});

describe("oauthRedirectUri", () => {
  it("uses the provider name as the registration id for generic OIDC", () => {
    const draft = prefillAddresses(draftFromSettings(SETTINGS), ORIGIN);
    expect(
      oauthRedirectUri({ ...draft, login: "oidc", oauthProviderName: "okta" }),
    ).toBe(`${ORIGIN}/login/oauth2/code/okta`);
  });
});

describe("draftToSave", () => {
  it("drops answers to Custom-only steps when Quick start is chosen", () => {
    const initial = draftFromSettings(SETTINGS);
    const edited = {
      ...initial,
      ai: "custom" as const,
      storageEnabled: false,
      mcpEnabled: true,
      emailEnabled: true,
    };
    const quick = draftToSave(edited, initial, "quick");
    expect(quick.storageEnabled).toBe(true);
    expect(quick.mcpEnabled).toBe(true);
    expect(quick.emailEnabled).toBe(true);
    expect(draftToSave(edited, initial, "custom")).toEqual({
      ...edited,
      mcpAuthMode: "apikey",
    });
  });

  it("keeps MCP on when AI is switched off", () => {
    const initial = {
      ...draftFromSettings(SETTINGS),
      ai: "custom" as const,
      mcpEnabled: true,
    };
    const draft = { ...initial, ai: "off" as const };
    expect(draftToSave(draft, initial, "custom").mcpEnabled).toBe(true);
  });
});

describe("MCP", () => {
  const initial = draftFromSettings(SETTINGS);

  it("turns on with API keys, which need no identity provider", () => {
    const saved = draftToSave(
      { ...initial, mcpEnabled: true },
      initial,
      "quick",
    );
    expect(settingsDelta(initial, saved)).toEqual({
      "mcp.enabled": true,
      "mcp.auth.mode": "apikey",
    });
  });

  it("keeps the sign-in mode of a server that already runs it", () => {
    const running = { ...initial, mcpEnabled: true };
    expect(draftToSave(running, running, "custom").mcpAuthMode).toBe("oauth");
  });
});

describe("document questions", () => {
  const initial = prefillAddresses(draftFromSettings(SETTINGS), ORIGIN);
  const custom = {
    ...initial,
    ai: "custom" as const,
    aiFastModel: "fast",
    aiSmartModel: "smart",
  };

  it("saves the embedding setup with AI, leaving a masked key alone", () => {
    const delta = settingsDelta(initial, custom);
    expect(delta).toMatchObject({
      "aiEngine.features.documentQuestions": true,
      "aiEngine.rag.embeddingProvider": "voyageai",
      "aiEngine.rag.embeddingModel": "voyage-4",
    });
    expect(delta).not.toHaveProperty("aiEngine.rag.embeddingApiKey");
  });

  it("needs a model, and a base URL for local providers", () => {
    const draft = {
      ...custom,
      ...embeddingProviderChange("ollama", initial),
      embeddingModel: "",
    };
    expect(validateStep("ai", draft, "custom")).toEqual({
      embeddingModel: "required",
      embeddingBaseUrl: "required",
    });
  });

  it("starts a new provider on its own model, without the old key", () => {
    expect(embeddingProviderChange("openai", initial)).toMatchObject({
      embeddingModel: "text-embedding-3-small",
      embeddingApiKey: "",
    });
    expect(embeddingProviderChange("voyageai", initial)).toMatchObject({
      embeddingModel: "voyage-4",
      embeddingApiKey: "********",
    });
  });
});

describe("switching provider", () => {
  const initial = {
    ...draftFromSettings(SETTINGS),
    login: "google" as const,
    oauthClientId: "google-id",
    oauthClientSecret: "********",
    aiProvider: "anthropic" as const,
    aiApiKey: "********",
  };

  it("never hands one provider's secret to another", () => {
    expect(loginChange("keycloak", initial)).toMatchObject({
      oauthClientId: "",
      oauthClientSecret: "",
    });
    expect(aiProviderChange("openai", initial)).toMatchObject({ aiApiKey: "" });
  });

  it("restores the server's values on going back to its provider", () => {
    expect(loginChange("google", initial)).toMatchObject({
      oauthClientId: "google-id",
      oauthClientSecret: "********",
    });
    expect(aiProviderChange("anthropic", initial)).toMatchObject({
      aiApiKey: "********",
    });
  });
});

describe("issuersToCheck", () => {
  const initial = prefillAddresses(draftFromSettings(SETTINGS), ORIGIN);

  it("checks a new sign-in issuer on the steps that save it", () => {
    const draft = {
      ...initial,
      login: "oidc" as const,
      oauthIssuer: "https://id.example.com",
    };
    expect(issuersToCheck("summary", draft, initial)).toEqual(["oauthIssuer"]);
    expect(issuersToCheck("signIn", draft, initial)).toEqual(["oauthIssuer"]);
    expect(issuersToCheck("email", draft, initial)).toEqual([]);
  });

  it("skips an issuer the server already uses", () => {
    const using = {
      ...initial,
      login: "keycloak" as const,
      oauthIssuer: "https://id.example.com",
    };
    expect(issuersToCheck("signIn", { ...using }, using)).toEqual([]);
  });
});

describe("provider name", () => {
  it("must be safe as a redirect URI path segment", () => {
    const draft = {
      ...prefillAddresses(draftFromSettings(SETTINGS), ORIGIN),
      login: "oidc" as const,
      oauthIssuer: "https://id.example.com",
      oauthClientId: "id",
      oauthClientSecret: "secret",
      oauthProviderName: "my okta/",
    };
    expect(validateStep("signIn", draft, "quick")).toEqual({
      oauthProviderName: "providerName",
    });
  });
});

describe("isValidUsername", () => {
  it("takes what the server takes", () => {
    expect(isValidUsername("pdf-admin")).toBe(true);
    expect(isValidUsername("ops@example.com")).toBe(true);
  });

  it("turns down what the server turns down", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("-admin")).toBe(false);
    expect(isValidUsername("ad..min")).toBe(false);
    expect(isValidUsername("has space")).toBe(false);
    expect(isValidUsername("anonymousUser")).toBe(false);
  });
});
