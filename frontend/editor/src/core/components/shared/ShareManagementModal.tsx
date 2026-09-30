import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Stack,
  Text,
  Group,
  Alert,
  TextInput,
  Badge,
  Paper,
  SimpleGrid,
  ScrollArea,
  Select,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import apiClient from "@app/services/apiClient";
import { absoluteWithBasePath } from "@app/constants/app";
import { alert } from "@app/components/toast";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import { fileStorage } from "@app/services/fileStorage";
import { useFileActions } from "@app/contexts/FileContext";

interface ShareLinkResponse {
  token: string;
  accessRole?: string | null;
  createdAt?: string;
}

interface ShareLinkAccessResponse {
  username?: string | null;
  accessType?: string | null;
  accessedAt?: string | null;
}

interface SharedUser {
  username: string;
  accessRole?: string | null;
}

interface StoredFileResponse {
  shareLinks?: ShareLinkResponse[];
  ownedByCurrentUser?: boolean;
  sharedWithUsers?: string[];
  sharedUsers?: SharedUser[];
}

type ShareRole = "editor" | "commenter" | "viewer";

const SHARE_ROLES: ShareRole[] = ["editor", "commenter", "viewer"];

interface ShareManagementModalProps {
  opened: boolean;
  onClose: () => void;
  file: StirlingFileStub;
}

function roleLabel(t: TFunction, role: string): string {
  if (role === "editor") return t("storageShare.roleEditor", "Editor");
  if (role === "commenter") return t("storageShare.roleCommenter", "Commenter");
  return t("storageShare.roleViewer", "Viewer");
}

function accessTypeLabel(
  t: TFunction,
  accessType: string | null | undefined,
): string {
  if (accessType === "VIEW") return t("storageShare.viewed", "Viewed");
  if (accessType === "DOWNLOAD") {
    return t("storageShare.downloaded", "Downloaded");
  }
  return t("storageShare.accessed", "Accessed");
}

interface RoleSelectProps {
  label?: string;
  value: string;
  onChange: (role: ShareRole) => void;
  size?: "xs";
}

function RoleSelect({ label, value, onChange, size }: RoleSelectProps) {
  const { t } = useTranslation();
  return (
    <Select
      label={label}
      value={value}
      onChange={(next) => onChange((next as ShareRole) || "editor")}
      comboboxProps={{
        withinPortal: true,
        zIndex: Z_INDEX_OVER_FILE_MANAGER_MODAL + 10,
      }}
      data={SHARE_ROLES.map((role) => ({
        value: role,
        label: roleLabel(t, role),
      }))}
      size={size}
    />
  );
}

function RoleBadge({ role }: { role: string | null | undefined }) {
  const { t } = useTranslation();
  if (!role) return null;
  return (
    <Badge variant="light" color="gray">
      {roleLabel(t, role)}
    </Badge>
  );
}

function CommenterHint({ role }: { role: string | null | undefined }) {
  const { t } = useTranslation();
  if (role !== "commenter") return null;
  return (
    <Text size="xs" c="dimmed">
      {t("storageShare.commenterHint", "Commenting is coming soon.")}
    </Text>
  );
}

interface ConfirmRemoveButtonProps {
  label: string;
  confirming: boolean;
  loading: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmRemoveButton({
  label,
  confirming,
  loading,
  onRequest,
  onCancel,
  onConfirm,
}: ConfirmRemoveButtonProps) {
  const { t } = useTranslation();
  if (confirming) {
    return (
      <Group gap="xs">
        <Button accent="danger" size="sm" onClick={onConfirm} loading={loading}>
          {t("confirm", "Confirm")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t("cancel", "Cancel")}
        </Button>
      </Group>
    );
  }
  return (
    <Button
      variant="secondary"
      accent="danger"
      size="sm"
      leftSection={<Icon name="trash" size={16} />}
      onClick={onRequest}
      disabled={loading}
    >
      {label}
    </Button>
  );
}

function ShareModalIntro({ fileName }: { fileName: string }) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" align="center" gap="md" mt="md">
      <Text size="sm" c="dimmed">
        {t(
          "storageShare.manageDescription",
          "Create and manage links to share this file.",
        )}
      </Text>
      <Text size="sm">
        {t("storageShare.fileLabel", "File")}:{" "}
        <Text span fw={600}>
          {fileName}
        </Text>
      </Text>
    </Group>
  );
}

function SharingErrorAlert({ message }: { message: string | null }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <Alert color="red" title={t("storageShare.errorTitle", "Sharing error")}>
      {message}
    </Alert>
  );
}

function SharingDisabledAlert({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Alert
      color="yellow"
      title={t("storageShare.sharingDisabled", "Sharing is disabled.")}
    >
      {t(
        "storageShare.sharingDisabledBody",
        "Sharing has been disabled by your server settings.",
      )}
    </Alert>
  );
}

interface LinkAccessCardProps {
  show: boolean;
  role: ShareRole;
  loading: boolean;
  onRoleChange: (role: ShareRole) => void;
  onGenerate: () => void;
}

function LinkAccessCard({
  show,
  role,
  loading,
  onRoleChange,
  onGenerate,
}: LinkAccessCardProps) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {t("storageShare.linkAccessTitle", "Share link access")}
          </Text>
        </Group>
        <RoleSelect
          label={t("storageShare.roleLabel", "Role")}
          value={role}
          onChange={onRoleChange}
        />
        <CommenterHint role={role} />
        <Group justify="flex-end" gap="sm">
          <Button
            leftSection={<Icon name="link" size={18} />}
            onClick={onGenerate}
            loading={loading}
          >
            {t("storageShare.generate", "Generate Link")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function SharedUsersCard({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          {t("storageShare.sharedUsersTitle", "Shared users")}
        </Text>
        {children}
      </Stack>
    </Paper>
  );
}

interface AddUserFormProps {
  value: string;
  error: string | null;
  disabled: boolean;
  canSubmit: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function AddUserForm({
  value,
  error,
  disabled,
  canSubmit,
  onChange,
  onSubmit,
}: AddUserFormProps) {
  const { t } = useTranslation();
  return (
    <Group align="flex-end" gap="sm" wrap="nowrap">
      <TextInput
        style={{ flex: 1 }}
        label={t("storageShare.usernameLabel", "Username or email")}
        placeholder={t(
          "storageShare.usernamePlaceholder",
          "Enter a username or email",
        )}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled}
        error={error}
      />
      <Button onClick={onSubmit} disabled={!canSubmit}>
        {t("storageShare.addUser", "Add")}
      </Button>
    </Group>
  );
}

interface EmailWarningAlertProps {
  show: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function EmailWarningAlert({
  show,
  loading,
  onCancel,
  onConfirm,
}: EmailWarningAlertProps) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Alert
      color="yellow"
      title={t("storageShare.emailWarningTitle", "Email address")}
      variant="light"
    >
      <Stack gap="xs">
        <Text size="sm">
          {t(
            "storageShare.emailWarningBody",
            "This looks like an email address. If this person is not already a Stirling PDF user, they will not be able to access the file.",
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {t("cancel", "Cancel")}
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            {t("storageShare.emailWarningConfirm", "Share anyway")}
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}

interface SharedUserRowProps {
  user: SharedUser;
  confirmingRemove: boolean;
  loading: boolean;
  onRoleChange: (role: ShareRole) => void;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}

function SharedUserRow({
  user,
  confirmingRemove,
  loading,
  onRoleChange,
  onRequestRemove,
  onCancelRemove,
  onRemove,
}: SharedUserRowProps) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={2}>
        <Text size="sm">{user.username}</Text>
        <CommenterHint role={user.accessRole} />
      </Stack>
      <Group gap="xs" align="center">
        <RoleSelect
          value={user.accessRole ?? "editor"}
          onChange={onRoleChange}
          size="xs"
        />
        <ConfirmRemoveButton
          label={t("storageShare.removeUser", "Remove")}
          confirming={confirmingRemove}
          loading={loading}
          onRequest={onRequestRemove}
          onCancel={onCancelRemove}
          onConfirm={onRemove}
        />
      </Group>
    </Group>
  );
}

interface SharedUserListProps {
  users: SharedUser[];
  confirmRemoveUser: string | null;
  loading: boolean;
  onRoleChange: (username: string, role: ShareRole) => void;
  onRequestRemove: (username: string) => void;
  onCancelRemove: () => void;
  onRemove: (username: string) => void;
}

function SharedUserList({
  users,
  confirmRemoveUser,
  loading,
  onRoleChange,
  onRequestRemove,
  onCancelRemove,
  onRemove,
}: SharedUserListProps) {
  const { t } = useTranslation();
  if (users.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t("storageShare.noSharedUsers", "No users have access yet.")}
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {users.map((user) => (
        <SharedUserRow
          key={user.username}
          user={user}
          confirmingRemove={confirmRemoveUser === user.username}
          loading={loading}
          onRoleChange={(role) => onRoleChange(user.username, role)}
          onRequestRemove={() => onRequestRemove(user.username)}
          onCancelRemove={onCancelRemove}
          onRemove={() => onRemove(user.username)}
        />
      ))}
    </Stack>
  );
}

interface ShareLinksCardProps {
  show: boolean;
  count: number;
  children: ReactNode;
}

function ShareLinksCard({ show, count, children }: ShareLinksCardProps) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {t("storageShare.linkLabel", "Share link")}
          </Text>
          {count > 0 && (
            <Badge variant="light" color="blue">
              {count}
            </Badge>
          )}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}

interface ShareLinkStatsProps {
  role: string | null | undefined;
  activity: ShareLinkAccessResponse[] | undefined;
}

function ShareLinkStats({ role, activity }: ShareLinkStatsProps) {
  const { t } = useTranslation();
  const viewCount =
    activity?.filter((entry) => entry.accessType === "VIEW").length ?? 0;
  const downloadCount =
    activity?.filter((entry) => entry.accessType === "DOWNLOAD").length ?? 0;
  const lastAccessedAt = activity?.[0]?.accessedAt;
  return (
    <Stack gap={4}>
      <Group gap="xs">
        <RoleBadge role={role} />
      </Group>
      <Group gap="sm" align="center">
        <Text size="xs" c="dimmed">
          {t("storageShare.viewsCount", "Views: {{count}}", {
            count: viewCount,
          })}
        </Text>
        <Text size="xs" c="dimmed">
          {t("storageShare.downloadsCount", "Downloads: {{count}}", {
            count: downloadCount,
          })}
        </Text>
        {lastAccessedAt && (
          <Text size="xs" c="dimmed">
            {t("storageShare.lastAccessed", "Last accessed")}:{" "}
            {new Date(lastAccessedAt).toLocaleString()}
          </Text>
        )}
      </Group>
    </Stack>
  );
}

interface ShareLinkItemProps {
  link: ShareLinkResponse;
  url: string;
  activity: ShareLinkAccessResponse[] | undefined;
  isSelected: boolean;
  confirmingRevoke: boolean;
  loading: boolean;
  onCopy: () => void;
  onToggleActivity: () => void;
  onRequestRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
}

function ShareLinkItem({
  link,
  url,
  activity,
  isSelected,
  confirmingRevoke,
  loading,
  onCopy,
  onToggleActivity,
  onRequestRevoke,
  onCancelRevoke,
  onRevoke,
}: ShareLinkItemProps) {
  const { t } = useTranslation();
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <TextInput
          readOnly
          value={url}
          label={t("storageShare.linkLabel", "Share link")}
          rightSection={
            <Button
              variant="tertiary"
              size="sm"
              leftSection={<Icon name="copy" size={16} />}
              onClick={onCopy}
            >
              {t("storageShare.copy", "Copy")}
            </Button>
          }
        />
        <Group justify="space-between" align="center">
          <ShareLinkStats role={link.accessRole} activity={activity} />
          <Group gap="xs">
            <Button
              variant={isSelected ? "secondary" : "primary"}
              size="sm"
              leftSection={<Icon name="rotate-ccw-clock" size={16} />}
              onClick={onToggleActivity}
            >
              {isSelected
                ? t("storageShare.hideActivity", "Hide activity")
                : t("storageShare.viewActivity", "View activity")}
            </Button>
            <ConfirmRemoveButton
              label={t("storageShare.removeLink", "Remove link")}
              confirming={confirmingRevoke}
              loading={loading}
              onRequest={onRequestRevoke}
              onCancel={onCancelRevoke}
              onConfirm={onRevoke}
            />
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}

interface ShareLinkListProps {
  links: ShareLinkResponse[];
  loading: boolean;
  baseUrl: string;
  activityMap: Record<string, ShareLinkAccessResponse[]>;
  selectedToken: string | null;
  confirmRevokeToken: string | null;
  onCopy: (token: string) => void;
  onToggleActivity: (token: string) => void;
  onRequestRevoke: (token: string) => void;
  onCancelRevoke: () => void;
  onRevoke: (token: string) => void;
}

function ShareLinkList({
  links,
  loading,
  baseUrl,
  activityMap,
  selectedToken,
  confirmRevokeToken,
  onCopy,
  onToggleActivity,
  onRequestRevoke,
  onCancelRevoke,
  onRevoke,
}: ShareLinkListProps) {
  const { t } = useTranslation();
  if (links.length === 0 && loading) return null;
  if (links.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t("storageShare.noLinks", "No active share links yet.")}
      </Text>
    );
  }
  return (
    <>
      {links.map((link) => (
        <ShareLinkItem
          key={link.token}
          link={link}
          url={`${baseUrl}${link.token}`}
          activity={activityMap[link.token]}
          isSelected={selectedToken === link.token}
          confirmingRevoke={confirmRevokeToken === link.token}
          loading={loading}
          onCopy={() => onCopy(link.token)}
          onToggleActivity={() => onToggleActivity(link.token)}
          onRequestRevoke={() => onRequestRevoke(link.token)}
          onCancelRevoke={onCancelRevoke}
          onRevoke={() => onRevoke(link.token)}
        />
      ))}
    </>
  );
}

function NoActivityText() {
  const { t } = useTranslation();
  return (
    <Text size="sm" c="dimmed">
      {t("storageShare.noActivity", "No activity yet.")}
    </Text>
  );
}

function ShareActivityEntry({ entry }: { entry: ShareLinkAccessResponse }) {
  const { t } = useTranslation();
  return (
    <Paper radius="md" p="xs" withBorder>
      <Group justify="space-between">
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            {entry.accessedAt
              ? new Date(entry.accessedAt).toLocaleString()
              : t("unknown", "Unknown")}
          </Text>
          <Text size="sm">
            {entry.username || t("storageShare.unknownUser", "Unknown user")}
          </Text>
        </Stack>
        <Badge size="sm" variant="light">
          {accessTypeLabel(t, entry.accessType)}
        </Badge>
      </Group>
    </Paper>
  );
}

function ShareActivityEntries({
  token,
  entries,
}: {
  token: string;
  entries: ShareLinkAccessResponse[];
}) {
  if (entries.length === 0) return <NoActivityText />;
  return (
    <>
      {entries.map((entry, index) => (
        <ShareActivityEntry key={`${token}-${index}`} entry={entry} />
      ))}
    </>
  );
}

function ShareActivityLog({
  token,
  activity,
}: {
  token: string | null;
  activity: ShareLinkAccessResponse[] | undefined;
}) {
  if (!token) return <NoActivityText />;
  return (
    <ScrollArea h={360} offsetScrollbars>
      <Stack gap="xs">
        <ShareActivityEntries token={token} entries={activity ?? []} />
      </Stack>
    </ScrollArea>
  );
}

interface ShareActivityCardProps {
  show: boolean;
  token: string | null;
  link: ShareLinkResponse | undefined;
  activity: ShareLinkAccessResponse[] | undefined;
}

function ShareActivityCard({
  show,
  token,
  link,
  activity,
}: ShareActivityCardProps) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {t("storageShare.viewActivity", "View activity")}
          </Text>
          <RoleBadge role={link?.accessRole} />
        </Group>
        <ShareActivityLog token={token} activity={activity} />
      </Stack>
    </Paper>
  );
}

const ShareManagementModal: React.FC<ShareManagementModalProps> = ({
  opened,
  onClose,
  file,
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const sharingEnabled = config?.storageSharingEnabled === true;
  const shareLinksEnabled = config?.storageShareLinksEnabled === true;
  const { actions } = useFileActions();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLinkResponse[]>([]);
  const [activityMap, setActivityMap] = useState<
    Record<string, ShareLinkAccessResponse[]>
  >({});
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [shareUsername, setShareUsername] = useState("");
  const [shareRole, setShareRole] = useState<ShareRole>("editor");
  const [showEmailWarning, setShowEmailWarning] = useState(false);
  const [selectedActivityToken, setSelectedActivityToken] = useState<
    string | null
  >(null);
  const [confirmRevokeToken, setConfirmRevokeToken] = useState<string | null>(
    null,
  );
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<string | null>(
    null,
  );

  const normalizedShareUsername = shareUsername.trim();
  const lowerShareUsername = normalizedShareUsername.toLowerCase();
  const isEmailInput = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizedShareUsername,
  );
  const isSimpleUsername = /^[A-Za-z0-9@._+-]{3,50}$/.test(
    normalizedShareUsername,
  );
  const isReservedUsername =
    lowerShareUsername === "all_users" ||
    lowerShareUsername === "anonymoususer";
  const isValidShareUsername =
    normalizedShareUsername.length > 0 &&
    !isReservedUsername &&
    (isEmailInput || isSimpleUsername);
  const shareUsernameError =
    normalizedShareUsername.length > 0 && !isValidShareUsername
      ? t(
          "storageShare.invalidUsername",
          "Enter a valid username or email address.",
        )
      : null;

  const shareBaseUrl = useMemo(() => {
    const frontendUrl = (config?.frontendUrl || "").trim();
    if (frontendUrl) {
      try {
        const parsed = new URL(frontendUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          const normalized = frontendUrl.endsWith("/")
            ? frontendUrl.slice(0, -1)
            : frontendUrl;
          return `${normalized}/share/`;
        }
      } catch {
        // invalid URL — fall through to default
      }
    }
    return absoluteWithBasePath("/share/");
  }, [config?.frontendUrl]);

  const loadShareLinks = useCallback(async () => {
    if (!file.remoteStorageId) {
      // No remote file yet — clear any leftover state from a previously opened file.
      setShareLinks([]);
      setSharedUsers([]);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.get<StoredFileResponse>(
        `/api/v1/storage/files/${file.remoteStorageId}`,
        {
          suppressErrorToast: true,
        },
      );
      const links = response.data?.shareLinks ?? [];
      const users =
        response.data?.sharedUsers ??
        (response.data?.sharedWithUsers ?? []).map((username) => ({
          username,
          accessRole: "editor",
        }));
      setShareLinks(links);
      setSharedUsers(users);
    } catch (error) {
      console.error("Failed to load share links:", error);
      setErrorMessage(
        t("storageShare.manageLoadFailed", "Unable to load share links."),
      );
    } finally {
      setIsLoading(false);
    }
  }, [actions, file.remoteStorageId, t]);

  useEffect(() => {
    if (opened) {
      // Clear the previous file's data before loading so a stale list is never
      // shown (and never targeted by a Remove click) while the new file resolves.
      setShareLinks([]);
      setSharedUsers([]);
      loadShareLinks();
      setActivityMap({});
      setShareRole("editor");
      setSelectedActivityToken(null);
    }
  }, [opened, loadShareLinks]);

  useEffect(() => {
    if (!opened) {
      setSelectedActivityToken(null);
      return;
    }
    if (shareLinks.length === 0) {
      setSelectedActivityToken(null);
      return;
    }
    if (
      !selectedActivityToken ||
      !shareLinks.some((link) => link.token === selectedActivityToken)
    ) {
      setSelectedActivityToken(shareLinks[0].token);
    }
  }, [opened, selectedActivityToken, shareLinks]);

  const createShareLink = useCallback(async () => {
    if (!file.remoteStorageId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.post(
        `/api/v1/storage/files/${file.remoteStorageId}/shares/links`,
        {
          accessRole: shareRole,
        },
      );
      const token = response.data?.token as string | undefined;
      if (token) {
        setShareLinks((prev) => [
          ...prev,
          {
            token,
            accessRole: shareRole,
            createdAt: new Date().toISOString(),
          },
        ]);
        actions.updateStirlingFileStub(file.id, { remoteHasShareLinks: true });
        await fileStorage.updateFileMetadata(file.id, {
          remoteHasShareLinks: true,
        });
        alert({
          alertType: "success",
          title: t("storageShare.generated", "Share link generated"),
          expandable: false,
          durationMs: 2500,
        });
      }
    } catch (error: unknown) {
      console.error("Failed to create share link:", error);
      setErrorMessage(
        t(
          "storageShare.failure",
          "Unable to generate a share link. Please try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [actions, file.id, file.remoteStorageId, shareRole, t]);

  const handleCopyLink = useCallback(
    async (token: string) => {
      try {
        await navigator.clipboard.writeText(`${shareBaseUrl}${token}`);
        alert({
          alertType: "success",
          title: t("storageShare.copied", "Link copied to clipboard"),
          expandable: false,
          durationMs: 2000,
        });
      } catch (error) {
        console.error("Failed to copy share link:", error);
        alert({
          alertType: "warning",
          title: t("storageShare.copyFailed", "Copy failed"),
          expandable: false,
          durationMs: 2500,
        });
      }
    },
    [shareBaseUrl, t],
  );

  const handleRevokeLink = useCallback(
    async (token: string) => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      setConfirmRevokeToken(null);
      try {
        await apiClient.delete(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/links/${token}`,
        );
        // Compute before setShareLinks so we don't read stale closure state after the update
        const nextHasLinks =
          shareLinks.filter((link) => link.token !== token).length > 0;
        setShareLinks((prev) => prev.filter((link) => link.token !== token));
        setActivityMap((prev) => {
          const updated = { ...prev };
          delete updated[token];
          return updated;
        });
        setSelectedActivityToken((prev) => (prev === token ? null : prev));
        actions.updateStirlingFileStub(file.id, {
          remoteHasShareLinks: nextHasLinks,
        });
        await fileStorage.updateFileMetadata(file.id, {
          remoteHasShareLinks: nextHasLinks,
        });
        alert({
          alertType: "success",
          title: t("storageShare.revoked", "Share link removed"),
          expandable: false,
          durationMs: 2500,
        });
      } catch (error) {
        console.error("Failed to revoke share link:", error);
        setErrorMessage(
          t("storageShare.revokeFailed", "Unable to remove the share link."),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [actions, file.remoteStorageId, shareLinks, t],
  );

  const handleLoadActivity = useCallback(
    async (token: string) => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      try {
        const response = await apiClient.get<ShareLinkAccessResponse[]>(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/links/${token}/accesses`,
          { suppressErrorToast: true },
        );
        setActivityMap((prev) => ({
          ...prev,
          [token]: response.data ?? [],
        }));
      } catch (error) {
        console.error("Failed to load share activity:", error);
        setErrorMessage(
          t("storageShare.accessFailed", "Unable to load activity."),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [file.remoteStorageId, t],
  );

  useEffect(() => {
    if (!selectedActivityToken) return;
    if (activityMap[selectedActivityToken] === undefined) {
      void handleLoadActivity(selectedActivityToken);
    }
  }, [activityMap, handleLoadActivity, selectedActivityToken]);

  const handleAddUser = useCallback(
    async (forceEmailConfirm = false) => {
      if (!file.remoteStorageId) return;
      const trimmed = shareUsername.trim();
      if (!trimmed) return;
      if (!isValidShareUsername) {
        return;
      }
      if (isEmailInput && !forceEmailConfirm) {
        setShowEmailWarning(true);
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);
      try {
        await apiClient.post(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/users`,
          {
            username: trimmed,
            accessRole: shareRole,
          },
        );
        setSharedUsers((prev) => {
          if (prev.some((user) => user.username === trimmed)) {
            return prev.map((user) =>
              user.username === trimmed
                ? { ...user, accessRole: shareRole }
                : user,
            );
          }
          return [...prev, { username: trimmed, accessRole: shareRole }].sort(
            (a, b) => a.username.localeCompare(b.username),
          );
        });
        setShareUsername("");
        setShowEmailWarning(false);
        alert({
          alertType: "success",
          title: t("storageShare.userAdded", "User added to shared list."),
          expandable: false,
          durationMs: 2500,
        });
      } catch (error) {
        console.error("Failed to share with user:", error);
        setErrorMessage(
          t("storageShare.userAddFailed", "Unable to share with that user."),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      file.remoteStorageId,
      isEmailInput,
      isValidShareUsername,
      shareRole,
      shareUsername,
      t,
    ],
  );

  const handleUpdateUserRole = useCallback(
    async (username: string, nextRole: ShareRole) => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        await apiClient.post(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/users`,
          {
            username,
            accessRole: nextRole,
          },
        );
        setSharedUsers((prev) =>
          prev.map((user) =>
            user.username === username
              ? { ...user, accessRole: nextRole }
              : user,
          ),
        );
        alert({
          alertType: "success",
          title: t("storageShare.userAdded", "User added to shared list."),
          expandable: false,
          durationMs: 2500,
        });
      } catch (error) {
        console.error("Failed to update shared user role:", error);
        setErrorMessage(
          t("storageShare.userAddFailed", "Unable to share with that user."),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [file.remoteStorageId, t],
  );

  const handleRemoveUser = useCallback(
    async (username: string) => {
      if (!file.remoteStorageId) return;
      setIsLoading(true);
      setErrorMessage(null);
      setConfirmRemoveUser(null);
      try {
        await apiClient.delete(
          `/api/v1/storage/files/${file.remoteStorageId}/shares/users/${encodeURIComponent(username)}`,
        );
        setSharedUsers((prev) =>
          prev.filter((user) => user.username !== username),
        );
        alert({
          alertType: "success",
          title: t(
            "storageShare.userRemoved",
            "User removed from shared list.",
          ),
          expandable: false,
          durationMs: 2500,
        });
      } catch (error) {
        console.error("Failed to remove shared user:", error);
        setErrorMessage(
          t("storageShare.userRemoveFailed", "Unable to remove that user."),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [file.remoteStorageId, t],
  );

  const selectedActivity = selectedActivityToken
    ? activityMap[selectedActivityToken]
    : undefined;
  const selectedLink = selectedActivityToken
    ? shareLinks.find((link) => link.token === selectedActivityToken)
    : undefined;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={
        <Group gap="xs" wrap="nowrap">
          <Icon name="share-2" size={20} />
          <Text fw={600} size="lg">
            {t("storageShare.manageTitle", "Manage Sharing")}
          </Text>
        </Group>
      }
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      size={shareLinksEnabled ? "min(58rem, 94vw)" : "min(46rem, 94vw)"}
      radius="lg"
      padding="lg"
      styles={{
        header: { paddingTop: "0.875rem", paddingBottom: "0.875rem" },
      }}
      overlayProps={{ blur: 8 }}
    >
      <Stack gap="lg">
        <ShareModalIntro fileName={file.name} />
        <SharingErrorAlert message={errorMessage} />
        <SharingDisabledAlert show={!sharingEnabled} />

        <SimpleGrid
          cols={{ base: 1, md: shareLinksEnabled ? 2 : 1 }}
          spacing="lg"
        >
          <Stack gap="lg">
            <LinkAccessCard
              show={shareLinksEnabled}
              role={shareRole}
              loading={isLoading}
              onRoleChange={setShareRole}
              onGenerate={() => createShareLink()}
            />

            <SharedUsersCard>
              <AddUserForm
                value={shareUsername}
                error={shareUsernameError}
                disabled={!sharingEnabled || isLoading}
                canSubmit={
                  sharingEnabled &&
                  !isLoading &&
                  !!normalizedShareUsername &&
                  !shareUsernameError
                }
                onChange={(value) => {
                  setShareUsername(value);
                  setShowEmailWarning(false);
                }}
                onSubmit={() => void handleAddUser()}
              />
              <EmailWarningAlert
                show={showEmailWarning}
                loading={isLoading}
                onCancel={() => setShowEmailWarning(false)}
                onConfirm={() => handleAddUser(true)}
              />
              <SharedUserList
                users={sharedUsers}
                confirmRemoveUser={confirmRemoveUser}
                loading={isLoading}
                onRoleChange={(username, role) =>
                  void handleUpdateUserRole(username, role)
                }
                onRequestRemove={setConfirmRemoveUser}
                onCancelRemove={() => setConfirmRemoveUser(null)}
                onRemove={(username) => void handleRemoveUser(username)}
              />
            </SharedUsersCard>

            <ShareLinksCard show={shareLinksEnabled} count={shareLinks.length}>
              <ShareLinkList
                links={shareLinks}
                loading={isLoading}
                baseUrl={shareBaseUrl}
                activityMap={activityMap}
                selectedToken={selectedActivityToken}
                confirmRevokeToken={confirmRevokeToken}
                onCopy={handleCopyLink}
                onToggleActivity={(token) =>
                  setSelectedActivityToken((prev) =>
                    prev === token ? null : token,
                  )
                }
                onRequestRevoke={setConfirmRevokeToken}
                onCancelRevoke={() => setConfirmRevokeToken(null)}
                onRevoke={(token) => void handleRevokeLink(token)}
              />
            </ShareLinksCard>
          </Stack>

          <ShareActivityCard
            show={shareLinksEnabled}
            token={selectedActivityToken}
            link={selectedLink}
            activity={selectedActivity}
          />
        </SimpleGrid>
      </Stack>
    </Modal>
  );
};

export default ShareManagementModal;
