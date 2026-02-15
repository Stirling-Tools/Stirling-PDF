import React, { useEffect, useState } from "react";
import { Paper, Text, Group, Stack, Badge, Divider, Avatar, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePluginRegistry } from "@app/contexts/PluginRegistryContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import apiClient from "@app/services/apiClient";

const PluginSection: React.FC = () => {
  const { t } = useTranslation();
  const { plugins, loading, error } = usePluginRegistry();
  const { config } = useAppConfig();
  const pluginPath =
    config?.pluginsPath ?? (config?.basePath ? `${config.basePath}/customFiles/plugins/` : "customFiles/plugins/");
  const [iconStatus, setIconStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const toCheck = plugins.filter((plugin) => plugin.iconUrl && iconStatus[plugin.id] === undefined);

    toCheck.forEach((plugin) => {
      const iconUrl = plugin.iconUrl!;
      apiClient
        .get(iconUrl, { responseType: "blob", suppressErrorToast: true })
        .then(() => {
          if (!active) return;
          setIconStatus((prev) => ({ ...prev, [plugin.id]: true }));
        })
        .catch(() => {
          if (!active) return;
          setIconStatus((prev) => ({ ...prev, [plugin.id]: false }));
        });
    });

    return () => {
      active = false;
    };
  }, [plugins, iconStatus]);

  const renderIcon = (plugin: ReturnType<typeof usePluginRegistry> extends { plugins: (infer T)[] } ? T : never) => {
    const isValid = iconStatus[plugin.id];
    if (plugin.iconUrl && isValid) {
      return <Avatar radius="md" w="36px" h="36px" src={plugin.iconUrl} alt="Plugin Icon" />;
    }
    return <LocalIcon icon="extension-outline" width="1.5rem" height="1.5rem" />;
  };

  return (
    <Stack gap="md">
      <Paper radius="md" p="md" withBorder style={{ background: "var(--modal-content-bg)" }}>
        <Group justify="space-between">
          <Text size="lg" fw={600}>
            {t("settings.plugins.title", "Plugins")}
          </Text>
          <Badge variant="outline" color="gray">
            {t("settings.plugins.count", "Installed plugins {{count}}", { count: plugins.length })}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed" mt="xs">
          {t("settings.plugins.description", "Browse, install, and configure extensions.")}
        </Text>
      </Paper>

      {loading && (
        <Text size="sm" c="dimmed">
          {t("settings.plugins.loading", "Loading plugins...")}
        </Text>
      )}

      {error && plugins.length > 0 && (
        <Text size="sm" c="red">
          {t("settings.plugins.error", "Failed to load plugins")}
        </Text>
      )}

      {!loading && plugins.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("settings.plugins.empty", "No plugins found. Drop a plugin JAR in {{path}}.", { path: pluginPath })}
        </Text>
      )}

      {plugins.map((plugin) => (
        <Paper key={plugin.id} radius="md" p="md" withBorder style={{ background: "var(--modal-content-bg)" }}>
          <Stack gap="sm">
            <Group align="center" gap="sm">
              {renderIcon(plugin)}
              <Stack gap="0">
                <Group gap="xs">
                  {plugin.frontendLabel && (
                    <Badge color="teal" variant="light">
                      {plugin.frontendLabel}
                    </Badge>
                  )}
                  {plugin.minHostVersion && (
                    <Badge color="blue" variant="light">
                      {t("settings.plugins.minHost", { defaultValue: "min. v{{version}}", version: plugin.minHostVersion })}
                    </Badge>
                  )}
                  {plugin.version && (
                    <Badge variant="outline" color="gray">
                      {t("plugins.version", { defaultValue: "v{{version}}", version: plugin.version })}
                    </Badge>
                  )}
                </Group>
                <Text fw={600} c={plugin.hasFrontend ? "var(--mantine-color-blue-3)" : undefined}>
                  {plugin.name}
                </Text>
              </Stack>
            </Group>
            <Text size="sm" c="dimmed">
              {plugin.description || t("settings.plugins.noDescription", "No description")}
            </Text>
            {plugin.backendEndpoints.length > 0 && (
              <Group gap="xs">
                {plugin.backendEndpoints.map((endpoint) => (
                  <Tooltip key={endpoint} label={endpoint} position="bottom" withArrow>
                    <Badge variant="outline" color="cyan" style={{ fontSize: "0.7rem", letterSpacing: 0.4 }}>
                      {endpoint.replace(/^\//, "").toUpperCase()}
                    </Badge>
                  </Tooltip>
                ))}
              </Group>
            )}
            <Divider />
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {t("settings.plugins.author", "Author: {{author}}", {
                  author: plugin.author || t("settings.plugins.unknownAuthor", "unknown"),
                })}
              </Text>
            </Group>
            {plugin.jarCreatedAt && (
              <Text size="xs" c="dimmed">
                {t("settings.plugins.createdAt", "Created on {{date}}", {
                  date: new Date(plugin.jarCreatedAt).toLocaleString(),
                })}
              </Text>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
};

export default PluginSection;
