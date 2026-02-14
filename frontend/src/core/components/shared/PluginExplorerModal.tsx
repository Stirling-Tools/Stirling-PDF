import { Badge, Button, Card, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePluginRegistry } from "@app/contexts/PluginRegistryContext";

interface PluginExplorerModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function PluginExplorerModal({ opened, onClose }: PluginExplorerModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { plugins, loading, error, refresh } = usePluginRegistry();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("plugins.title", "Installed plugins")}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>{t("plugins.title", "Installed plugins")}</Text>
          <Button
            size="xs"
            variant="outline"
            onClick={() => void refresh()}
            leftSection={loading ? <Loader size="xs" /> : undefined}
            disabled={loading}
          >
            {t("plugins.refresh", "Refresh")}
          </Button>
        </Group>

        {loading && (
          <Text size="sm" color="dimmed">
            {t("plugins.loading", "Checking for available plugins...")}
          </Text>
        )}

        {error && (
          <Text size="sm" color="red">
            {t("plugins.error", {
              defaultValue: "Failed to load plugins: {{message}}",
              message: error,
            })}
          </Text>
        )}

        {!loading && plugins.length === 0 && (
          <Text size="sm" color="dimmed">
            {t("plugins.empty", "No plugins installed yet. Drop a plugin jar into the plugins directory.")}
          </Text>
        )}

        {plugins.map((plugin) => (
          <Card key={plugin.id} shadow="sm" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Stack gap="0">
                  <Text fw={600}>{plugin.name}</Text>
                  <Text size="sm" color="dimmed">
                    {plugin.description || t("plugins.noDescription", "No description provided.")}
                  </Text>
                </Stack>

                <Group gap="xs">
                  {plugin.version && (
                    <Badge variant="outline" color="gray">
                      {t("plugins.version", {
                        defaultValue: "v{{version}}",
                        version: plugin.version,
                      })}
                    </Badge>
                  )}
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      if (!plugin.hasFrontend || !plugin.frontendUrl) return;
                      console.debug(
                        `[PluginExplorerModal] Navigating to plugin UI: ${plugin.name} (id: ${plugin.id})`,
                      );
                      navigate(`/plugins/${plugin.id}`, { state: { plugin } });
                      onClose();
                    }}
                    disabled={!plugin.hasFrontend || !plugin.frontendUrl}
                  >
                    {plugin.hasFrontend
                      ? t("plugins.open", "Open UI")
                      : t("plugins.backendOnly", "Backend only")}
                  </Button>
                </Group>
              </Group>

              {plugin.backendEndpoints.length > 0 && (
                <Group gap="xs" wrap="wrap">
                  {plugin.backendEndpoints.map((endpoint) => (
                    <Badge key={endpoint} variant="gradient" gradient={{ from: "indigo", to: "cyan" }}>
                      {endpoint}
                    </Badge>
                  ))}
                </Group>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Modal>
  );
}
