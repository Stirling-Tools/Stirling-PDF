import { useTranslation } from "react-i18next";
import { Anchor, Group, Paper, Switch, Text } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import type { StorageSharingCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/**
 * Server-side file storage and what may be shared from it. The Frontend URL it
 * gates Share Links on is the System card's field, one draft over; the page
 * refetches this section after any save so filling that field in unlocks it.
 */
export function StorageSharingCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: StorageSharingCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getDisabledStyles } = useLoginRequired();

  const storageEnabled = settings.enabled ?? false;
  const sharingEnabled = storageEnabled && (settings.sharing?.enabled ?? false);
  const frontendUrlConfigured = Boolean(settings.system?.frontendUrl?.trim());
  const mailEnabled = Boolean(settings.mail?.enabled);

  return (
    <>
      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.storage.enabled.label",
                  "Enable Server File Storage",
                )}
              </Text>
              {isFieldPending("enabled") && <PendingBadge show={true} />}
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.storage.enabled.description",
                "Allow users to store files on the server.",
              )}
            </Text>
          </div>
          <Switch
            checked={storageEnabled}
            onChange={(e) =>
              setSettings({ ...settings, enabled: e.currentTarget.checked })
            }
            disabled={!loginEnabled}
            styles={getDisabledStyles()}
            style={{ flexShrink: 0 }}
          />
        </Group>
      </Paper>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.storage.sharing.enabled.label",
                  "Enable Sharing",
                )}
              </Text>
              {isFieldPending("sharing.enabled") && (
                <PendingBadge show={true} />
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.storage.sharing.enabled.description",
                "Allow users to share stored files.",
              )}
            </Text>
          </div>
          <Switch
            checked={settings.sharing?.enabled ?? false}
            onChange={(e) =>
              setSettings({
                ...settings,
                sharing: {
                  ...settings.sharing,
                  enabled: e.currentTarget.checked,
                },
              })
            }
            disabled={!loginEnabled || !storageEnabled}
            styles={getDisabledStyles()}
            style={{ flexShrink: 0 }}
          />
        </Group>
      </Paper>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.storage.sharing.links.label",
                  "Enable Share Links",
                )}
              </Text>
              {isFieldPending("sharing.linkEnabled") && (
                <PendingBadge show={true} />
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.storage.sharing.links.description",
                "Allow sharing via signed-in links.",
              )}
            </Text>
            {!frontendUrlConfigured && (
              <Text size="xs" c="var(--color-amber-dark)">
                {t(
                  "admin.settings.storage.sharing.links.frontendUrlNote",
                  "Requires a Frontend URL. ",
                )}
                <Anchor
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("frontendUrl")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  c="var(--color-amber-dark)"
                  td="underline"
                >
                  {t(
                    "admin.settings.storage.sharing.links.frontendUrlLink",
                    "Configure in System Settings",
                  )}
                </Anchor>
              </Text>
            )}
          </div>
          <Switch
            checked={settings.sharing?.linkEnabled ?? false}
            onChange={(e) =>
              setSettings({
                ...settings,
                sharing: {
                  ...settings.sharing,
                  linkEnabled: e.currentTarget.checked,
                },
              })
            }
            disabled={
              !loginEnabled || !sharingEnabled || !frontendUrlConfigured
            }
            styles={getDisabledStyles()}
            style={{ flexShrink: 0 }}
          />
        </Group>
      </Paper>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.storage.sharing.email.label",
                  "Enable Email Sharing",
                )}
              </Text>
              {isFieldPending("sharing.emailEnabled") && (
                <PendingBadge show={true} />
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.storage.sharing.email.description",
                "Allow sharing with email addresses.",
              )}
            </Text>
            {!mailEnabled && (
              <Text size="xs" c="var(--color-amber-dark)">
                {t(
                  "admin.settings.storage.sharing.email.mailNote",
                  "Requires mail configuration. ",
                )}
                <Anchor
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/settings/adminSecurity?focus=adminConnections");
                  }}
                  c="var(--color-amber-dark)"
                  td="underline"
                >
                  {t(
                    "admin.settings.storage.sharing.email.mailLink",
                    "Configure Mail Settings",
                  )}
                </Anchor>
              </Text>
            )}
          </div>
          <Switch
            checked={settings.sharing?.emailEnabled ?? false}
            onChange={(e) =>
              setSettings({
                ...settings,
                sharing: {
                  ...settings.sharing,
                  emailEnabled: e.currentTarget.checked,
                },
              })
            }
            disabled={!loginEnabled || !sharingEnabled || !mailEnabled}
            styles={getDisabledStyles()}
            style={{ flexShrink: 0 }}
          />
        </Group>
      </Paper>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.storage.signing.enabled.label",
                  "Enable Group Signing",
                )}
              </Text>
              {isFieldPending("signing.enabled") && (
                <PendingBadge show={true} />
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.storage.signing.enabled.description",
                "Allow users to create multi-participant document signing sessions. Requires server file storage to be enabled.",
              )}
            </Text>
          </div>
          <Switch
            checked={settings.signing?.enabled ?? false}
            onChange={(e) =>
              setSettings({
                ...settings,
                signing: {
                  ...settings.signing,
                  enabled: e.currentTarget.checked,
                },
              })
            }
            disabled={!loginEnabled || !storageEnabled}
            styles={getDisabledStyles()}
            style={{ flexShrink: 0 }}
          />
        </Group>
      </Paper>
    </>
  );
}
