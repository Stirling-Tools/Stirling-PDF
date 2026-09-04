import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TextInput, Textarea, Stack, Paper, Text, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { GeneralCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/** Pipeline directories and external tool paths, all under system.customPaths. */
export function CustomPathsCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: GeneralCardProps) {
  const { t } = useTranslation();

  const parseWatchedFoldersInput = useCallback((value: string) => {
    const paths = value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    // Deduplicate paths (case-sensitive, exact match)
    const uniquePaths = Array.from(new Set(paths));

    return uniquePaths;
  }, []);

  const watchedFoldersInput = useMemo(
    () => (settings.customPaths?.pipeline?.watchedFoldersDirs || []).join("\n"),
    [settings.customPaths?.pipeline?.watchedFoldersDirs],
  );

  const watchedFoldersValidation = useMemo(() => {
    const paths = settings.customPaths?.pipeline?.watchedFoldersDirs || [];
    const finishedPath =
      settings.customPaths?.pipeline?.finishedFoldersDir || "";
    const warnings: string[] = [];

    // Normalize paths for comparison (handle both Windows and Unix paths)
    const normalizePath = (p: string) =>
      p.replace(/\\/g, "/").replace(/\/+$/, "");

    // Check for overlapping watched folders
    if (paths.length >= 2) {
      for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
          const path1 = normalizePath(paths[i]);
          const path2 = normalizePath(paths[j]);

          if (path1 === path2) {
            warnings.push(`Duplicate path detected: '${paths[i]}'`);
          } else if (path1.startsWith(path2 + "/")) {
            warnings.push(
              `'${paths[i]}' is nested inside '${paths[j]}' - may cause duplicate processing`,
            );
          } else if (path2.startsWith(path1 + "/")) {
            warnings.push(
              `'${paths[j]}' is nested inside '${paths[i]}' - may cause duplicate processing`,
            );
          }
        }
      }
    }

    // Check for conflicts with finished folder
    if (finishedPath && paths.length > 0) {
      const normalizedFinished = normalizePath(finishedPath);
      for (const watchedPath of paths) {
        const normalizedWatched = normalizePath(watchedPath);

        if (normalizedWatched === normalizedFinished) {
          warnings.push(
            `CRITICAL: Watched folder '${watchedPath}' is the same as finished folder - will cause processing loops!`,
          );
        } else if (normalizedFinished.startsWith(normalizedWatched + "/")) {
          warnings.push(
            `Finished folder is nested inside watched folder '${watchedPath}' - may cause issues`,
          );
        } else if (normalizedWatched.startsWith(normalizedFinished + "/")) {
          warnings.push(
            `CRITICAL: Watched folder '${watchedPath}' is nested inside finished folder - will cause processing loops!`,
          );
        }
      }
    }

    return warnings.length > 0 ? warnings : null;
  }, [
    settings.customPaths?.pipeline?.watchedFoldersDirs,
    settings.customPaths?.pipeline?.finishedFoldersDir,
  ]);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          {t(
            "admin.settings.general.customPaths.description",
            "Configure custom file system paths for pipeline processing and external tools",
          )}
        </Text>

        <Text fw={500} size="sm" mt="xs">
          {t(
            "admin.settings.general.customPaths.pipeline.label",
            "Pipeline Directories",
          )}
        </Text>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customPaths.pipeline.pipelineDir.label",
                    "Pipeline Directory",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("customPaths.pipeline.pipelineDir")}
                />
              </Group>
            }
            description={t(
              "admin.settings.general.customPaths.pipeline.pipelineDir.description",
              "Base directory for pipeline resources (leave empty for default: /pipeline)",
            )}
            value={settings.customPaths?.pipeline?.pipelineDir || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  pipeline: {
                    ...settings.customPaths?.pipeline,
                    pipelineDir: e.target.value,
                  },
                },
              })
            }
            placeholder="/pipeline"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <Textarea
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customPaths.pipeline.watchedFoldersDirs.label",
                    "Watched Folders Directories",
                  )}
                </span>
                <PendingBadge
                  show={
                    isFieldPending("customPaths.pipeline.watchedFoldersDirs") ||
                    isFieldPending("customPaths.pipeline.watchedFoldersDir")
                  }
                />
              </Group>
            }
            description={t(
              "admin.settings.general.customPaths.pipeline.watchedFoldersDirs.description",
              "Directories where pipeline monitors for incoming PDFs (one per line or comma-separated; leave empty for default: /pipeline/watchedFolders)",
            )}
            value={watchedFoldersInput}
            onChange={(e) => {
              const parsedDirs = parseWatchedFoldersInput(e.target.value);
              setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  pipeline: {
                    ...settings.customPaths?.pipeline,
                    watchedFoldersDir: parsedDirs[0] || "",
                    watchedFoldersDirs: parsedDirs,
                  },
                },
              });
            }}
            placeholder="/pipeline/watchedFolders"
            minRows={3}
            autosize
            disabled={!loginEnabled}
          />
          {watchedFoldersValidation && (
            <Stack gap="xs" mt="xs">
              {watchedFoldersValidation.map((warning, idx) => (
                <Text
                  key={idx}
                  size="sm"
                  c={warning.includes("CRITICAL") ? "red" : "yellow"}
                >
                  {warning}
                </Text>
              ))}
            </Stack>
          )}
        </div>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customPaths.pipeline.finishedFoldersDir.label",
                    "Finished Folders Directory",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending(
                    "customPaths.pipeline.finishedFoldersDir",
                  )}
                />
              </Group>
            }
            description={t(
              "admin.settings.general.customPaths.pipeline.finishedFoldersDir.description",
              "Directory where processed PDFs are outputted (leave empty for default: /pipeline/finishedFolders)",
            )}
            value={settings.customPaths?.pipeline?.finishedFoldersDir || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  pipeline: {
                    ...settings.customPaths?.pipeline,
                    finishedFoldersDir: e.target.value,
                  },
                },
              })
            }
            placeholder="/pipeline/finishedFolders"
            disabled={!loginEnabled}
          />
        </div>

        <Text fw={500} size="sm" mt="md">
          {t(
            "admin.settings.general.customPaths.operations.label",
            "External Tool Paths",
          )}
        </Text>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customPaths.operations.weasyprint.label",
                    "WeasyPrint Executable",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("customPaths.operations.weasyprint")}
                />
              </Group>
            }
            description={t(
              "admin.settings.general.customPaths.operations.weasyprint.description",
              "Path to WeasyPrint executable for HTML to PDF conversion (leave empty for default: /opt/venv/bin/weasyprint)",
            )}
            value={settings.customPaths?.operations?.weasyprint || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  operations: {
                    ...settings.customPaths?.operations,
                    weasyprint: e.target.value,
                  },
                },
              })
            }
            placeholder="/opt/venv/bin/weasyprint"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customPaths.operations.unoconvert.label",
                    "Unoconvert Executable",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("customPaths.operations.unoconvert")}
                />
              </Group>
            }
            description={t(
              "admin.settings.general.customPaths.operations.unoconvert.description",
              "Path to LibreOffice unoconvert for document conversions (leave empty for default: /opt/venv/bin/unoconvert)",
            )}
            value={settings.customPaths?.operations?.unoconvert || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  operations: {
                    ...settings.customPaths?.operations,
                    unoconvert: e.target.value,
                  },
                },
              })
            }
            placeholder="/opt/venv/bin/unoconvert"
            disabled={!loginEnabled}
          />
        </div>
      </Stack>
    </Paper>
  );
}
