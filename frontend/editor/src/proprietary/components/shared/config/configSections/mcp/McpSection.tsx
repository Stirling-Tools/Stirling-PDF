import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Code, Paper, Stack, Tabs, Text } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { CodeBlock } from "@app/ui/CodeBlock";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { McpConnectedApps } from "@app/components/shared/config/configSections/mcp/McpConnectedApps";
import {
  buildMcpClients,
  type McpClientSnippet,
} from "@app/components/shared/config/configSections/mcp/mcpClients";

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** The configured connector URL, else this origin's /mcp. */
function useMcpUrl(): string {
  const { config } = useAppConfig();
  return useMemo(() => {
    if (config?.mcpResourceId) return trimTrailingSlash(config.mcpResourceId);
    const base = config?.baseUrl || window.location.origin;
    return `${trimTrailingSlash(base)}/mcp`;
  }, [config?.mcpResourceId, config?.baseUrl]);
}

function McpDisabledNotice() {
  const { t } = useTranslation();
  return (
    <Alert variant="light" color="gray" icon={<Icon name="info" size="1rem" />}>
      {t(
        "config.mcp.disabled",
        "The MCP server is turned off on this instance. An administrator can enable it under Settings > Integrations.",
      )}
    </Alert>
  );
}

function McpEndpointCard({ url, builtin }: { url: string; builtin: boolean }) {
  const { t } = useTranslation();
  return (
    <Stack gap={4}>
      <CodeBlock
        code={url}
        caption={t("config.mcp.endpoint.label", "Your MCP endpoint")}
      />
      {builtin && (
        <Text size="xs" c="dimmed">
          {t(
            "config.mcp.endpoint.connectorHint",
            "In ChatGPT or claude.ai, add a custom connector with this URL. You'll sign in with your Stirling account and approve access.",
          )}
        </Text>
      )}
    </Stack>
  );
}

function McpClientPanel({ client }: { client: McpClientSnippet }) {
  const { t } = useTranslation();
  return (
    <Tabs.Panel value={client.value} pt="sm">
      <CodeBlock
        code={client.config}
        lang={client.lang}
        caption={
          <>
            {t("config.mcp.setup.addTo", "Add to")} <Code>{client.file}</Code>
          </>
        }
      />
    </Tabs.Panel>
  );
}

function McpClientSetupCard({
  mcpUrl,
  apiKeyMode,
}: {
  mcpUrl: string;
  apiKeyMode: boolean;
}) {
  const { t } = useTranslation();
  const clients = useMemo(
    () => buildMcpClients(mcpUrl, apiKeyMode),
    [mcpUrl, apiKeyMode],
  );
  const hint = apiKeyMode
    ? t(
        "config.mcp.setup.hintApiKey",
        "Create an API key under API Keys, paste the snippet into the file shown, replace YOUR_API_KEY, then restart the client.",
      )
    : t(
        "config.mcp.setup.hint",
        "Pick your client, paste the snippet into the file shown, then restart it. You'll sign in with your Stirling account on first use - no keys to copy.",
      );
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Text fw={500} size="sm">
          {t("config.mcp.setup.title", "Connect your AI assistant")}
        </Text>
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
        <Tabs defaultValue={clients[0].value} variant="pills" radius="md">
          <Tabs.List>
            {clients.map((c) => (
              <Tabs.Tab key={c.value} value={c.value}>
                {c.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {clients.map((c) => (
            <McpClientPanel key={c.value} client={c} />
          ))}
        </Tabs>
      </Stack>
    </Paper>
  );
}

function McpApiKeyNotice() {
  const { t } = useTranslation();
  return (
    <Alert
      variant="light"
      color="yellow"
      icon={<Icon name="triangle-alert" size="1rem" />}
    >
      {t(
        "config.mcp.apiKeyModeNotice",
        "This server uses API-key mode. Clients that can send a header - Claude Desktop, Claude Code, VS Code - work with the snippets below. ChatGPT and the claude.ai connector only support OAuth, so an administrator must switch the MCP auth mode to built-in for them.",
      )}
    </Alert>
  );
}

function McpUsageTip() {
  const { t } = useTranslation();
  return (
    <Alert variant="light" color="blue" icon={<Icon name="info" size="1rem" />}>
      {t(
        "config.mcp.tip",
        "Every action your assistant runs is performed as your account and counts toward your usage, just like using Stirling PDF directly.",
      )}
    </Alert>
  );
}

/** How to point an AI assistant at this server's MCP endpoint. */
export default function McpSection() {
  const { config } = useAppConfig();
  const mcpUrl = useMcpUrl();
  const authMode = String(config?.mcpAuthMode ?? "").toLowerCase();
  const apiKeyMode = authMode === "apikey";

  if (!config?.mcpEnabled) {
    return (
      <div className="settings-section-container">
        <Stack gap="md" className="settings-section-content">
          <McpDisabledNotice />
        </Stack>
      </div>
    );
  }

  return (
    <div className="settings-section-container">
      <Stack gap="md" className="settings-section-content">
        <McpEndpointCard url={mcpUrl} builtin={authMode === "builtin"} />
        {apiKeyMode && <McpApiKeyNotice />}
        <McpClientSetupCard mcpUrl={mcpUrl} apiKeyMode={apiKeyMode} />
        {authMode === "builtin" && <McpConnectedApps />}
        <McpUsageTip />
      </Stack>
    </div>
  );
}
