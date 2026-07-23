import { describe, expect, it } from "vitest";

import {
  CREATABLE_CONNECTION_TYPES,
  PRESET_ID_KEY,
  buildConnectionConfig,
  connectionFormValues,
  connectionTypeOf,
  creatableConnectionTypes,
  isFieldVisible,
} from "@portal/components/sources/connectionTypes";

const byId = (id: string) => {
  const type = CREATABLE_CONNECTION_TYPES.find((entry) => entry.id === id);
  if (!type) throw new Error(`no connection type ${id}`);
  return type;
};

describe("connection type catalogue", () => {
  it("offers the vendor presets to everyone", () => {
    const offered = creatableConnectionTypes({ customApi: false }).map(
      (t) => t.id,
    );

    expect(offered).toContain("s3");
    expect(offered).toContain("purview");
    expect(offered).toContain("consigno");
  });

  it("offers custom API only when the server says the caller may author one", () => {
    expect(
      creatableConnectionTypes({ customApi: true }).map((t) => t.id),
    ).toContain("api");
    expect(
      creatableConnectionTypes({ customApi: false }).map((t) => t.id),
    ).not.toContain("api");
    // Capabilities not loaded yet: withhold rather than offer something that would be refused.
    expect(creatableConnectionTypes(undefined).map((t) => t.id)).not.toContain(
      "api",
    );
  });

  it("only the custom API entry is gated", () => {
    const gated = CREATABLE_CONNECTION_TYPES.filter(
      (t) => t.requiresCustomApi,
    ).map((t) => t.id);
    expect(gated).toEqual(["api"]);
  });
});

describe("buildConnectionConfig", () => {
  it("bakes the ConsignO preset in and nests the operator's credentials", () => {
    const config = buildConnectionConfig(byId("consigno"), {
      baseUrl: "https://acme.consignocloud.com/api/v1",
      "loginHeaders.X-Client-Id": "client-abc",
      "loginHeaders.X-Client-Secret": "client-xyz",
      "loginBody.username": "api@acme.test",
      "loginBody.password": "s3cr3t",
      "loginBody.tenantId": "acme",
    });

    // The vendor's mechanics come from the preset, not from the operator.
    expect(config.authType).toBe("TOKEN_LOGIN");
    expect(config.loginPath).toBe("/auth/login");
    expect(config.tokenResponseHeader).toBe("X-Auth-Token");
    expect(config.tokenHeaderName).toBe("X-Auth-Token");

    // Dotted keys nest, so SecretMasker can recurse and mask password/secret by key name.
    expect(config.loginBody).toEqual({
      username: "api@acme.test",
      password: "s3cr3t",
      tenantId: "acme",
    });
    expect(config.loginHeaders).toEqual({
      "X-Client-Id": "client-abc",
      "X-Client-Secret": "client-xyz",
    });
  });

  it("omits blanks rather than sending empty values", () => {
    const config = buildConnectionConfig(byId("purview"), {
      tenantId: "cb46c030-1825-4e81-a295-151c039dbf02",
      clientId: "",
      clientSecret: "",
    });

    // presetId records which preset built this, so a saved connection can be mapped back to the
    // right form; the blank optional fields are still omitted.
    expect(config).toEqual({
      presetId: "purview",
      tenantId: "cb46c030-1825-4e81-a295-151c039dbf02",
    });
  });

  it("splits the result-host allowlist into a list", () => {
    const config = buildConnectionConfig(byId("api"), {
      baseUrl: "https://api.vendor.example",
      authType: "NONE",
      resultUrlHosts: "cdn.vendor.example, files.vendor.example",
    });

    expect(config.resultUrlHosts).toEqual([
      "cdn.vendor.example",
      "files.vendor.example",
    ]);
  });

  it("carries no preset for the free-form type", () => {
    expect(byId("api").presetConfig).toBeUndefined();
  });
});

describe("isFieldVisible", () => {
  const api = byId("api");
  const field = (key: string) => {
    const found = api.fields.find((f) => f.key === key);
    if (!found) throw new Error(`no field ${key}`);
    return found;
  };

  it("shows auth fields only for the auth type that uses them", () => {
    expect(isFieldVisible(field("token"), { authType: "BEARER" })).toBe(true);
    expect(isFieldVisible(field("token"), { authType: "BASIC" })).toBe(false);
    expect(isFieldVisible(field("username"), { authType: "BASIC" })).toBe(true);
    expect(isFieldVisible(field("username"), { authType: "NONE" })).toBe(false);
    expect(
      isFieldVisible(field("loginPath"), { authType: "TOKEN_LOGIN" }),
    ).toBe(true);
    expect(isFieldVisible(field("loginPath"), { authType: "BEARER" })).toBe(
      false,
    );
  });

  it("shows unconditional fields always", () => {
    expect(isFieldVisible(field("baseUrl"), {})).toBe(true);
  });
});

describe("resolving a stored connection back to its preset", () => {
  it("keeps a Discord connection as Discord, not the first API preset", () => {
    // Seventeen presets share integrationType "API". Matching on that alone returned whichever
    // came first in the catalogue, so every API connection displayed as Cloudmersive - and the
    // edit form then rewrote a Discord webhook as a Cloudmersive endpoint on save.
    const discord = CREATABLE_CONNECTION_TYPES.find((t) => t.id === "discord")!;
    const config = buildConnectionConfig(discord, {
      name: "Team Discord",
      baseUrl: "https://discord.com/api/webhooks/1/abc",
    });

    expect(connectionTypeOf("API", config)?.id).toBe("discord");
  });

  it("round-trips an edit without destroying the stored config", () => {
    const discord = CREATABLE_CONNECTION_TYPES.find((t) => t.id === "discord")!;
    const url = "https://discord.com/api/webhooks/1/abc";
    const config = buildConnectionConfig(discord, { name: "d", baseUrl: url });

    const reopened = connectionTypeOf("API", config)!;
    const values = connectionFormValues(reopened, { name: "d", config });

    expect(buildConnectionConfig(reopened, values).baseUrl).toBe(url);
  });

  it("recovers a markerless Discord connection from its webhook host", () => {
    // A connection made before the marker carries no presetId, only its URL. Discord webhooks are
    // always discord.com, so the host names the vendor - it must not show as "Custom API".
    const legacy = { baseUrl: "https://discord.com/api/webhooks/1/abc" };
    expect(connectionTypeOf("API", legacy)?.id).toBe("discord");
  });

  it("recovers a Teams connection from a webhook subdomain", () => {
    // Teams posts from a per-tenant subdomain, so the match is on the domain suffix, not the host.
    const legacy = {
      baseUrl: "https://acme.webhook.office.com/webhookb2/abc/IncomingWebhook",
    };
    expect(connectionTypeOf("API", legacy)?.id).toBe("teams");
  });

  it("falls back to the free-form entry when the host names no vendor", () => {
    // Naming a specific vendor would be a guess, and the wrong guess loses data; the custom entry
    // shows the base URL and auth it really has.
    const legacy = { baseUrl: "https://api.acme.test/v2", authType: "BEARER" };
    const resolved = connectionTypeOf("API", legacy)!;

    expect(resolved.kind).toBe("custom");
    const values = connectionFormValues(resolved, {
      name: "l",
      config: legacy,
    });
    expect(buildConnectionConfig(resolved, values).baseUrl).toBe(
      legacy.baseUrl,
    );
  });

  it("does not guess between vendors that share a host", () => {
    // The two Cloudmersive presets both live at api.cloudmersive.com, so a markerless connection
    // there is genuinely ambiguous - resolve to the safe free-form form, not one of them at random.
    const legacy = {
      baseUrl: "https://api.cloudmersive.com",
      authType: "HEADER",
    };
    expect(connectionTypeOf("API", legacy)?.kind).toBe("custom");
  });

  it("still prefers the marker over the host when both are present", () => {
    // A webhook preset pointed at a custom relay: the marker is authoritative, not the URL.
    const config = {
      [PRESET_ID_KEY]: "slack",
      baseUrl: "https://discord.com/x",
    };
    expect(connectionTypeOf("API", config)?.id).toBe("slack");
  });

  it("still resolves exactly when only one preset owns the type", () => {
    expect(connectionTypeOf("PURVIEW", {})?.id).toBe("purview");
  });
});
