import { useCallback, useEffect, useState } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Code,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import LocalIcon from "@app/components/shared/LocalIcon";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import apiClient from "@app/services/apiClient";
import type { ImpliedFolderRoot } from "@app/components/shared/config/configSections/server/serverSettings";
import type { FolderAccessCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

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

  const [impliedRoots, setImpliedRoots] = useState<ImpliedFolderRoot[]>([]);

  useEffect(() => {
    if (!loginEnabled) return;
    apiClient
      .get<ImpliedFolderRoot[]>(
        "/api/v1/admin/settings/policies/implied-folder-roots",
      )
      .then((res) => setImpliedRoots(res.data ?? []))
      .catch(() => setImpliedRoots([]));
  }, [loginEnabled]);

  const roots = settings.allowedFolderRoots ?? [];

  const reasonLabel = (reason: string) => {
    switch (reason) {
      case "serverStorage":
        return t(
          "admin.settings.folderAccess.implied.serverStorage",
          "Server file storage",
        );
      case "watchedFolder":
        return t(
          "admin.settings.folderAccess.implied.watchedFolder",
          "Pipeline watched folder",
        );
      default:
        return reason;
    }
  };

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
    <>
      <PendingBadge show={isFieldPending("allowedFolderRoots")} />

      <Alert variant="light" color="blue">
        <Text size="xs">
          {t(
            "admin.settings.folderAccess.securityNote",
            "Leave this empty to disable folder sources and outputs entirely. Stirling's own configuration directory is always off-limits, and folder access is always disabled in hosted (SaaS) mode.",
          )}
        </Text>
      </Alert>

      <Paper withBorder p="sm" radius="md">
        <Stack gap="sm">
          <div>
            <Text fw={600} size="sm">
              {t(
                "admin.settings.folderAccess.roots.label",
                "Allowed folder roots",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.folderAccess.roots.hint",
                  "Enter absolute paths, for example /data/inbox.",
                )}
              />
            </Text>
          </div>

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
                <Group
                  key={root}
                  justify="space-between"
                  wrap="nowrap"
                  gap="xs"
                >
                  <Code style={{ wordBreak: "break-all" }}>{root}</Code>
                  <Button
                    variant="tertiary"
                    aria-label={t(
                      "admin.settings.folderAccess.roots.remove",
                      "Remove folder root",
                    )}
                    leftSection={
                      <LocalIcon
                        icon="close-rounded"
                        width="1.1rem"
                        height="1.1rem"
                      />
                    }
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

      {impliedRoots.length > 0 && (
        <Paper withBorder p="sm" radius="md">
          <Stack gap="sm">
            <div>
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.folderAccess.implied.title",
                  "Always allowed",
                )}{" "}
                <InfoTooltip
                  label={t(
                    "admin.settings.folderAccess.implied.description",
                    "These Stirling-managed directories are always permitted and can't be changed here.",
                  )}
                />
              </Text>
            </div>
            <Stack gap="xs">
              {impliedRoots.map((root) => (
                <Group
                  key={root.path}
                  justify="space-between"
                  wrap="nowrap"
                  gap="xs"
                  align="center"
                >
                  <Code style={{ wordBreak: "break-all" }}>{root.path}</Code>
                  <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Text size="xs" c="dimmed">
                      {reasonLabel(root.reason)}
                    </Text>
                    <LocalIcon icon="lock" width="1rem" height="1rem" />
                  </Group>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Paper>
      )}
    </>
  );
}
