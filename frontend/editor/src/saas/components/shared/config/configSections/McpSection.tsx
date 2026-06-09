import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Paper,
  Text,
  Group,
  Alert,
  Code,
  List,
  Button,
  CopyButton,
  Tooltip,
  ThemeIcon,
} from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { openAppSettings } from "@app/utils/appSettings";

/** Strip a single trailing slash so we can safely append paths. */
function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** A small copy-to-clipboard button that sits inline next to a URL/snippet. */
function CopyInline({ value, label }: { value: string; label: string }) {
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? label + " copied" : "Copy " + label} withArrow>
          <Button
            size="compact-xs"
            variant="subtle"
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
            {copied ? "Copied" : "Copy"}
          </Button>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/**
 * SaaS user-facing guide for the MCP (Model Context Protocol) server.
 *
 * Unlike the admin section that toggles MCP on/off, this tab is purely
 * informational: it appears only when the server reports MCP is enabled
 * ({@code config.mcpEnabled}) and explains how an end user points their AI
 * assistant at the OAuth-protected {@code /mcp} endpoint.
 */
export default function McpSection() {
  const { t } = useTranslation();
  const { config } = useAppConfig();

  const baseUrl = useMemo(() => {
    const raw =
      config?.baseUrl ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return trimTrailingSlash(raw);
  }, [config?.baseUrl]);

  const mcpUrl = `${baseUrl}/mcp`;
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

  const claudeConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "stirling-pdf": {
              type: "http",
              url: mcpUrl,
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl],
  );

  const toolCategories: { icon: string; key: string; fallback: string }[] = [
    {
      icon: "sync-alt-rounded",
      key: "config.mcp.tools.convert",
      fallback: "Convert - PDF to/from Office, images, HTML and more",
    },
    {
      icon: "description-rounded",
      key: "config.mcp.tools.pages",
      fallback: "Pages - merge, split, rotate, reorder and remove pages",
    },
    {
      icon: "lock",
      key: "config.mcp.tools.security",
      fallback: "Security - add/remove passwords, watermark, redact, sign",
    },
    {
      icon: "construction-rounded",
      key: "config.mcp.tools.misc",
      fallback: "Misc - compress, OCR, flatten, repair and metadata",
    },
    {
      icon: "smart-toy-rounded",
      key: "config.mcp.tools.ai",
      fallback: "AI - run Stirling's AI-powered document operations",
    },
  ];

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
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

        {/* Endpoint */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text fw={500} size="sm">
              {t("config.mcp.endpoint.label", "Your MCP endpoint")}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "config.mcp.endpoint.description",
                "Add this as a streamable-HTTP server in your MCP client.",
              )}
            </Text>
            <Group gap="xs" wrap="nowrap" align="center">
              <Code style={{ flex: 1, overflowX: "auto" }}>{mcpUrl}</Code>
              <CopyInline value={mcpUrl} label="Endpoint URL" />
            </Group>
          </Stack>
        </Paper>

        {/* Connect steps (OAuth) */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text fw={500} size="sm">
              {t("config.mcp.connect.title", "Connect your AI assistant")}
            </Text>
            <List size="sm" type="ordered" spacing="xs">
              <List.Item>
                {t("config.mcp.connect.step1", "In your MCP client, add a")}{" "}
                <b>{t("config.mcp.connect.step1Type", "streamable-HTTP")}</b>{" "}
                {t("config.mcp.connect.step1b", "server pointing at:")}{" "}
                <Code>{mcpUrl}</Code>
              </List.Item>
              <List.Item>
                {t(
                  "config.mcp.connect.step2",
                  "The client discovers sign-in automatically from:",
                )}{" "}
                <Code>{metadataUrl}</Code>
              </List.Item>
              <List.Item>
                {t(
                  "config.mcp.connect.step3",
                  "Approve the sign-in with your Stirling account. The client retries with a token - no keys to copy or paste.",
                )}
              </List.Item>
              <List.Item>
                {t(
                  "config.mcp.connect.step4",
                  "Your tools appear in the assistant, grouped by category. You're ready to go.",
                )}
              </List.Item>
            </List>
          </Stack>
        </Paper>

        {/* Example client config */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={500} size="sm">
                {t("config.mcp.example.title", "Example: Claude Desktop")}
              </Text>
              <CopyInline value={claudeConfig} label="Config" />
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "config.mcp.example.description",
                "Add this to your client's MCP config, then restart it. On first use you'll be asked to sign in.",
              )}
            </Text>
            <Code block>{claudeConfig}</Code>
          </Stack>
        </Paper>

        {/* Available tools */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text fw={500} size="sm">
              {t("config.mcp.tools.title", "What your assistant can do")}
            </Text>
            <Stack gap="xs">
              {toolCategories.map((cat) => (
                <Group key={cat.key} gap="sm" align="center" wrap="nowrap">
                  <ThemeIcon variant="light" size="md" radius="md" color="gray">
                    <LocalIcon icon={cat.icon} width={18} height={18} />
                  </ThemeIcon>
                  <Text size="sm">{t(cat.key, cat.fallback)}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Paper>

        {/* Tip / cross-link */}
        <Alert
          variant="light"
          color="blue"
          icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
        >
          <Stack gap="xs">
            <Text size="sm">
              {t(
                "config.mcp.tip",
                "Every action your assistant runs is performed as your account and counts towards your usage, just like using Stirling PDF directly.",
              )}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={
                  <LocalIcon icon="key-rounded" width={14} height={14} />
                }
                onClick={() => openAppSettings("api-keys")}
              >
                {t("config.mcp.viewApiKeys", "View API keys")}
              </Button>
            </Group>
          </Stack>
        </Alert>
      </Stack>
    </div>
  );
}
