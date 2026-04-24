import React, { useState, useEffect } from "react";
import {
  Modal,
  Stack,
  Text,
  Badge,
  Button,
  Group,
  Loader,
  Center,
  Box,
  Collapse,
  Progress,
  Alert,
  Divider,
  CloseButton,
  Anchor,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  updateService,
  UpdateSummary,
  FullUpdateInfo,
  MachineInfo,
} from "@app/services/updateService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DownloadIcon from "@mui/icons-material/Download";
import StarIcon from "@mui/icons-material/Star";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

export type DesktopInstallState =
  | "idle"
  | "downloading"
  | "installing"
  | "ready-to-restart"
  | "error";

export interface DesktopInstallProgress {
  downloaded: number;
  total: number | null;
  percent: number;
}

export interface DesktopInstallActions {
  startInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
}

/**
 * Passed alongside the install state when the Tauri `can_install_updates`
 * probe has run. When `canInstall` is `false` the UpdateModal shows an
 * inline "admin permissions required" warning and disables the Install Now
 * button so users can't trip themselves into a UAC prompt they can't satisfy.
 */
export interface DesktopInstallCanInstall {
  canInstall: boolean;
  reason: string | null;
}

/** Docs URL referenced from the blocked alert. */
const WINDOWS_INSTALL_DOCS_URL =
  "https://docs.stirlingpdf.com/Installation/Windows%20Installation/#automated-installation-msi-installer";

interface UpdateModalProps {
  opened: boolean;
  onClose: () => void;
  onRemindLater?: () => void;
  currentVersion: string;
  updateSummary: UpdateSummary;
  machineInfo: MachineInfo;
  downloadSizeBytes?: number | null;
  desktopInstall?: {
    state: DesktopInstallState;
    progress: DesktopInstallProgress | null;
    errorMessage: string | null;
    actions: DesktopInstallActions;
    /**
     * Optional: result of the `can_install_updates` probe. When present
     * with `canInstall: false` the modal shows an inline admin-permissions
     * warning and disables the Install Now button. Absent or
     * `canInstall: true` preserves the existing interactive flow.
     */
    canInstall?: DesktopInstallCanInstall | null;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "~220 MB";
  return `~${formatBytes(bytes)}`;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  opened,
  onClose,
  onRemindLater,
  currentVersion,
  updateSummary,
  machineInfo,
  downloadSizeBytes,
  desktopInstall,
}) => {
  const { t } = useTranslation();
  const [fullUpdateInfo, setFullUpdateInfo] = useState<FullUpdateInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(
    new Set([0]),
  );

  useEffect(() => {
    if (opened) {
      setLoading(true);
      setExpandedVersions(new Set([0]));
      updateService
        .getFullUpdateInfo(currentVersion, machineInfo)
        .then((info) => {
          setFullUpdateInfo(info);
          setLoading(false);
        });
    }
  }, [opened, currentVersion, machineInfo]);

  const toggleVersion = (index: number) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority?.toLowerCase()) {
      case "urgent":
        return "red";
      case "normal":
        return "blue";
      case "minor":
        return "cyan";
      case "low":
        return "gray";
      default:
        return "gray";
    }
  };

  const getPriorityLabel = (priority: string): string => {
    const key = priority?.toLowerCase();
    return t(`update.priority.${key}`, priority || "Normal");
  };

  const downloadUrl = updateService.getDownloadUrl(machineInfo);
  const canClose =
    !desktopInstall ||
    desktopInstall.state === "idle" ||
    desktopInstall.state === "error" ||
    desktopInstall.state === "ready-to-restart";

  // When the install-probe reported that we cannot write to the install
  // directory (non-admin on a per-machine install, Intune/MDM deploys, etc),
  // surface an inline warning and disable the Install Now button. We only
  // block the interactive flow — auto mode silently skips upstream in
  // useDesktopUpdatePopup so the user is never prompted.
  const installBlocked = Boolean(
    desktopInstall &&
    desktopInstall.canInstall &&
    desktopInstall.canInstall.canInstall === false,
  );
  const isStable =
    updateSummary.latest_stable_version === updateSummary.latest_version;
  const priorityColor = getPriorityColor(updateSummary.max_priority);

  const handleLater = () => {
    if (onRemindLater) onRemindLater();
    onClose();
  };

  // Sort versions newest first, skip the latest (already shown in header)
  const sortedVersions = fullUpdateInfo?.new_versions
    ? [...fullUpdateInfo.new_versions].sort((a, b) =>
        updateService.compareVersions(b.version, a.version),
      )
    : [];
  // Show max 10 initially to keep the modal manageable
  const [showAllVersions, setShowAllVersions] = useState(false);
  const visibleVersions = showAllVersions
    ? sortedVersions
    : sortedVersions.slice(0, 10);

  return (
    <Modal
      opened={opened}
      onClose={canClose ? onClose : () => undefined}
      withCloseButton={false}
      centered
      size="xl"
      padding={0}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      radius="lg"
      styles={{
        body: { display: "flex", flexDirection: "column", maxHeight: "85vh" },
        content: { overflow: "hidden" },
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box style={{ padding: "24px 28px 16px", flexShrink: 0 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="md" align="flex-start" wrap="nowrap">
            <Box
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--mantine-color-blue-filled)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <SystemUpdateAltIcon style={{ fontSize: 26, color: "white" }} />
            </Box>
            <Box>
              <Text fw={700} size="xl" lh={1.3}>
                {t("update.modalTitle", "Update Available")}
              </Text>
              <Text size="sm" c="dimmed" mt={2}>
                {t(
                  "update.modalSubtitle",
                  "A new version of Stirling-PDF is ready to install.",
                )}
              </Text>
            </Box>
          </Group>
          {canClose && (
            <CloseButton
              onClick={onClose}
              size="lg"
              variant="subtle"
              aria-label="Close update modal"
            />
          )}
        </Group>
      </Box>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <Box style={{ flex: 1, overflowY: "auto", padding: "0 28px 16px" }}>
        <Stack gap="lg">
          {/* Version comparison */}
          <Box
            style={{
              border:
                "1px solid var(--border-subtle, var(--mantine-color-default-border))",
              borderRadius: 12,
              padding: "24px 28px",
              background:
                "color-mix(in srgb, var(--mantine-color-body) 100%, transparent)",
            }}
          >
            <Group justify="center" align="center" wrap="nowrap" gap="xl">
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} lh={1}>
                  {t("update.current", "Current Version")}
                </Text>
                <Text fw={800} fz={32} lh={1.1}>
                  {currentVersion}
                </Text>
              </Stack>
              <ArrowForwardIcon
                style={{
                  fontSize: 28,
                  color: "var(--mantine-color-dimmed)",
                  flexShrink: 0,
                }}
              />
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} lh={1}>
                  {t("update.latest", "Latest Version")}
                </Text>
                <Group gap="sm" align="center">
                  <Text fw={800} fz={32} c="blue" lh={1.1}>
                    {updateSummary.latest_version}
                  </Text>
                  {(isStable || updateSummary.latest_stable_version) && (
                    // `variant="filled" color="green"` produced an acid-green
                    // pill that was noisy in light mode and oddly washed out
                    // in dark mode. `light` gives a soft teal-ish chip that
                    // reads well in both themes.
                    <Badge
                      color="teal"
                      variant="light"
                      size="sm"
                      radius="sm"
                      style={{ marginTop: 4 }}
                    >
                      {t("update.stable", "STABLE")}
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Group>
          </Box>

          {/* Priority badge + recommendation — compact single line */}
          <Group gap="sm" align="center" px={4}>
            <Badge color={priorityColor} variant="filled" size="lg" radius="sm">
              {getPriorityLabel(updateSummary.max_priority)}
            </Badge>
            <Text size="sm" c="dimmed" style={{ flex: 1 }}>
              {updateSummary.recommended_action ||
                t(
                  "update.defaultRecommendation",
                  "This update contains important fixes and improvements.",
                )}
            </Text>
          </Group>

          {/* Admin permissions required — shown when can_install_updates
              reported that msiexec would need UAC elevation this user
              can't satisfy. Placed right after the priority row so it's
              the first thing users see when they open the modal and the
              Install Now button (below) is disabled as a result. */}
          {desktopInstall && installBlocked && (
            <Alert
              variant="light"
              color="orange"
              radius="md"
              icon={<WarningAmberIcon style={{ fontSize: 18 }} />}
              title={t(
                "desktopUpdate.blocked.title",
                "Administrator permissions required",
              )}
            >
              <Text size="sm">
                {t(
                  "desktopUpdate.blocked.message",
                  "Stirling-PDF does not have permission to update itself on this machine.",
                )}{" "}
                <Anchor
                  href={WINDOWS_INSTALL_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(
                    "desktopUpdate.blocked.docsLink",
                    "View installation documentation",
                  )}
                </Anchor>
              </Text>
            </Alert>
          )}

          {/* What's New card */}
          <Box
            style={{
              background:
                "color-mix(in srgb, var(--mantine-color-blue-filled) 8%, transparent)",
              borderRadius: 12,
              padding: "16px 20px",
              border:
                "1px solid color-mix(in srgb, var(--mantine-color-blue-filled) 15%, transparent)",
            }}
          >
            <Group justify="space-between" align="center">
              <Group gap={8}>
                <StarIcon
                  style={{
                    fontSize: 18,
                    color: "var(--mantine-color-blue-filled)",
                  }}
                />
                <Text fw={600} size="sm">
                  {t("update.whatsNewIn", "What's new in")}{" "}
                  {updateSummary.latest_version}
                </Text>
              </Group>
              <Group gap="sm">
                <Text
                  size="sm"
                  component="a"
                  href={`https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v${updateSummary.latest_version}`}
                  target="_blank"
                  c="blue"
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {t("update.releaseNotes", "Release Notes")}{" "}
                  <OpenInNewIcon style={{ fontSize: 14 }} />
                </Text>
                <Text
                  size="sm"
                  component="a"
                  href="https://github.com/Stirling-Tools/Stirling-PDF/releases"
                  target="_blank"
                  c="dimmed"
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {t("update.allReleases", "All Releases")}{" "}
                  <OpenInNewIcon style={{ fontSize: 14 }} />
                </Text>
              </Group>
            </Group>
          </Box>

          {/* Breaking changes */}
          {updateSummary.any_breaking && (
            <Alert
              variant="light"
              color="orange"
              radius="md"
              icon={<WarningAmberIcon style={{ fontSize: 18 }} />}
              title={t(
                "update.breakingChangesDetected",
                "Breaking Changes Detected",
              )}
            >
              {t(
                "update.breakingChangesMessage",
                "Some versions contain breaking changes. Please review the migration guides below before updating.",
              )}
            </Alert>
          )}

          {/* Migration guides */}
          {updateSummary.migration_guides &&
            updateSummary.migration_guides.length > 0 && (
              <Box>
                <Text fw={600} size="sm" mb={4}>
                  {t("update.migrationGuides", "Migration Guides")}
                </Text>
                <Text size="xs" c="dimmed" mb="sm">
                  {t(
                    "update.migrationGuidesDesc",
                    "Review important changes before updating.",
                  )}
                </Text>
                <Stack gap={0}>
                  {updateSummary.migration_guides.map((guide, idx) => (
                    <Box
                      key={idx}
                      style={{
                        borderTop:
                          idx === 0
                            ? "1px solid var(--border-subtle, var(--mantine-color-default-border))"
                            : undefined,
                        borderBottom:
                          "1px solid var(--border-subtle, var(--mantine-color-default-border))",
                        padding: "10px 12px",
                      }}
                    >
                      <Group
                        justify="space-between"
                        align="center"
                        wrap="nowrap"
                      >
                        <Group gap="sm" style={{ flex: 1 }}>
                          <Box
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "var(--mantine-color-green-filled)",
                              flexShrink: 0,
                            }}
                          />
                          <Text fw={600} size="sm">
                            {guide.version}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {guide.notes}
                          </Text>
                        </Group>
                        <Button
                          component="a"
                          href={guide.url}
                          target="_blank"
                          variant="default"
                          size="xs"
                          rightSection={
                            <OpenInNewIcon style={{ fontSize: 12 }} />
                          }
                        >
                          {t("update.viewGuide", "View Guide")}
                        </Button>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

          {/* ── Version history ─────────────────────────────────────────────── */}
          <Divider />
          {loading ? (
            <Center py="lg">
              <Group gap="sm">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  {t(
                    "update.loadingDetailedInfo",
                    "Loading version details...",
                  )}
                </Text>
              </Group>
            </Center>
          ) : visibleVersions.length > 0 ? (
            <Box>
              <Group justify="space-between" align="center" mb="sm">
                <Text fw={600} size="sm">
                  {t("update.versionHistory", "Version History")}
                </Text>
                <Text size="xs" c="dimmed">
                  {sortedVersions.length}{" "}
                  {sortedVersions.length === 1 ? "version" : "versions"}
                </Text>
              </Group>
              <Stack gap={0}>
                {visibleVersions.map((version, index) => {
                  const isExpanded = expandedVersions.has(index);
                  return (
                    <Box
                      key={index}
                      style={{
                        borderTop:
                          index === 0
                            ? "1px solid var(--border-subtle, var(--mantine-color-default-border))"
                            : undefined,
                        borderBottom:
                          "1px solid var(--border-subtle, var(--mantine-color-default-border))",
                      }}
                    >
                      <Group
                        justify="space-between"
                        align="center"
                        p="xs"
                        px="sm"
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleVersion(index)}
                      >
                        <Group gap="sm" style={{ flex: 1 }}>
                          <Text fw={700} size="sm" style={{ minWidth: 50 }}>
                            {version.version}
                          </Text>
                          <Badge
                            color={getPriorityColor(version.priority)}
                            size="xs"
                            variant="light"
                          >
                            {getPriorityLabel(version.priority)}
                          </Badge>
                          {version.compatibility.breaking_changes && (
                            <Badge color="orange" size="xs" variant="light">
                              {t("update.breaking", "Breaking")}
                            </Badge>
                          )}
                          {!isExpanded && version.announcement?.title && (
                            <Text
                              size="xs"
                              c="dimmed"
                              lineClamp={1}
                              style={{ flex: 1 }}
                            >
                              {version.announcement.title}
                            </Text>
                          )}
                        </Group>
                        <Group gap={4}>
                          <Button
                            component="a"
                            href={`https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v${version.version}`}
                            target="_blank"
                            variant="subtle"
                            size="xs"
                            px={6}
                            onClick={(e) => e.stopPropagation()}
                            rightSection={
                              <OpenInNewIcon style={{ fontSize: 11 }} />
                            }
                          >
                            {t("update.notes", "Notes")}
                          </Button>
                          {isExpanded ? (
                            <ExpandLessIcon
                              style={{
                                fontSize: 18,
                                color: "var(--mantine-color-dimmed)",
                              }}
                            />
                          ) : (
                            <ExpandMoreIcon
                              style={{
                                fontSize: 18,
                                color: "var(--mantine-color-dimmed)",
                              }}
                            />
                          )}
                        </Group>
                      </Group>
                      <Collapse in={isExpanded}>
                        <Box
                          px="sm"
                          pb="sm"
                          style={{
                            borderTop:
                              "1px solid var(--border-subtle, var(--mantine-color-default-border))",
                          }}
                        >
                          <Stack gap="sm" mt="sm">
                            {version.announcement?.message && (
                              <Text
                                size="sm"
                                c="dimmed"
                                style={{ lineHeight: 1.6 }}
                              >
                                {version.announcement.message}
                              </Text>
                            )}
                            {version.compatibility.breaking_changes && (
                              <Alert
                                variant="light"
                                color="orange"
                                radius="sm"
                                icon={
                                  <WarningAmberIcon style={{ fontSize: 16 }} />
                                }
                                title={t(
                                  "update.breakingChanges",
                                  "Breaking Changes",
                                )}
                              >
                                <Text size="sm">
                                  {version.compatibility.breaking_description ||
                                    t(
                                      "update.breakingChangesDefault",
                                      "This version contains breaking changes.",
                                    )}
                                </Text>
                                {version.compatibility.migration_guide_url && (
                                  <Button
                                    component="a"
                                    href={
                                      version.compatibility.migration_guide_url
                                    }
                                    target="_blank"
                                    variant="light"
                                    color="orange"
                                    size="xs"
                                    mt="xs"
                                    rightSection={
                                      <OpenInNewIcon style={{ fontSize: 14 }} />
                                    }
                                  >
                                    {t(
                                      "update.migrationGuide",
                                      "Migration Guide",
                                    )}
                                  </Button>
                                )}
                              </Alert>
                            )}
                          </Stack>
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}
              </Stack>
              {sortedVersions.length > 10 && (
                <Center mt="sm">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setShowAllVersions(!showAllVersions)}
                  >
                    {showAllVersions
                      ? t("update.showLess", "Show fewer versions")
                      : t("update.showMore", {
                          defaultValue: "Show all {{count}} versions",
                          count: sortedVersions.length,
                        })}
                  </Button>
                </Center>
              )}
            </Box>
          ) : null}

          {/* Desktop install progress */}
          {desktopInstall && desktopInstall.state !== "idle" && (
            <Box
              style={{
                border:
                  "1px solid var(--border-subtle, var(--mantine-color-default-border))",
                borderRadius: 12,
                padding: "16px 20px",
              }}
            >
              {(desktopInstall.state === "downloading" ||
                desktopInstall.state === "installing") && (
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={600}>
                      {desktopInstall.state === "downloading"
                        ? t(
                            "desktopUpdate.downloading",
                            "Downloading update...",
                          )
                        : t("desktopUpdate.installing", "Installing update...")}
                    </Text>
                    {desktopInstall.progress &&
                      desktopInstall.progress.total !== null && (
                        <Text size="xs" c="dimmed">
                          {formatBytes(desktopInstall.progress.downloaded)} /{" "}
                          {formatBytes(desktopInstall.progress.total)}
                        </Text>
                      )}
                  </Group>
                  <Progress
                    value={
                      desktopInstall.state === "installing"
                        ? 100
                        : (desktopInstall.progress?.percent ?? 0)
                    }
                    size="lg"
                    animated
                    radius="xl"
                  />
                  {desktopInstall.state === "installing" && (
                    <Alert variant="light" color="blue" radius="sm" py="xs">
                      <Text size="xs">
                        {t(
                          "desktopUpdate.installingWarning",
                          "The app will close automatically to complete the installation.",
                        )}
                      </Text>
                    </Alert>
                  )}
                </Stack>
              )}
              {desktopInstall.state === "ready-to-restart" && (
                <Alert
                  icon={<CheckCircleOutlineIcon />}
                  color="green"
                  variant="light"
                  radius="md"
                  title={t("desktopUpdate.readyToRestart", "Update Ready")}
                >
                  {t(
                    "desktopUpdate.restartMessage",
                    "The update has been installed. Restart the app to finish.",
                  )}
                </Alert>
              )}
              {desktopInstall.state === "error" && (
                <Alert
                  icon={<ErrorOutlineIcon />}
                  color="red"
                  variant="light"
                  radius="md"
                  title={t("desktopUpdate.updateFailed", "Update Failed")}
                >
                  {desktopInstall.errorMessage ??
                    t(
                      "desktopUpdate.updateFailedMessage",
                      "Failed to download or install the update.",
                    )}
                </Alert>
              )}
            </Box>
          )}
        </Stack>
      </Box>

      {/* ── Sticky footer ──────────────────────────────────────────────────── */}
      <Box
        style={{
          borderTop:
            "1px solid var(--border-subtle, var(--mantine-color-default-border))",
          padding: "16px 28px",
          flexShrink: 0,
        }}
      >
        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={handleLater}
            disabled={!canClose}
            radius="md"
            size="md"
          >
            {t("update.later", "Later")}
          </Button>
          {desktopInstall ? (
            desktopInstall.state === "ready-to-restart" ? (
              <Button
                color="blue"
                radius="md"
                size="md"
                leftSection={<RestartAltIcon style={{ fontSize: 20 }} />}
                onClick={() => void desktopInstall.actions.restartApp()}
              >
                {t("desktopUpdate.restartNow", "Restart Now")}
              </Button>
            ) : desktopInstall.state === "idle" ||
              desktopInstall.state === "error" ? (
              <>
                {/* When install is blocked (non-admin) or the tauri updater
                      failed, the user still needs a way forward — show a
                      "Download Latest" link to the GitHub release page as a
                      fallback alongside the disabled Install Now button. */}
                {(installBlocked || desktopInstall.state === "error") &&
                  downloadUrl && (
                    <Button
                      component="a"
                      href={downloadUrl}
                      target="_blank"
                      variant="default"
                      radius="md"
                      size="md"
                      leftSection={<DownloadIcon style={{ fontSize: 16 }} />}
                    >
                      {t("update.downloadLatest", "Download Latest")}
                    </Button>
                  )}
                <Button
                  color="blue"
                  radius="md"
                  size="lg"
                  leftSection={<DownloadIcon style={{ fontSize: 20 }} />}
                  onClick={() => void desktopInstall.actions.startInstall()}
                  disabled={installBlocked}
                  styles={{
                    root: { paddingLeft: 16, paddingRight: 20 },
                    inner: { gap: 10 },
                  }}
                >
                  <Box>
                    <Text size="sm" fw={700} lh={1.2}>
                      {t("desktopUpdate.installNow", "Install Now")}
                    </Text>
                    <Text size="xs" lh={1.2} style={{ opacity: 0.7 }}>
                      {formatSize(downloadSizeBytes)}
                    </Text>
                  </Box>
                </Button>
              </>
            ) : null
          ) : (
            // Tauri updater not available at all — only show the external
            // download link. This is the fallback when latest.json is
            // unreachable, the pubkey is wrong, signatures don't match, etc.
            downloadUrl && (
              <Button
                component="a"
                href={downloadUrl}
                target="_blank"
                color="blue"
                radius="md"
                size="lg"
                leftSection={<DownloadIcon style={{ fontSize: 20 }} />}
              >
                {t("update.downloadLatest", "Download Latest")}
              </Button>
            )
          )}
        </Group>
      </Box>
    </Modal>
  );
};

export default UpdateModal;
