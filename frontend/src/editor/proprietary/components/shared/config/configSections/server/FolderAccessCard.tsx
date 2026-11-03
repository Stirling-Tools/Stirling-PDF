import { useCallback } from "react";
import { Icon } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { useTranslation } from "react-i18next";
import { Code, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import PendingBadge from "@editor/components/shared/config/PendingBadge";
import { useLoginRequired } from "@editor/hooks/useLoginRequired";
import type { FolderAccessCardProps } from "@editor/components/shared/config/configSections/server/serverCardProps";

/** The directories folder sources and outputs may touch. A security boundary. */
export function FolderAccessCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
  newRoot,
  setNewRoot,
}: FolderAccessCardProps) {
  const { t } = useTranslation();
  const { getDisabledStyles } = useLoginRequired();

  const roots = settings.allowedFolderRoots ?? [];

  const setRoots = useCallback(
    (next: string[]) => {
      setSettings({ ...settings, allowedFolderRoots: next });
    },
    [settings, setSettings],
  );

  const addRoot = useCallback(() => {
    const value = newRoot.trim();
    if (!value) return;
    if (roots.includes(value)) {
      setNewRoot("");
      return;
    }
    setRoots([...roots, value]);
    setNewRoot("");
  }, [newRoot, roots, setNewRoot, setRoots]);

  const removeRoot = useCallback(
    (value: string) => {
      setRoots(roots.filter((root) => root !== value));
    },
    [roots, setRoots],
  );

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Text fw={500} size="sm">
            {t(
              "admin.settings.folderAccess.roots.label",
              "Allowed folder roots",
            )}
          </Text>
          <PendingBadge show={isFieldPending("allowedFolderRoots")} />
          <InfoTooltip
            label={t(
              "admin.settings.folderAccess.roots.hint",
              "Enter absolute paths, for example /data/inbox.",
            )}
          />
        </Group>

        <Text size="xs" c="dimmed">
          {t(
            "admin.settings.folderAccess.securityNote",
            "Leave this empty to disable folder sources and outputs entirely. Stirling's own configuration directory, server file storage and the pipeline watched folders are always off-limits, and folder access is always disabled in hosted (SaaS) mode.",
          )}
        </Text>

        {roots.length === 0 ? (
          <Text size="sm" c="dimmed" fs="italic">
            {t(
              "admin.settings.folderAccess.roots.empty",
              "No folders allowed. Folder sources and outputs are currently disabled.",
            )}
          </Text>
        ) : (
          <Stack gap="xs">
            {roots.map((root) => (
              <Group key={root} justify="space-between" wrap="nowrap" gap="xs">
                <Code style={{ wordBreak: "break-all" }}>{root}</Code>
                <Button
                  variant="tertiary"
                  aria-label={t(
                    "admin.settings.folderAccess.roots.remove",
                    "Remove folder root",
                  )}
                  leftSection={<Icon name="x" size="1.1rem" />}
                  onClick={() => removeRoot(root)}
                  disabled={!loginEnabled}
                  style={{ flexShrink: 0 }}
                />
              </Group>
            ))}
          </Stack>
        )}

        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            value={newRoot}
            onChange={(e) => setNewRoot(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRoot();
              }
            }}
            placeholder={t(
              "admin.settings.folderAccess.roots.placeholder",
              "/data/inbox",
            )}
            disabled={!loginEnabled}
            styles={getDisabledStyles()}
          />
          <Button
            variant="secondary"
            onClick={addRoot}
            disabled={!loginEnabled || newRoot.trim().length === 0}
          >
            {t("admin.settings.folderAccess.roots.add", "Add")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
