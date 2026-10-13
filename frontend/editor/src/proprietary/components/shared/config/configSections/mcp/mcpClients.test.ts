import { describe, it, expect } from "vitest";
import {
  API_KEY_PLACEHOLDER,
  buildMcpClients,
} from "@app/components/shared/config/configSections/mcp/mcpClients";

const URL = "https://pdf.example.com/mcp";

describe("buildMcpClients", () => {
  it("points every client at the endpoint with no credential in OAuth modes", () => {
    const clients = buildMcpClients(URL, false);
    expect(clients.map((c) => c.value)).toEqual([
      "claude-desktop",
      "claude-code",
      "vscode",
    ]);
    for (const client of clients) {
      expect(client.config).toContain(URL);
      expect(client.config).not.toContain(API_KEY_PLACEHOLDER);
    }
  });

  it("adds the X-API-KEY header in API-key mode", () => {
    const [desktop, code] = buildMcpClients(URL, true);
    expect(JSON.parse(desktop.config).mcpServers["stirling-pdf"].args).toEqual([
      "-y",
      "mcp-remote",
      URL,
      "--header",
      `X-API-KEY:${API_KEY_PLACEHOLDER}`,
    ]);
    expect(JSON.parse(code.config).mcpServers["stirling-pdf"].headers).toEqual({
      "X-API-KEY": API_KEY_PLACEHOLDER,
    });
  });
});
