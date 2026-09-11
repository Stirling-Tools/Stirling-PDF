import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingConnect,
  readPendingConnect,
  rememberConnect,
} from "@portal/auth/pendingConnect";

const pending = {
  ownerId: "owner",
  mode: "reauth" as const,
  returnTo: "/processor/usage?period=month",
  settingsSection: "account-link",
  browserState: "unpredictable-state",
};

describe("renewal return destinations", () => {
  beforeEach(() => sessionStorage.clear());
  it("[US05] retains only the portal route and settings intent", () => {
    rememberConnect(pending);
    expect(readPendingConnect()).toEqual(pending);
    clearPendingConnect();
    expect(readPendingConnect()).toBeNull();
  });
  it.each([
    "https://attacker.example/processor",
    "//attacker.example/processor",
    "/processor-fake",
    "/processor/../login",
    "javascript:alert(1)",
  ])("[US07] rejects unsafe destination %s", (returnTo) => {
    rememberConnect({ ...pending, returnTo });
    expect(readPendingConnect()).toBeNull();
  });
  it("[US07] rejects corrupt saved state", () => {
    sessionStorage.setItem("stirling.portalConnect", "{invalid");
    expect(readPendingConnect()).toBeNull();
  });
  it("stores only the allowed handoff fields, even if runtime input contains credentials", () => {
    const runtimeInput = {
      ...pending,
      access_token: "private-access",
      refresh_token: "private-refresh",
      password: "private-password",
    };
    rememberConnect(runtimeInput);
    expect(
      JSON.parse(sessionStorage.getItem("stirling.portalConnect")!),
    ).toEqual(pending);
  });
});
