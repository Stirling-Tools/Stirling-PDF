import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { useTranslation } from "react-i18next";
import {
  NumberInput,
  Stack,
  Paper,
  Group,
  TextInput,
  Select,
} from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import EditableSecretField from "@app/components/shared/EditableSecretField";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { DatasourceSettingsData } from "@app/components/shared/config/configSections/advanced/advancedSettings";
import type { AdvancedCardProps } from "@app/components/shared/config/configSections/advanced/advancedCardProps";

/**
 * The `system.datasource` block, previously its own nav row. The password stays
 * masked ("********") until the user edits it, so an untouched field never
 * reaches the delta.
 */
export function DatabaseConfigCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: AdvancedCardProps) {
  const { t } = useTranslation();
  const { getDisabledStyles } = useLoginRequired();

  const datasource = settings.datasource;
  const setDatasource = (patch: Partial<DatasourceSettingsData>) =>
    setSettings({
      ...settings,
      datasource: { ...(settings.datasource || {}), ...patch },
    });

  return (
    <>
      <div></div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <SettingsToggleRow
            label={t(
              "admin.settings.database.enableCustom.label",
              "Enable Custom Database",
            )}
            info={t(
              "admin.settings.database.enableCustom.description",
              "Use your own custom database configuration instead of the default embedded database",
            )}
            pending={isFieldPending("datasource.enableCustomDatabase")}
            checked={datasource?.enableCustomDatabase || false}
            onChange={(checked) => {
              if (!loginEnabled) return;
              setDatasource({ enableCustomDatabase: checked });
            }}
            disabled={!loginEnabled}
            styles={getDisabledStyles()}
          />

          {datasource?.enableCustomDatabase && (
            <>
              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.database.customUrl.label",
                          "Custom Database URL",
                        )}
                      </span>
                      <PendingBadge
                        show={isFieldPending("datasource.customDatabaseUrl")}
                      />
                      <InfoTooltip
                        label={t(
                          "admin.settings.database.customUrl.description",
                          "Full JDBC connection string (e.g., jdbc:postgresql://localhost:5432/postgres). If provided, individual connection settings below are not used.",
                        )}
                      />
                    </Group>
                  }
                  value={datasource?.customDatabaseUrl || ""}
                  onChange={(e) =>
                    setDatasource({ customDatabaseUrl: e.target.value })
                  }
                  placeholder="jdbc:postgresql://localhost:5432/postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <Select
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.database.type.label",
                          "Database Type",
                        )}
                      </span>
                      <PendingBadge show={isFieldPending("datasource.type")} />
                      <InfoTooltip
                        label={t(
                          "admin.settings.database.type.description",
                          "Type of database (not used if custom URL is provided)",
                        )}
                      />
                    </Group>
                  }
                  value={datasource?.type || "postgresql"}
                  onChange={(value) =>
                    setDatasource({ type: value || "postgresql" })
                  }
                  data={[
                    { value: "postgresql", label: "PostgreSQL" },
                    { value: "h2", label: "H2" },
                    { value: "mysql", label: "MySQL" },
                    { value: "mariadb", label: "MariaDB" },
                  ]}
                  comboboxProps={{
                    withinPortal: true,
                    zIndex: Z_INDEX_OVER_CONFIG_MODAL,
                  }}
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.database.hostName.label",
                          "Host Name",
                        )}
                      </span>
                      <PendingBadge
                        show={isFieldPending("datasource.hostName")}
                      />
                      <InfoTooltip
                        label={t(
                          "admin.settings.database.hostName.description",
                          "Database server hostname (not used if custom URL is provided)",
                        )}
                      />
                    </Group>
                  }
                  value={datasource?.hostName || ""}
                  onChange={(e) => setDatasource({ hostName: e.target.value })}
                  placeholder="localhost"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <NumberInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t("admin.settings.database.port.label", "Port")}
                      </span>
                      <PendingBadge show={isFieldPending("datasource.port")} />
                      <InfoTooltip
                        label={t(
                          "admin.settings.database.port.description",
                          "Database server port (not used if custom URL is provided)",
                        )}
                      />
                    </Group>
                  }
                  value={datasource?.port || 5432}
                  onChange={(value) => setDatasource({ port: Number(value) })}
                  min={1}
                  max={65535}
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.database.name.label",
                          "Database Name",
                        )}
                      </span>
                      <PendingBadge show={isFieldPending("datasource.name")} />
                      <InfoTooltip
                        label={t(
                          "admin.settings.database.name.description",
                          "Name of the database (not used if custom URL is provided)",
                        )}
                      />
                    </Group>
                  }
                  value={datasource?.name || ""}
                  onChange={(e) => setDatasource({ name: e.target.value })}
                  placeholder="postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>
                        {t(
                          "admin.settings.database.username.label",
                          "Username",
                        )}
                      </span>
                      <PendingBadge
                        show={isFieldPending("datasource.username")}
                      />
                      <InfoTooltip
                        label={t(
                          "admin.settings.database.username.description",
                          "Database authentication username",
                        )}
                      />
                    </Group>
                  }
                  value={datasource?.username || ""}
                  onChange={(e) => setDatasource({ username: e.target.value })}
                  placeholder="postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <Group gap="xs" align="center" mb={4}>
                  <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                    {t("admin.settings.database.password.label", "Password")}
                  </span>
                  <PendingBadge show={isFieldPending("datasource.password")} />
                </Group>
                <EditableSecretField
                  description={t(
                    "admin.settings.database.password.description",
                    "Database authentication password",
                  )}
                  value={datasource?.password || ""}
                  onChange={(value) => setDatasource({ password: value })}
                  placeholder={t(
                    "admin.settings.database.password.placeholder",
                    "Enter database password",
                  )}
                  disabled={!loginEnabled}
                />
              </div>
            </>
          )}
        </Stack>
      </Paper>
    </>
  );
}
