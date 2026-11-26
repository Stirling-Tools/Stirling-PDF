export interface McpClientSnippet {
  value: string;
  label: string;
  file: string;
  lang: "json" | "plain";
  config: string;
}

export const API_KEY_PLACEHOLDER = "YOUR_API_KEY";

/** Per-client config pointing at /mcp; API-key mode carries the key as a header. */
export function buildMcpClients(
  mcpUrl: string,
  apiKeyMode: boolean,
): McpClientSnippet[] {
  const headers = apiKeyMode ? { "X-API-KEY": API_KEY_PLACEHOLDER } : undefined;
  const httpEntry = { type: "http", url: mcpUrl, ...(headers && { headers }) };
  const bridgeArgs = ["-y", "mcp-remote", mcpUrl];
  if (apiKeyMode) {
    bridgeArgs.push("--header", `X-API-KEY:${API_KEY_PLACEHOLDER}`);
  }
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return [
    {
      value: "claude-desktop",
      label: "Claude Desktop",
      file: "claude_desktop_config.json",
      lang: "json",
      // Claude Desktop only loads stdio servers here, so mcp-remote bridges to HTTP.
      config: json({
        mcpServers: { "stirling-pdf": { command: "npx", args: bridgeArgs } },
      }),
    },
    {
      value: "claude-code",
      label: "Claude Code",
      file: ".mcp.json",
      lang: "json",
      config: json({ mcpServers: { "stirling-pdf": httpEntry } }),
    },
    {
      value: "vscode",
      label: "VS Code",
      file: ".vscode/mcp.json",
      lang: "json",
      config: json({ servers: { "stirling-pdf": httpEntry } }),
    },
  ];
}
