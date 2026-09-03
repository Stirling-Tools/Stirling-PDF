import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  NumberInput,
  Switch,
  Stack,
  Paper,
  Text,
  Group,
  Alert,
  Code,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import LocalIcon from "@app/components/shared/LocalIcon";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import apiClient from "@app/services/apiClient";
import { Button } from "@app/ui/Button";
import type { AiCardProps } from "@app/components/shared/config/configSections/ai/aiCardProps";

/** Whether the engine is on and how to reach it. Restart-required, all of it. */
export function AiConnectionCard({
  settings,
  setSettings,
  isFieldPending,
}: AiCardProps) {
  const { t } = useTranslation();
  const [testingConnection, setTestingConnection] = useState(false);
  const enabled = settings.enabled || false;

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      await apiClient.get("/api/v1/ai/health");
      alert({
        alertType: "success",
        title: t(
          "admin.settings.ai.general.test.okTitle",
          "AI engine reachable",
        ),
        body: t(
          "admin.settings.ai.general.test.okBody",
          "The AI engine responded to a health check.",
        ),
      });
    } catch (error) {
      const detail =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ||
        t(
          "admin.settings.ai.general.test.failBody",
          "The AI engine did not respond. Check the URL, that the engine container is running, and that AI is enabled (a restart is needed after enabling).",
        );
      alert({
        alertType: "error",
        title: t(
          "admin.settings.ai.general.test.failTitle",
          "AI engine unreachable",
        ),
        body: detail,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <>
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={500} size="sm">
                {t("admin.settings.ai.general.enabled.label", "Enable AI")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "admin.settings.ai.general.enabled.description",
                  "Master switch. When off, no AI tools, agents, or engine calls are available.",
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={enabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.checked })
                }
                aria-label={t(
                  "admin.settings.ai.general.enabled.label",
                  "Enable AI",
                )}
              />
              <PendingBadge show={isFieldPending("enabled")} />
            </Group>
          </Group>

          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t("admin.settings.ai.general.url.label", "AI engine URL")}
                </span>
                <PendingBadge show={isFieldPending("url")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.general.url.description",
              "Internal URL of the Python AI engine, e.g. http://stirling-pdf-engine:5001.",
            )}
            value={settings.url || ""}
            onChange={(e) => setSettings({ ...settings, url: e.target.value })}
            placeholder="http://stirling-pdf-engine:5001"
            disabled={!enabled}
          />

          <Group justify="flex-end">
            <Button
              variant="secondary"
              size="sm"
              loading={testingConnection}
              onClick={handleTestConnection}
            >
              {t("admin.settings.ai.general.test.button", "Test connection")}
            </Button>
          </Group>

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.general.timeoutSeconds.label",
                    "Request timeout (seconds)",
                  )}
                </span>
                <PendingBadge show={isFieldPending("timeoutSeconds")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.general.timeoutSeconds.description",
              "Timeout for standard AI requests to the engine.",
            )}
            value={settings.timeoutSeconds ?? 0}
            onChange={(value) =>
              setSettings({ ...settings, timeoutSeconds: Number(value) })
            }
            min={1}
            disabled={!enabled}
          />

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.general.longRunningTimeoutSeconds.label",
                    "Long-running timeout (seconds)",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("longRunningTimeoutSeconds")}
                />
              </Group>
            }
            description={t(
              "admin.settings.ai.general.longRunningTimeoutSeconds.description",
              "Timeout for heavier agent operations such as document generation.",
            )}
            value={settings.longRunningTimeoutSeconds ?? 0}
            onChange={(value) =>
              setSettings({
                ...settings,
                longRunningTimeoutSeconds: Number(value),
              })
            }
            min={1}
            disabled={!enabled}
          />

          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.ai.general.streamTimeoutSeconds.label",
                    "Stream timeout (seconds)",
                  )}
                </span>
                <PendingBadge show={isFieldPending("streamTimeoutSeconds")} />
              </Group>
            }
            description={t(
              "admin.settings.ai.general.streamTimeoutSeconds.description",
              "Timeout for streamed (token-by-token) chat responses.",
            )}
            value={settings.streamTimeoutSeconds ?? 0}
            onChange={(value) =>
              setSettings({
                ...settings,
                streamTimeoutSeconds: Number(value),
              })
            }
            min={1}
            disabled={!enabled}
          />
        </Stack>
      </Paper>

      <Alert
        variant="light"
        color="blue"
        title={t("admin.settings.ai.general.note.title", "About the AI engine")}
        icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
      >
        <Text size="xs">
          {t(
            "admin.settings.ai.general.note.body",
            "The AI engine runs as a separate service. Its shared secret",
          )}{" "}
          <Code>STIRLING_ENGINE_SHARED_SECRET</Code>{" "}
          {t(
            "admin.settings.ai.general.note.body2",
            "is set via a container environment variable. Provider API keys can be entered on these pages or supplied as engine environment variables; keys entered here are pushed to the engine when saved.",
          )}
        </Text>
      </Alert>
    </>
  );
}
