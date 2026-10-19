import { useState } from "react";
import { Group, Popover, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import type { RightsManagedProtection } from "@editor/services/rightsManagedPdf";

export function RightsManagedPdfBanner({
  protection,
}: {
  protection: RightsManagedProtection;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const { permissions, label } = protection;
  const labelName = label
    ? label.parentName
      ? `${label.parentName} \\ ${label.name}`
      : label.name
    : protection.custom || !protection.templateName
      ? t("rightsManagedPdf.customPermissions", "Custom permissions")
      : protection.templateName;
  const restricted =
    !permissions.edit || !permissions.print || !permissions.copy;
  const summary = !restricted
    ? t("rightsManagedPdf.fullAccess", "Full access")
    : !permissions.edit && !permissions.print && !permissions.copy
      ? t("rightsManagedPdf.viewOnly", "View only")
      : t("rightsManagedPdf.limitedAccess", "Limited access");
  const rights: Array<[string, boolean]> = [
    [t("rightsManagedPdf.right.view", "View"), permissions.view],
    [t("rightsManagedPdf.right.edit", "Edit"), permissions.edit],
    [t("rightsManagedPdf.right.print", "Print"), permissions.print],
    [t("rightsManagedPdf.right.copy", "Copy text"), permissions.copy],
    [t("rightsManagedPdf.right.comment", "Comment"), permissions.comment],
    [
      t("rightsManagedPdf.right.export", "Save as / export"),
      permissions.export,
    ],
  ];
  const expiry =
    protection.validUntilEpochSeconds !== null
      ? new Date(protection.validUntilEpochSeconds * 1000).toLocaleDateString()
      : t("rightsManagedPdf.never", "Never");

  return (
    <Group
      data-testid="rights-managed-pdf-banner"
      gap="xs"
      wrap="nowrap"
      px="sm"
      style={{
        minHeight: 32,
        borderBottom: "1px solid var(--c-border-subtle)",
        background: "var(--c-bg-raised)",
      }}
    >
      <Icon
        name="shield-check"
        size={16}
        style={{ color: "var(--c-accent-fg, var(--c-primary))", flexShrink: 0 }}
      />
      {label?.color && (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: label.color,
            flexShrink: 0,
          }}
        />
      )}
      <Text size="sm" fw={600} truncate style={{ minWidth: 0 }}>
        {labelName}
      </Text>
      <Text size="sm" c="dimmed" truncate style={{ minWidth: 0, flex: 1 }}>
        {summary}
      </Text>
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-end"
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setOpened((value) => !value)}
            rightSection={<Icon name="chevron-down" size={14} />}
          >
            {t("rightsManagedPdf.permissions", "Permissions")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown data-testid="rights-managed-pdf-permissions">
          <Stack gap={6} miw={240}>
            <Text size="sm" fw={600}>
              {labelName}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "rightsManagedPdf.protectedBy",
                "Protected with Microsoft Purview",
              )}
            </Text>
            {rights.map(([name, allowed]) => (
              <Group key={name} gap={8} wrap="nowrap">
                <Icon
                  name={allowed ? "check" : "x"}
                  size={14}
                  style={{
                    color: allowed ? "var(--c-success)" : "var(--c-danger)",
                  }}
                />
                <Text size="sm">{name}</Text>
              </Group>
            ))}
            {protection.owner && (
              <Text size="xs" c="dimmed">
                {t("rightsManagedPdf.owner", "Owner: {{owner}}", {
                  owner: protection.owner,
                })}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {t("rightsManagedPdf.expiresOn", "Access expires: {{date}}", {
                date: expiry,
              })}
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
