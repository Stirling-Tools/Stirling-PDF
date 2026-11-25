import { describe, expect, it, vi } from "vitest";
import { setupAddressPrefill } from "@editor/components/serverSetup/setupAddressPrefill";

const connection = vi.hoisted(() => ({
  serverConfig: null as { url: string } | null,
}));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedServerConfig: () => connection.serverConfig,
  },
}));

describe("setupAddressPrefill", () => {
  it("offers the server the app is signed in to, not the webview's origin", () => {
    connection.serverConfig = { url: "https://pdf.example.com/" };
    expect(setupAddressPrefill()).toBe("https://pdf.example.com");
  });

  it("offers nothing without a server address", () => {
    connection.serverConfig = null;
    expect(setupAddressPrefill()).toBe("");
    connection.serverConfig = { url: "" };
    expect(setupAddressPrefill()).toBe("");
  });
});
