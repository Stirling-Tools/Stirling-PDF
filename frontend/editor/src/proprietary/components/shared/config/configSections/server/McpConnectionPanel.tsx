import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Paper, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { CodeBlock } from "@app/ui/CodeBlock";
import { StatusBadge, type StatusTone } from "@app/ui/StatusBadge";
import { Icon, type IconName } from "@app/ui/Icon";
import apiClient from "@app/services/apiClient";

type CheckStatus = "pass" | "warn" | "fail";

interface PreflightCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
}

interface PreflightResult {
  mode: string;
  connectorUrl: string;
  ready: boolean;
  checks: PreflightCheck[];
}

const CHECK_ICON: Record<CheckStatus, IconName> = {
  pass: "circle-check",
  warn: "triangle-alert",
  fail: "circle-x",
};

const CHECK_COLOR: Record<CheckStatus, string> = {
  pass: "var(--mantine-color-green-6)",
  warn: "var(--mantine-color-yellow-6)",
  fail: "var(--mantine-color-red-6)",
};

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <Group gap="xs" align="flex-start" wrap="nowrap">
      <Icon
        name={CHECK_ICON[check.status]}
        size={16}
        style={{
          flexShrink: 0,
          marginTop: 2,
          color: CHECK_COLOR[check.status],
        }}
      />
      <div style={{ minWidth: 0 }}>
        <Text size="sm">{check.title}</Text>
        <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {check.detail}
        </Text>
      </div>
    </Group>
  );
}

function PreflightSummary({ result }: { result: PreflightResult }) {
  const { t } = useTranslation();
  const tone: StatusTone = result.ready ? "success" : "danger";
  return (
    <Stack gap="xs">
      <StatusBadge tone={tone}>
        {result.ready
          ? t("admin.settings.mcp.test.ready", "Clients can connect")
          : t(
              "admin.settings.mcp.test.notReady",
              "Not ready - fix the items marked below",
            )}
      </StatusBadge>
      {result.checks.map((check) => (
        <CheckRow key={check.id} check={check} />
      ))}
    </Stack>
  );
}

function useMcpPreflight() {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async () => {
    setRunning(true);
    setFailed(false);
    try {
      const response = await apiClient.get<PreflightResult>(
        "/api/v1/admin/settings/mcp/preflight",
      );
      setResult(response.data);
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
    }
  };
  return { result, running, failed, run };
}

const MODE_LABEL_KEYS: Record<string, [string, string]> = {
  builtin: ["admin.settings.mcp.mode.builtin", "Built-in OAuth 2.1"],
  oauth: ["admin.settings.mcp.mode.oauth", "OAuth 2.1 (external IdP)"],
  apikey: ["admin.settings.mcp.mode.apikey", "API key (Stirling per-user key)"],
};

interface McpConnectionPanelProps {
  enabled: boolean;
  mode: string;
  connectorUrl: string;
}

/** The URL to paste into ChatGPT or Claude, the live status, and a connection test. */
export function McpConnectionPanel({
  enabled,
  mode,
  connectorUrl,
}: McpConnectionPanelProps) {
  const { t } = useTranslation();
  const { result, running, failed, run } = useMcpPreflight();
  const [modeKey, modeFallback] = MODE_LABEL_KEYS[mode] ?? [mode, mode];
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs">
            <StatusBadge tone={enabled ? "success" : "neutral"}>
              {enabled
                ? t("admin.settings.mcp.status.on", "Enabled")
                : t("admin.settings.mcp.status.off", "Disabled")}
            </StatusBadge>
            <StatusBadge tone="info" showDot={false}>
              {t(modeKey, modeFallback)}
            </StatusBadge>
          </Group>
          <Button
            size="sm"
            variant="secondary"
            leftSection={<Icon name="plug" size={14} />}
            onClick={() => void run()}
            disabled={running}
            style={{ flexShrink: 0 }}
          >
            {running
              ? t("admin.settings.mcp.test.running", "Testing...")
              : t("admin.settings.mcp.test.run", "Test connection")}
          </Button>
        </Group>
        <CodeBlock
          code={connectorUrl}
          caption={t(
            "admin.settings.mcp.connectorUrl",
            "Connector URL for ChatGPT and Claude",
          )}
        />
        {failed && (
          <Text size="xs" c="red">
            {t(
              "admin.settings.mcp.test.error",
              "Could not run the test. Save and restart if you have just changed these settings.",
            )}
          </Text>
        )}
        {result && <PreflightSummary result={result} />}
      </Stack>
    </Paper>
  );
}
