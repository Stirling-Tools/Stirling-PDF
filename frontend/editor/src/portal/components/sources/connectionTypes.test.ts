import { describe, expect, it } from "vitest";

import {
  CREATABLE_CONNECTION_TYPES,
  buildConnectionConfig,
  creatableConnectionTypes,
  isFieldVisible,
} from "./connectionTypes";

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

    expect(config).toEqual({
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
