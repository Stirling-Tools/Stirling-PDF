import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Paper,
  Text,
  Group,
  Alert,
  Code,
  Button,
  CopyButton,
  Tabs,
  Tooltip,
  ThemeIcon,
} from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { openAppSettings } from "@app/utils/appSettings";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";

/** Strip a single trailing slash so we can safely append paths. */
function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** A small copy-to-clipboard button that sits inline next to a URL/snippet. */
function CopyInline({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip
          label={
            copied
              ? t("config.mcp.copy.tooltipCopied", "{{label}} copied", {
                  label,
                })
              : t("config.mcp.copy.tooltip", "Copy {{label}}", { label })
          }
          withArrow
        >
          <Button
            size="compact-xs"
            variant={copied ? "light" : "default"}
            color={copied ? "teal" : "gray"}
            onClick={copy}
            leftSection={
              <LocalIcon
                icon={copied ? "check-rounded" : "content-copy-rounded"}
                width={14}
                height={14}
              />
            }
          >
            {copied
              ? t("config.mcp.copy.copied", "Copied")
              : t("config.mcp.copy.copy", "Copy")}
          </Button>
        </Tooltip>
      )}
    </CopyButton>
  );
}

// SaaS MCP guide: always shown, explains how to point an AI assistant at the
// OAuth-protected /mcp endpoint with per-client config.
export default function McpSection() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { user } = useAuth();
  // Guests can't authorise an MCP client - the OAuth flow mints an anonymous
  // token with no email, which the server can't map to a Stirling account. So
  // mirror the API-keys section: show a "create an account" card instead of a
  // connection guide that would only dead-end at sign-in.
  const isAnonymous = Boolean(user && isUserAnonymous(user));

  const goToAccount = () => {
    window.dispatchEvent(
      new CustomEvent("appConfig:navigate", { detail: { key: "overview" } }),
    );
  };

  const baseUrl = useMemo(() => {
    const raw =
      config?.baseUrl ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return trimTrailingSlash(raw);
  }, [config?.baseUrl]);

  const mcpUrl = `${baseUrl}/mcp`;

  // Per-client connection snippets pointing at this deployment's /mcp endpoint.
  const clients = useMemo(
    () => [
      {
        value: "claude-desktop",
        label: "Claude Desktop",
        file: "claude_desktop_config.json",
        // Claude Desktop loads only stdio servers from this file, so the remote
        // HTTP endpoint is bridged through the `mcp-remote` npm package (run via
        // npx - needs Node.js installed). First launch opens a browser to sign in.
        config: JSON.stringify(
          {
            mcpServers: {
              "stirling-pdf": {
                command: "npx",
                args: ["-y", "mcp-remote", mcpUrl],
              },
            },
          },
          null,
          2,
        ),
      },
      {
        value: "claude-code",
        label: "Claude Code",
        file: ".mcp.json",
        config: JSON.stringify(
          { mcpServers: { "stirling-pdf": { type: "http", url: mcpUrl } } },
          null,
          2,
        ),
      },
      {
        value: "codex",
        label: "Codex CLI",
        file: "~/.codex/config.toml",
        config: `[mcp_servers.stirling-pdf]\nurl = "${mcpUrl}"`,
      },
      {
        value: "vscode",
        label: "VS Code",
        file: ".vscode/mcp.json",
        config: JSON.stringify(
          { servers: { "stirling-pdf": { type: "http", url: mcpUrl } } },
          null,
          2,
        ),
      },
    ],
    [mcpUrl],
  );

  return (
    <div className="settings-section-container">
      <Stack gap="md" className="settings-section-content">
        <div>
          <Group gap="sm" align="center">
            <ThemeIcon variant="light" size="lg" radius="md">
              <LocalIcon icon="smart-toy-rounded" width={22} height={22} />
            </ThemeIcon>
            <Text fw={600} size="lg">
              {t("config.mcp.title", "MCP Server")}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" mt={6}>
            {t(
              "config.mcp.description",
              "Model Context Protocol (MCP) lets AI assistants like Claude use your Stirling PDF tools directly. Connect a client once and your assistant can convert, edit, secure and process documents on your behalf.",
            )}
          </Text>
        </div>

        {isAnonymous ? (
          <Paper withBorder p="md" radius="md">
            <Stack gap={10}>
              <Group
                justify="space-between"
                wrap="nowrap"
                align="center"
                style={{ gap: "1rem" }}
              >
                <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                  {t(
                    "config.mcp.guestInfo",
                    "Guest users can't connect MCP clients. Create an account to use the MCP server and let your AI assistant run Stirling PDF tools on your behalf.",
                  )}
                </Text>
                <Button
                  size="sm"
                  onClick={goToAccount}
                  style={{ flexShrink: 0 }}
                >
                  {t("config.apiKeys.goToAccount", "Go to Account")}
                </Button>
              </Group>
            </Stack>
          </Paper>
        ) : (
          <>
            {/* Endpoint */}
            <Paper withBorder p="sm" radius="md">
              <Group gap="xs" wrap="nowrap" align="center">
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={500} size="sm">
                    {t("config.mcp.endpoint.label", "Your MCP endpoint")}
                  </Text>
                  <Code style={{ overflowX: "auto" }}>{mcpUrl}</Code>
                </Stack>
                <CopyInline
                  value={mcpUrl}
                  label={t("config.mcp.copy.endpointLabel", "Endpoint URL")}
                />
              </Group>
            </Paper>

            {/* Per-client setup */}
            <Paper withBorder p="sm" radius="md">
              <Stack gap="xs">
                <Text fw={500} size="sm">
                  {t("config.mcp.setup.title", "Connect your AI assistant")}
                </Text>
                <Text size="xs" c="dimmed">
                  {t(
                    "config.mcp.setup.hint",
                    "Pick your client, paste the snippet into the file shown, then restart it. You'll sign in with your Stirling account on first use - no keys to copy.",
                  )}
                </Text>
                <Tabs
                  defaultValue="claude-desktop"
                  variant="pills"
                  radius="md"
                  mt={4}
                >
                  <Tabs.List>
                    {clients.map((c) => (
                      <Tabs.Tab key={c.value} value={c.value}>
                        {c.label}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                  {clients.map((c) => (
                    <Tabs.Panel key={c.value} value={c.value} pt="sm">
                      <Stack gap="xs">
                        <Group
                          justify="space-between"
                          align="center"
                          wrap="nowrap"
                        >
                          <Text size="xs" c="dimmed">
                            {t("config.mcp.setup.addTo", "Add to")}{" "}
                            <Code>{c.file}</Code>
                          </Text>
                          <CopyInline
                            value={c.config}
                            label={t("config.mcp.copy.configLabel", "Config")}
                          />
                        </Group>
                        <Code block>{c.config}</Code>
                      </Stack>
                    </Tabs.Panel>
                  ))}
                </Tabs>
              </Stack>
            </Paper>

            {/* Tip / cross-link */}
            <Alert
              variant="light"
              color="blue"
              icon={
                <LocalIcon icon="info-rounded" width="1rem" height="1rem" />
              }
            >
              <Group
                justify="space-between"
                align="center"
                wrap="nowrap"
                gap="sm"
              >
                <Text size="sm">
                  {t(
                    "config.mcp.tip",
                    "Every action your assistant runs is performed as your account and counts towards your usage, just like using the Stirling PDF API and Automation.",
                  )}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  style={{ flexShrink: 0 }}
                  leftSection={
                    <LocalIcon icon="key-rounded" width={14} height={14} />
                  }
                  onClick={() => openAppSettings("api-keys")}
                >
                  {t("config.mcp.viewApiKeys", "View API keys")}
                </Button>
              </Group>
            </Alert>
          </>
        )}
      </Stack>
    </div>
  );
}
