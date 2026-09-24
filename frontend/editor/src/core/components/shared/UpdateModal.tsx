import React, { useState, useEffect, type ReactNode } from "react";
import {
  Modal,
  Stack,
  Text,
  Badge,
  Group,
  Loader,
  Center,
  Box,
  Collapse,
  Progress,
  Alert,
  Divider,
  Anchor,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  updateService,
  UpdateSummary,
  FullUpdateInfo,
  MachineInfo,
  VersionUpdate,
} from "@app/services/updateService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import { handleExternalLinkClick } from "@app/platform/externalLinkClick";
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
  /**
   * Kick off the Tauri updater download + install. Resolves to `true` on
   * success and `false` on failure — never rejects. Auto-mode callers MUST
   * check the return value before calling [`restartApp`]; restarting on a
   * failed install puts the app in a restart loop because the install state
   * (`hasChecked`) resets on every launch.
   */
  startInstall: () => Promise<boolean>;
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

type DesktopInstall = NonNullable<UpdateModalProps["desktopInstall"]>;
type MigrationGuide = NonNullable<UpdateSummary["migration_guides"]>[number];

const RELEASES_URL = "https://github.com/Stirling-Tools/Stirling-PDF/releases";

// Show max 10 initially to keep the modal manageable
const INITIAL_VERSION_COUNT = 10;

function releaseTagUrl(version: string | null): string {
  return `${RELEASES_URL}/tag/v${version}`;
}

function getPriorityColor(priority: string): string {
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
}

function getPriorityLabel(t: TFunction, priority: string): string {
  const key = priority?.toLowerCase();
  return t(`update.priority.${key}`, priority || "Normal");
}

const handleExternalLink =
  (url: string) => (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    handleExternalLinkClick(url, e);
  };

interface UpdateModalHeaderProps {
  canClose: boolean;
  onClose: () => void;
}

function UpdateModalHeader({ canClose, onClose }: UpdateModalHeaderProps) {
  const { t } = useTranslation();
  return (
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
            <Icon
              name="square-arrow-down"
              size={26}
              style={{ color: "white" }}
            />
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
          <ActionIcon
            onClick={onClose}
            size="lg"
            variant="tertiary"
            aria-label={t("update.closeModal", "Close update modal")}
          >
            <Icon name="x" size={20} />
          </ActionIcon>
        )}
      </Group>
    </Box>
  );
}

function VersionColumn({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={2} align="center">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lh={1}>
        {label}
      </Text>
      {children}
    </Stack>
  );
}

function StableBadge({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
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
  );
}

interface VersionComparisonProps {
  currentVersion: string;
  updateSummary: UpdateSummary;
}

function VersionComparison({
  currentVersion,
  updateSummary,
}: VersionComparisonProps) {
  const { t } = useTranslation();
  const isStable =
    updateSummary.latest_stable_version === updateSummary.latest_version;
  return (
    <Box
      style={{
        border:
          "1px solid var(--c-border-subtle, var(--mantine-color-default-border))",
        borderRadius: 12,
        padding: "24px 28px",
        background:
          "color-mix(in srgb, var(--mantine-color-body) 100%, transparent)",
      }}
    >
      <Group justify="center" align="center" wrap="nowrap" gap="xl">
        <VersionColumn label={t("update.current", "Current Version")}>
          <Text fw={800} fz={32} lh={1.1}>
            {currentVersion}
          </Text>
        </VersionColumn>
        <Icon
          name="arrow-right"
          size={28}
          style={{
            color: "var(--mantine-color-dimmed)",
            flexShrink: 0,
          }}
        />
        <VersionColumn label={t("update.latest", "Latest Version")}>
          <Group gap="sm" align="center">
            <Text fw={800} fz={32} c="var(--c-accent-text)" lh={1.1}>
              {updateSummary.latest_version}
            </Text>
            <StableBadge
              show={Boolean(isStable || updateSummary.latest_stable_version)}
            />
          </Group>
        </VersionColumn>
      </Group>
    </Box>
  );
}

/**
 * Breaking changes show here as a compact chip rather than a full-width
 * banner; the per-version detail lives in the version history.
 */
function UpdatePriority({ updateSummary }: { updateSummary: UpdateSummary }) {
  const { t } = useTranslation();
  return (
    <Group gap="sm" align="center" px={4}>
      <Badge
        color={getPriorityColor(updateSummary.max_priority)}
        variant="filled"
        size="lg"
        radius="sm"
      >
        {getPriorityLabel(t, updateSummary.max_priority)}
      </Badge>
      {updateSummary.any_breaking && (
        <Badge
          color="orange"
          variant="light"
          size="lg"
          radius="sm"
          leftSection={<Icon name="triangle-alert" size={14} />}
        >
          {t("update.breaking", "Breaking")}
        </Badge>
      )}
      <Text size="sm" c="dimmed" style={{ flex: 1 }}>
        {updateSummary.recommended_action ||
          t(
            "update.defaultRecommendation",
            "This update contains important fixes and improvements.",
          )}
      </Text>
    </Group>
  );
}

/**
 * Shown when can_install_updates reported that msiexec would need UAC
 * elevation this user can't satisfy.
 */
function InstallBlockedAlert({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Alert
      variant="light"
      color="orange"
      radius="md"
      icon={<Icon name="triangle-alert" size={18} />}
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
          onClick={handleExternalLink(WINDOWS_INSTALL_DOCS_URL)}
          // Sits inside a sentence, so the accent alone does not
          // separate it from the surrounding copy.
          underline="always"
        >
          {t(
            "desktopUpdate.blocked.docsLink",
            "View installation documentation",
          )}
        </Anchor>
      </Text>
    </Alert>
  );
}

interface ExternalTextLinkProps {
  href: string;
  color: string;
  children: ReactNode;
}

function ExternalTextLink({ href, color, children }: ExternalTextLinkProps) {
  return (
    <Text
      size="sm"
      component="a"
      href={href}
      target="_blank"
      onClick={handleExternalLink(href)}
      c={color}
      style={{
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {children} <Icon name="external-link" size={14} />
    </Text>
  );
}

function WhatsNewCard({ version }: { version: string | null }) {
  const { t } = useTranslation();
  return (
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
          <Icon
            name="star"
            size={18}
            filled
            style={{ color: "var(--c-accent-text)" }}
          />
          <Text fw={600} size="sm">
            {t("update.whatsNewIn", "What's new in")} {version}
          </Text>
        </Group>
        <Group gap="sm">
          <ExternalTextLink
            href={releaseTagUrl(version)}
            color="var(--c-accent-text)"
          >
            {t("update.releaseNotes", "Release Notes")}
          </ExternalTextLink>
          <ExternalTextLink href={RELEASES_URL} color="dimmed">
            {t("update.allReleases", "All Releases")}
          </ExternalTextLink>
        </Group>
      </Group>
    </Box>
  );
}

function MigrationGuideRow({
  guide,
  isFirst,
}: {
  guide: MigrationGuide;
  isFirst: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Box
      style={{
        borderTop: isFirst
          ? "1px solid var(--c-border-subtle, var(--mantine-color-default-border))"
          : undefined,
        borderBottom:
          "1px solid var(--c-border-subtle, var(--mantine-color-default-border))",
        padding: "10px 12px",
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
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
          as="a"
          href={guide.url}
          target="_blank"
          onClick={handleExternalLink(guide.url)}
          variant="secondary"
          size="sm"
          rightSection={<Icon name="external-link" size={12} />}
        >
          {t("update.viewGuide", "View Guide")}
        </Button>
      </Group>
    </Box>
  );
}

function MigrationGuides({ guides }: { guides: MigrationGuide[] | undefined }) {
  const { t } = useTranslation();
  if (!guides || guides.length === 0) return null;
  return (
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
        {guides.map((guide, idx) => (
          <MigrationGuideRow key={idx} guide={guide} isFirst={idx === 0} />
        ))}
      </Stack>
    </Box>
  );
}

interface VersionSummaryProps {
  version: VersionUpdate;
  isExpanded: boolean;
  onToggle: () => void;
}

function VersionSummary({
  version,
  isExpanded,
  onToggle,
}: VersionSummaryProps) {
  const { t } = useTranslation();
  return (
    <Group
      justify="space-between"
      align="center"
      p="xs"
      px="sm"
      style={{ cursor: "pointer" }}
      onClick={onToggle}
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
          {getPriorityLabel(t, version.priority)}
        </Badge>
        {version.compatibility.breaking_changes && (
          <Badge color="orange" size="xs" variant="light">
            {t("update.breaking", "Breaking")}
          </Badge>
        )}
        {!isExpanded && version.announcement?.title && (
          <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
            {version.announcement.title}
          </Text>
        )}
      </Group>
      <Group gap={4}>
        <Button
          as="a"
          href={releaseTagUrl(version.version)}
          target="_blank"
          variant="tertiary"
          size="sm"
          onClick={handleExternalLink(releaseTagUrl(version.version))}
          rightSection={<Icon name="external-link" size={11} />}
        >
          {t("update.notes", "Notes")}
        </Button>
        <Icon
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          style={{ color: "var(--mantine-color-dimmed)" }}
        />
      </Group>
    </Group>
  );
}

function BreakingChangesAlert({
  compatibility,
}: {
  compatibility: VersionUpdate["compatibility"];
}) {
  const { t } = useTranslation();
  if (!compatibility.breaking_changes) return null;
  const guideUrl = compatibility.migration_guide_url;
  return (
    <Alert
      variant="light"
      color="orange"
      radius="sm"
      icon={<Icon name="triangle-alert" size={16} />}
      title={t("update.breakingChanges", "Breaking Changes")}
    >
      <Text size="sm">
        {compatibility.breaking_description ||
          t(
            "update.breakingChangesDefault",
            "This version contains breaking changes.",
          )}
      </Text>
      {guideUrl && (
        <Button
          as="a"
          href={guideUrl}
          target="_blank"
          onClick={handleExternalLink(guideUrl)}
          variant="secondary"
          accent="warning"
          size="sm"
          style={{ marginTop: "var(--mantine-spacing-xs)" }}
          rightSection={<Icon name="external-link" size={14} />}
        >
          {t("update.migrationGuide", "Migration Guide")}
        </Button>
      )}
    </Alert>
  );
}

function VersionDetails({ version }: { version: VersionUpdate }) {
  return (
    <Box
      px="sm"
      pb="sm"
      style={{
        borderTop:
          "1px solid var(--c-border-subtle, var(--mantine-color-default-border))",
      }}
    >
      <Stack gap="sm" mt="sm">
        {version.announcement?.message && (
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
            {version.announcement.message}
          </Text>
        )}
        <BreakingChangesAlert compatibility={version.compatibility} />
      </Stack>
    </Box>
  );
}

interface VersionHistoryItemProps {
  version: VersionUpdate;
  isFirst: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function VersionHistoryItem({
  version,
  isFirst,
  isExpanded,
  onToggle,
}: VersionHistoryItemProps) {
  return (
    <Box
      style={{
        borderTop: isFirst
          ? "1px solid var(--c-border-subtle, var(--mantine-color-default-border))"
          : undefined,
        borderBottom:
          "1px solid var(--c-border-subtle, var(--mantine-color-default-border))",
      }}
    >
      <VersionSummary
        version={version}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      <Collapse in={isExpanded}>
        <VersionDetails version={version} />
      </Collapse>
    </Box>
  );
}

interface ShowAllVersionsButtonProps {
  total: number;
  showAll: boolean;
  onToggle: () => void;
}

function ShowAllVersionsButton({
  total,
  showAll,
  onToggle,
}: ShowAllVersionsButtonProps) {
  const { t } = useTranslation();
  if (total <= INITIAL_VERSION_COUNT) return null;
  return (
    <Center mt="sm">
      <Button variant="tertiary" size="sm" onClick={onToggle}>
        {showAll
          ? t("update.showLess", "Show fewer versions")
          : t("update.showMore", {
              defaultValue: "Show all {{count}} versions",
              count: total,
            })}
      </Button>
    </Center>
  );
}

interface VersionHistoryProps {
  loading: boolean;
  versions: VersionUpdate[];
  expandedVersions: Set<number>;
  onToggleVersion: (index: number) => void;
  showAll: boolean;
  onToggleShowAll: () => void;
}

function VersionHistory({
  loading,
  versions,
  expandedVersions,
  onToggleVersion,
  showAll,
  onToggleShowAll,
}: VersionHistoryProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Center py="lg">
        <Group gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {t("update.loadingDetailedInfo", "Loading version details...")}
          </Text>
        </Group>
      </Center>
    );
  }
  const visibleVersions = showAll
    ? versions
    : versions.slice(0, INITIAL_VERSION_COUNT);
  if (visibleVersions.length === 0) return null;
  return (
    <Box>
      <Group justify="space-between" align="center" mb="sm">
        <Text fw={600} size="sm">
          {t("update.versionHistory", "Version History")}
        </Text>
        <Text size="xs" c="dimmed">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
        </Text>
      </Group>
      <Stack gap={0}>
        {visibleVersions.map((version, index) => (
          <VersionHistoryItem
            key={index}
            version={version}
            isFirst={index === 0}
            isExpanded={expandedVersions.has(index)}
            onToggle={() => onToggleVersion(index)}
          />
        ))}
      </Stack>
      <ShowAllVersionsButton
        total={versions.length}
        showAll={showAll}
        onToggle={onToggleShowAll}
      />
    </Box>
  );
}

interface InstallProgressProps {
  state: "downloading" | "installing";
  progress: DesktopInstallProgress | null;
}

function InstallProgress({ state, progress }: InstallProgressProps) {
  const { t } = useTranslation();
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          {state === "downloading"
            ? t("desktopUpdate.downloading", "Downloading update...")
            : t("desktopUpdate.installing", "Installing update...")}
        </Text>
        {progress && progress.total !== null && (
          <Text size="xs" c="dimmed">
            {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
          </Text>
        )}
      </Group>
      <Progress
        value={state === "installing" ? 100 : (progress?.percent ?? 0)}
        size="lg"
        animated
        radius="xl"
      />
      {state === "installing" && (
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
  );
}

function DesktopInstallMessage({
  desktopInstall,
}: {
  desktopInstall: DesktopInstall;
}) {
  const { t } = useTranslation();
  switch (desktopInstall.state) {
    case "downloading":
    case "installing":
      return (
        <InstallProgress
          state={desktopInstall.state}
          progress={desktopInstall.progress}
        />
      );
    case "ready-to-restart":
      return (
        <Alert
          icon={<Icon name="circle-check" />}
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
      );
    case "error":
      return (
        <Alert
          icon={<Icon name="circle-alert" />}
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
      );
    default:
      return null;
  }
}

function DesktopInstallStatus({
  desktopInstall,
}: {
  desktopInstall: DesktopInstall | undefined;
}) {
  if (!desktopInstall || desktopInstall.state === "idle") return null;
  return (
    <Box
      style={{
        border:
          "1px solid var(--c-border-subtle, var(--mantine-color-default-border))",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <DesktopInstallMessage desktopInstall={desktopInstall} />
    </Box>
  );
}

/** Link to the release download page; renders nothing without a URL. */
function DownloadLatestButton({
  url,
  secondary = false,
}: {
  url: string | null;
  secondary?: boolean;
}) {
  const { t } = useTranslation();
  if (!url) return null;
  return (
    <Button
      as="a"
      href={url}
      target="_blank"
      onClick={handleExternalLink(url)}
      variant={secondary ? "secondary" : undefined}
      size="md"
      leftSection={<Icon name="download" size={secondary ? 16 : 20} />}
    >
      {t("update.downloadLatest", "Download Latest")}
    </Button>
  );
}

interface UpdateActionsProps {
  desktopInstall: DesktopInstall | undefined;
  installBlocked: boolean;
  downloadUrl: string | null;
  downloadSizeBytes: number | null | undefined;
}

function UpdateActions({
  desktopInstall,
  installBlocked,
  downloadUrl,
  downloadSizeBytes,
}: UpdateActionsProps) {
  const { t } = useTranslation();
  if (!desktopInstall) {
    // Tauri updater not available at all: only show the external download
    // link. This is the fallback when latest.json is unreachable, the pubkey
    // is wrong, signatures don't match, etc.
    return <DownloadLatestButton url={downloadUrl} />;
  }
  if (desktopInstall.state === "ready-to-restart") {
    return (
      <Button
        size="md"
        leftSection={<Icon name="rotate-ccw" size={20} />}
        onClick={() => void desktopInstall.actions.restartApp()}
      >
        {t("desktopUpdate.restartNow", "Restart Now")}
      </Button>
    );
  }
  if (desktopInstall.state !== "idle" && desktopInstall.state !== "error") {
    return null;
  }
  // When install is blocked (non-admin) or the tauri updater failed, the user
  // still needs a way forward: offer the GitHub release page alongside the
  // disabled Install Now button.
  const offerDownload = installBlocked || desktopInstall.state === "error";
  return (
    <>
      <DownloadLatestButton
        url={offerDownload ? downloadUrl : null}
        secondary
      />
      <Button
        size="md"
        leftSection={<Icon name="download" size={20} />}
        onClick={() => void desktopInstall.actions.startInstall()}
        disabled={installBlocked}
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
  );
}

interface UpdateModalFooterProps extends UpdateActionsProps {
  canClose: boolean;
  onLater: () => void;
}

function UpdateModalFooter({
  canClose,
  onLater,
  ...actions
}: UpdateModalFooterProps) {
  const { t } = useTranslation();
  return (
    <Box
      style={{
        borderTop:
          "1px solid var(--c-border-subtle, var(--mantine-color-default-border))",
        padding: "16px 28px",
        flexShrink: 0,
      }}
    >
      <Group justify="flex-end" gap="sm">
        <Button
          variant="secondary"
          onClick={onLater}
          disabled={!canClose}
          size="md"
        >
          {t("update.later", "Later")}
        </Button>
        <UpdateActions {...actions} />
      </Group>
    </Box>
  );
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
  const [showAllVersions, setShowAllVersions] = useState(false);

  const { machineType, activeSecurity, licenseType } = machineInfo;
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setLoading(true);
    setExpandedVersions(new Set([0]));
    updateService
      .getFullUpdateInfo(currentVersion, {
        machineType,
        activeSecurity,
        licenseType,
      })
      .then((info) => {
        if (cancelled) return;
        setFullUpdateInfo(info);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, currentVersion, machineType, activeSecurity, licenseType]);

  const toggleVersion = (index: number) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
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

  return (
    // Composed rather than the plain <Modal>, because only Modal.Content lands
    // props on the role="dialog" element — the modal draws its own header, so
    // the dialog needs an aria-label to have an accessible name.
    <Modal.Root
      opened={opened}
      onClose={canClose ? onClose : () => undefined}
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
      <Modal.Overlay />
      <Modal.Content
        radius="lg"
        aria-label={t("update.modalTitle", "Update Available")}
      >
        <Modal.Body>
          <UpdateModalHeader canClose={canClose} onClose={onClose} />

          <Box style={{ flex: 1, overflowY: "auto", padding: "0 28px 16px" }}>
            <Stack gap="lg">
              <VersionComparison
                currentVersion={currentVersion}
                updateSummary={updateSummary}
              />
              <UpdatePriority updateSummary={updateSummary} />
              {/* Right after the priority row so it's the first thing users
                  see when they open the modal and the Install Now button
                  (below) is disabled as a result. */}
              <InstallBlockedAlert show={installBlocked} />
              <WhatsNewCard version={updateSummary.latest_version} />
              <MigrationGuides guides={updateSummary.migration_guides} />
              <Divider />
              <VersionHistory
                loading={loading}
                versions={sortedVersions}
                expandedVersions={expandedVersions}
                onToggleVersion={toggleVersion}
                showAll={showAllVersions}
                onToggleShowAll={() => setShowAllVersions(!showAllVersions)}
              />
              <DesktopInstallStatus desktopInstall={desktopInstall} />
            </Stack>
          </Box>

          <UpdateModalFooter
            canClose={canClose}
            onLater={handleLater}
            desktopInstall={desktopInstall}
            installBlocked={installBlocked}
            downloadUrl={downloadUrl}
            downloadSizeBytes={downloadSizeBytes}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

export default UpdateModal;
