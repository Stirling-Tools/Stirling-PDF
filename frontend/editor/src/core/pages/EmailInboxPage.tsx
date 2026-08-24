import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Divider,
  Menu,
  Modal,
  ScrollArea,
  MultiSelect,
  TextInput,
  Tooltip,
} from "@mantine/core";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import LinkIcon from "@mui/icons-material/Link";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import "@app/pages/EmailInboxPage.css";

type Provider = "Gmail";
type MailFolder = "inbox" | "starred" | "trash";

interface MailAttachment {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  size: string;
}

interface MailMessage {
  id: string;
  sender: string;
  address: string;
  subject: string;
  preview: string;
  date: string;
  unread?: boolean;
  labels: string[];
  hasAttachment?: boolean;
  attachments: MailAttachment[];
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseSender(rawSender: string): { name: string; address: string } {
  const match = rawSender.match(/^\s*["']?(.+?)["']?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return {
    name: rawSender.trim().replace(/^["']|["']$/g, ""),
    address: rawSender.trim(),
  };
}

const DEMO_MESSAGES: MailMessage[] = [
  {
    id: "invoice-01",
    sender: "Nordlicht GmbH",
    address: "buchhaltung@nordlicht.example",
    subject: "Rechnung 2026-0814",
    preview: "Attached is the invoice for the current billing period.",
    date: "Heute, 09:42",
    unread: true,
    labels: [],
    hasAttachment: true,
    attachments: [
      {
        id: "invoice-pdf",
        name: "Rechnung_2026-0814.pdf",
        type: "PDF",
        mimeType: "application/pdf",
        size: "248 KB",
      },
    ],
  },
  {
    id: "contract-02",
    sender: "Mara Hoffmann",
    address: "mara.hoffmann@example.com",
    subject: "Vertragsunterlagen zur Freigabe",
    preview:
      "The updated documents are attached. Please provide a brief response.",
    date: "Gestern",
    hasAttachment: true,
    labels: [],
    attachments: [
      {
        id: "contract-pdf",
        name: "Vertragsunterlagen.pdf",
        type: "PDF",
        mimeType: "application/pdf",
        size: "1,8 MB",
      },
      {
        id: "terms-docx",
        name: "Anlage_A.docx",
        type: "DOCX",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: "74 KB",
      },
    ],
  },
  {
    id: "meeting-03",
    sender: "Projektteam",
    address: "projektteam@example.com",
    subject: "Next steps",
    preview:
      "Thank you for the discussion. The next steps are summarized below.",
    date: "12. Aug.",
    labels: [],
    attachments: [],
  },
];

const DEMO_ACCOUNT = {
  email: "anna.beispiel@unternehmen.de",
  provider: "Gmail" as Provider,
};

export default function EmailInboxPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addFiles } = useFileHandler();
  const { fileStubs } = useAllFiles();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accountConnected, setAccountConnected] = useState(
    searchParams.get("gmail") === "connected",
  );
  const [connectDialogOpen, setConnectDialogOpen] = useState(
    searchParams.get("gmail") !== "connected",
  );
  const [accountEmail, setAccountEmail] = useState(DEMO_ACCOUNT.email);
  const [accountProvider, setAccountProvider] = useState<Provider>(
    searchParams.get("gmail") === "connected" ? "Gmail" : DEMO_ACCOUNT.provider,
  );
  const [displayName, setDisplayName] = useState("");
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mailboxConfirmed, setMailboxConfirmed] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<MailFolder>("inbox");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const messageListViewportRef = useRef<HTMLDivElement>(null);
  const [selectedAccount, setSelectedAccount] = useState("work");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState(
    DEMO_MESSAGES[0].id,
  );
  const [query, setQuery] = useState("");
  const [selectedAttachmentTypes, setSelectedAttachmentTypes] = useState<
    string[]
  >([]);
  const [customAttachmentTypes, setCustomAttachmentTypes] = useState<string[]>(
    [],
  );
  const [attachmentTypeDraft, setAttachmentTypeDraft] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [downloadedAttachment, setDownloadedAttachment] = useState<
    string | null
  >(null);
  const connectedFromCallback = searchParams.get("gmail") === "connected";

  useEffect(() => {
    const savedName = window.localStorage.getItem(
      `stirling.email.displayName.${accountEmail.toLocaleLowerCase()}`,
    );
    setDisplayName(savedName ?? "");
  }, [accountEmail]);

  const openSettings = () => {
    setDraftDisplayName(displayName);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const name = draftDisplayName.trim();
    const storageKey = `stirling.email.displayName.${accountEmail.toLocaleLowerCase()}`;
    if (name) window.localStorage.setItem(storageKey, name);
    else window.localStorage.removeItem(storageKey);
    setDisplayName(name);
    setSettingsOpen(false);
  };

  useEffect(() => {
    let active = true;
    if (connectedFromCallback) {
      setAccountConnected(true);
      setConnectDialogOpen(false);
      setSearchParams({}, { replace: true });
    }
    apiClient
      .get<{ connected: boolean; email?: string; provider?: Provider }>(
        "/api/v1/email/gmail/status",
      )
      .then(({ data }) => {
        if (!active) return;
        setAccountConnected(data.connected || connectedFromCallback);
        setConnectDialogOpen(!data.connected && !connectedFromCallback);
        setMailboxConfirmed(data.connected);
        if (data.email) setAccountEmail(data.email);
        if (data.provider) setAccountProvider(data.provider);
        else if (connectedFromCallback) setAccountProvider("Gmail");
      })
      .catch(() => {
        if (active) {
          setAccountConnected(false);
          setConnectDialogOpen(true);
          setMailboxConfirmed(false);
        }
      });
    return () => {
      active = false;
    };
  }, [connectedFromCallback, setSearchParams]);

  const loadMessages = async (pageToken?: string) => {
    if (!mailboxConfirmed || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await apiClient.get<{
        messages: Array<{
          id: string;
          sender: string;
          subject: string;
          preview: string;
          date: string;
          unread: boolean;
          labels?: string[];
          attachments: Array<{
            id: string;
            name: string;
            mimeType: string;
            size: number;
          }>;
        }>;
        nextPageToken?: string | null;
      }>(
        `/api/v1/email/gmail/messages?folder=${selectedFolder}${selectedAttachmentTypes.length > 0 ? `&types=${encodeURIComponent(selectedAttachmentTypes.join(","))}` : ""}${query.trim() ? `&query=${encodeURIComponent(query.trim())}` : ""}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      const mappedMessages = data.messages
        .filter((message) => message.attachments.length > 0)
        .map((message) => {
          const sender = parseSender(message.sender);
          return {
            id: message.id,
            sender: sender.name,
            address: sender.address,
            subject: message.subject || "(Ohne Betreff)",
            preview: message.preview,
            date: message.date,
            unread: message.unread,
            labels: message.labels ?? [],
            hasAttachment: true,
            attachments: message.attachments.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              type:
                attachment.mimeType.split("/").pop()?.toUpperCase() ?? "FILE",
              mimeType: attachment.mimeType,
              size: formatFileSize(attachment.size),
            })),
          };
        });
      setMessages((current) =>
        pageToken ? [...current, ...mappedMessages] : mappedMessages,
      );
      setNextPageToken(data.nextPageToken ?? null);
    } catch {
      if (!pageToken) setMessages([]);
      setNextPageToken(null);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setNextPageToken(null);
    if (mailboxConfirmed) {
      setMessages([]);
      void loadMessages();
    } else {
      setMessages(DEMO_MESSAGES);
    }
  }, [
    mailboxConfirmed,
    selectedFolder,
    refreshVersion,
    selectedAttachmentTypes,
    selectedLabels,
    query,
  ]);

  const refreshInbox = () => {
    setMessages([]);
    setNextPageToken(null);
    setLoadingMore(false);
    setRefreshVersion((version) => version + 1);
  };

  const handleMessageListScroll = (position: { x: number; y: number }) => {
    const element = messageListViewportRef.current;
    if (!element) return;
    if (
      nextPageToken &&
      !loadingMore &&
      element.scrollHeight - position.y - element.clientHeight < 120
    ) {
      void loadMessages(nextPageToken);
    }
  };

  useEffect(() => {
    const element = messageListViewportRef.current;
    if (!element) return;
    const handleNativeScroll = () => {
      if (
        nextPageToken &&
        !loadingMore &&
        element.scrollHeight - element.scrollTop - element.clientHeight < 120
      ) {
        void loadMessages(nextPageToken);
      }
    };
    element.addEventListener("scroll", handleNativeScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleNativeScroll);
  }, [nextPageToken, loadingMore, messages.length, query, selectedFolder]);

  useEffect(() => {
    const element = messageListViewportRef.current;
    if (
      !element ||
      !nextPageToken ||
      loadingMore ||
      element.scrollHeight > element.clientHeight + 120
    ) {
      return;
    }
    void loadMessages(nextPageToken);
  }, [messages, nextPageToken, loadingMore, selectedLabels]);

  const attachmentTypes = useMemo(
    () =>
      Array.from(
        new Set(
          messages.flatMap((message) =>
            message.attachments.map((attachment) => attachment.type),
          ),
        ),
      ).sort(),
    [messages],
  );
  const availableLabels = useMemo(
    () =>
      Array.from(
        new Set(messages.flatMap((message) => message.labels ?? [])),
      ).sort((left, right) => left.localeCompare(right)),
    [messages],
  );
  const attachmentTypeOptions = useMemo(
    () =>
      Array.from(
        new Set([...attachmentTypes, ...customAttachmentTypes]),
      ).sort(),
    [attachmentTypes, customAttachmentTypes],
  );

  const filteredMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (
      !normalizedQuery &&
      selectedAttachmentTypes.length === 0 &&
      selectedLabels.length === 0
    )
      return messages;
    return messages.filter(
      (message) =>
        (normalizedQuery
          ? [message.sender, message.address, message.subject, message.preview]
              .join(" ")
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : true) &&
        (selectedAttachmentTypes.length > 0
          ? message.attachments.some((attachment) =>
              selectedAttachmentTypes.includes(attachment.type),
            )
          : true) &&
        (selectedLabels.length > 0
          ? selectedLabels.some((label) =>
              (message.labels ?? []).includes(label),
            )
          : true),
    );
  }, [messages, query, selectedAttachmentTypes, selectedLabels]);

  const unreadMessageCount = messages.filter(
    (message) => message.unread,
  ).length;

  const selectedMessage =
    filteredMessages.find((message) => message.id === selectedMessageId) ??
    filteredMessages[0];
  const selectedAttachments = selectedMessage?.attachments.filter(
    (attachment) =>
      selectedAttachmentTypes.length === 0 ||
      selectedAttachmentTypes.includes(attachment.type),
  );

  const connectAccount = async () => {
    const { data } = await apiClient.get<{ authorizationUrl: string }>(
      "/api/v1/email/gmail/connect",
    );
    window.location.assign(data.authorizationUrl);
  };

  const disconnectAccount = async () => {
    if (
      !window.confirm(
        "Disconnect Gmail? The local connection will be deleted and Google access revoked.",
      )
    ) {
      return;
    }
    try {
      await apiClient.delete("/api/v1/email/gmail/connection");
      setAccountConnected(false);
      setConnectDialogOpen(true);
      setMailboxConfirmed(false);
      setMessages([]);
      setNextPageToken(null);
      setSelectedAttachmentTypes([]);
      setSelectedLabels([]);
      setSettingsOpen(false);
    } catch {
      // Keep the connected state visible when the server could not complete the request.
    }
  };

  const addAttachmentType = (value: string) => {
    const type = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(type)) return;
    setCustomAttachmentTypes((current) =>
      current.includes(type) ? current : [...current, type],
    );
    setSelectedAttachmentTypes((current) =>
      current.includes(type) ? current : [...current, type],
    );
    setAttachmentTypeDraft("");
  };

  const importAttachment = async (
    messageId: string,
    attachment: MailAttachment,
  ) => {
    const normalizeFilename = (name: string) => name.trim().toLocaleLowerCase();
    const storedFileStubs = await fileStorage.getAllStirlingFileStubs();
    const existingFileNames = new Set(
      [...fileStubs, ...storedFileStubs].map((file) =>
        normalizeFilename(file.name),
      ),
    );
    const alreadyExists = existingFileNames.has(
      normalizeFilename(attachment.name),
    );
    if (
      alreadyExists &&
      !window.confirm(
        `The file "${attachment.name}" already exists. Import it again?`,
      )
    ) {
      return;
    }
    setDownloadedAttachment(attachment.id);
    try {
      const { data } = await apiClient.get<Blob>(
        `/api/v1/email/gmail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`,
        { responseType: "blob" },
      );
      await addFiles([
        new File([data], attachment.name, { type: attachment.mimeType }),
      ]);
    } catch {
      setDownloadedAttachment(null);
    }
  };

  return (
    <main className="email-page">
      <header className="email-page-header">
        <div className="email-page-brand">
          <ActionIcon
            variant="tertiary"
            aria-label={t("email.back", "Back")}
            onClick={() => navigate("/editor")}
          >
            <ArrowBackIcon fontSize="small" />
          </ActionIcon>
          <div>
            <div className="email-page-eyebrow">
              {t("email.eyebrow", "File sources")}
            </div>
            <h1>{t("email.title", "Email inbox")}</h1>
          </div>
        </div>
        <div className="email-page-header-actions">
          <span className="email-cache-status">
            <span className="email-status-dot" />
            {t("email.cacheReady", "Lokaler Cache aktiv")}
          </span>
          <Tooltip label={t("email.refresh", "Refresh inbox")}>
            <ActionIcon
              variant="tertiary"
              aria-label={t("email.refresh", "Refresh inbox")}
              onClick={refreshInbox}
            >
              <RefreshIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("email.settings", "Email settings")}>
            <ActionIcon
              variant="tertiary"
              aria-label={t("email.settings", "Email settings")}
              onClick={openSettings}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>
        </div>
      </header>

      <div className="email-page-body">
        <aside className="email-sidebar">
          <div className="email-sidebar-heading">
            <span>{t("email.accounts", "Accounts")}</span>
            <Tooltip label={t("email.connectAccount", "Konto verbinden")}>
              <ActionIcon
                variant="tertiary"
                aria-label={t("email.connectAccount", "Konto verbinden")}
              onClick={() => setConnectDialogOpen(true)}
              >
                <LinkIcon fontSize="small" />
              </ActionIcon>
            </Tooltip>
          </div>

          {accountConnected ? (
            <button
              className={`email-account-row ${selectedAccount === "work" ? "is-selected" : ""}`}
              onClick={() => setSelectedAccount("work")}
            >
              <span className="email-account-avatar">A</span>
              <span className="email-account-copy">
                <strong>{displayName || accountEmail}</strong>
                <span>{accountProvider}</span>
              </span>
              <span className="email-account-dot" />
            </button>
          ) : (
            <div className="email-empty-account">
              <EmailOutlinedIcon />
              <strong>
                {t("email.noAccount", "Noch kein Konto verbunden")}
              </strong>
              <span>
                {t(
                  "email.noAccountHint",
                  "Connect a mailbox to import attachments.",
                )}
              </span>
            </div>
          )}

          <Divider my="md" />
          <div className="email-sidebar-heading">
            <span>{t("email.folders", "Mailbox")}</span>
          </div>
          <button
            className={`email-folder-row ${selectedFolder === "inbox" ? "is-active" : ""}`}
            onClick={() => setSelectedFolder("inbox")}
          >
            <InboxOutlinedIcon fontSize="small" />
            <span>{t("email.inbox", "Inbox")}</span>
            {unreadMessageCount > 0 && (
              <Badge size="sm" variant="light">
                {unreadMessageCount}
              </Badge>
            )}
          </button>
          <button
            className={`email-folder-row ${selectedFolder === "starred" ? "is-active" : ""}`}
            onClick={() => setSelectedFolder("starred")}
          >
            <StarBorderIcon fontSize="small" />
            <span>{t("email.starred", "Starred")}</span>
          </button>
          <button
            className={`email-folder-row ${selectedFolder === "trash" ? "is-active" : ""}`}
            onClick={() => setSelectedFolder("trash")}
          >
            <DeleteOutlineIcon fontSize="small" />
            <span>{t("email.trash", "Trash")}</span>
          </button>

          <div className="email-sidebar-footer">
            <span className="email-sync-label">
              {t("email.syncLabel", "Synchronization")}
            </span>
            <strong>{t("email.syncTime", "4 minutes ago")}</strong>
            <span>
              {t(
                "email.cacheHint",
                "Metadaten werden lokal zwischengespeichert.",
              )}
            </span>
          </div>
        </aside>

        <section
          className="email-message-column"
          aria-label={t("email.messageList", "Email list")}
        >
          <div className="email-column-toolbar">
            <div className="email-toolbar-top">
              <div>
                <h2>{t("email.inbox", "Posteingang")}</h2>
                <span>
                  {filteredMessages.length} {t("email.messages", "messages")}
                </span>
              </div>
              <TextInput
                className="email-search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={t("email.searchPlaceholder", "Search messages")}
                leftSection={<SearchIcon fontSize="small" />}
                aria-label={t("email.searchPlaceholder", "Search messages")}
              />
            </div>
            <MultiSelect
              className="email-type-filter"
              clearable
              searchable
              data={attachmentTypeOptions}
              value={selectedAttachmentTypes}
              onChange={setSelectedAttachmentTypes}
              onSearchChange={setAttachmentTypeDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter" && attachmentTypeDraft.trim()) {
                  event.preventDefault();
                  addAttachmentType(attachmentTypeDraft);
                }
              }}
              placeholder={t("email.fileTypeFilter", "File type")}
              aria-label={t("email.fileTypeFilter", "Filter by file type")}
            />
            <TextInput
              className="email-type-custom-input"
              value={attachmentTypeDraft}
              onChange={(event) =>
                setAttachmentTypeDraft(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                addAttachmentType(attachmentTypeDraft);
              }}
              placeholder={t(
                "email.customFileType",
                "Enter a custom file type and press Enter",
              )}
              aria-label={t("email.customFileType", "Custom file type")}
            />
            <MultiSelect
              className="email-label-filter"
              clearable
              data={availableLabels}
              value={selectedLabels}
              onChange={setSelectedLabels}
              placeholder={t("email.labelFilter", "Label")}
              aria-label={t("email.labelFilter", "Filter by labels")}
              searchable
            />
          </div>
          <ScrollArea
            className="email-message-list"
            viewportRef={messageListViewportRef}
            onScrollPositionChange={handleMessageListScroll}
          >
            {filteredMessages.length > 0 ? (
              filteredMessages.map((message) => (
                <button
                  className={`email-message-row ${selectedMessage?.id === message.id ? "is-selected" : ""}`}
                  key={message.id}
                  onClick={() => {
                    setSelectedMessageId(message.id);
                    setDownloadedAttachment(null);
                  }}
                >
                  <span
                    className={`email-message-avatar ${message.unread ? "is-unread" : ""}`}
                  >
                    {message.sender.charAt(0)}
                  </span>
                  <span className="email-message-copy">
                    <span className="email-message-line">
                      <strong>{message.sender}</strong>
                      <time>{message.date}</time>
                    </span>
                    <span
                      className={`email-message-subject ${message.unread ? "is-unread" : ""}`}
                    >
                      {message.subject}
                    </span>
                    <span className="email-message-preview">
                      {message.preview}
                    </span>
                    {(message.labels ?? []).length > 0 && (
                      <span className="email-message-labels">
                        {(message.labels ?? []).slice(0, 3).map((label) => (
                          <span className="email-label-tag" key={label}>
                            {label}
                          </span>
                        ))}
                      </span>
                    )}
                    {message.hasAttachment && (
                      <span className="email-attachment-indicator">
                        <AttachFileIcon fontSize="inherit" />{" "}
                        {message.attachments.length}
                      </span>
                    )}
                  </span>
                </button>
              ))
            ) : (
              <div className="email-no-results">
                <SearchIcon />
                <strong>{t("email.noResults", "No messages found")}</strong>
                <span>
                  {t("email.noResultsHint", "Try a different search term.")}
                </span>
              </div>
            )}
            {loadingMore && (
              <div
                className="email-loading-more"
                role="status"
                aria-live="polite"
              >
                <span className="email-loading-spinner" aria-hidden="true" />
                <span>
                  {t("email.loadingMore", "Loading more messages ...")}
                </span>
              </div>
            )}
          </ScrollArea>
        </section>

        <section
          className="email-detail-column"
          aria-label={t("email.messageDetails", "Message details")}
        >
          {selectedMessage ? (
            <>
              <div className="email-detail-toolbar">
                <span className="email-detail-label">
                  {t("email.message", "Message")}
                </span>
                <Menu shadow="md" width={220} position="bottom-end">
                  <Menu.Target>
                    <Tooltip label={t("email.moreActions", "More actions")}>
                      <ActionIcon
                        variant="tertiary"
                        aria-label={t("email.moreActions", "More actions")}
                      >
                        <MoreHorizIcon fontSize="small" />
                      </ActionIcon>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          selectedMessage.subject,
                        )
                      }
                    >
                      {t("email.copySubject", "Betreff kopieren")}
                    </Menu.Item>
                    <Menu.Item
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `${selectedMessage.sender} <${selectedMessage.address}>`,
                        )
                      }
                    >
                      {t("email.copySender", "Absender kopieren")}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item onClick={refreshInbox}>
                      {t("email.refresh", "Refresh inbox")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
              <ScrollArea className="email-detail-scroll">
                <div className="email-detail-content">
                  <div className="email-detail-subject-row">
                    <h2>{selectedMessage.subject}</h2>
                    <ActionIcon
                      variant="tertiary"
                      aria-label={t("email.star", "Markieren")}
                    >
                      <StarBorderIcon fontSize="small" />
                    </ActionIcon>
                  </div>
                  {(selectedMessage.labels ?? []).length > 0 && (
                    <div className="email-detail-labels">
                      {(selectedMessage.labels ?? []).map((label) => (
                        <span className="email-label-tag" key={label}>
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="email-sender-row">
                    <span className="email-message-avatar is-large">
                      {selectedMessage.sender.charAt(0)}
                    </span>
                    <div>
                      <strong>{selectedMessage.sender}</strong>
                      <span>{selectedMessage.address}</span>
                    </div>
                    <time>{selectedMessage.date}</time>
                  </div>
                  <p className="email-message-body-copy">
                    {selectedMessage.preview}
                  </p>
                  <p className="email-message-body-copy">
                    {t(
                      "email.demoBody",
                      "Attached files can be transferred directly into the Stirling PDF workspace after download.",
                    )}
                  </p>

                  {selectedAttachments && selectedAttachments.length > 0 && (
                    <div className="email-attachments">
                      <div className="email-section-label">
                        <span>{t("email.attachments", "Attachments")}</span>
                        <span>{selectedAttachments.length}</span>
                      </div>
                      {selectedAttachments.map((attachment) => (
                        <div
                          className="email-attachment-row"
                          key={attachment.id}
                        >
                          <span className="email-file-icon">
                            {attachment.type}
                          </span>
                          <span className="email-attachment-copy">
                            <strong>{attachment.name}</strong>
                            <span>{attachment.size}</span>
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            leftSection={
                              <CloudDownloadOutlinedIcon fontSize="small" />
                            }
                            onClick={() =>
                              void importAttachment(
                                selectedMessage.id,
                                attachment,
                              )
                            }
                          >
                            {downloadedAttachment === attachment.id
                              ? t("email.queued", "Vorgemerkt")
                              : t("email.download", "Import")}
                          </Button>
                        </div>
                      ))}
                      <p className="email-attachment-note">
                        <EmailOutlinedIcon fontSize="inherit" />{" "}
                        {t(
                          "email.storageNote",
                          "Attachments are stored in the file workflow; email data remains in the local cache.",
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="email-detail-empty">
              <EmailOutlinedIcon />
              <strong>{t("email.selectMessage", "Select a message")}</strong>
              <span>
                {t("email.selectMessageHint", "Choose an email from the list.")}
              </span>
            </div>
          )}
        </section>
      </div>

      {!accountConnected && connectDialogOpen && (
        <div className="email-connect-overlay">
          <div className="email-connect-panel">
            <ActionIcon
              className="email-connect-close"
              variant="tertiary"
              aria-label={t("email.closeConnectDialog", "Close")}
              onClick={() => setConnectDialogOpen(false)}
            >
              <CloseIcon fontSize="small" />
            </ActionIcon>
            <span className="email-connect-icon" aria-hidden="true">
              <EmailOutlinedIcon />
            </span>
            <h2>{t("email.connectTitle", "Connect mailbox")}</h2>
            <p>
              {t(
                "email.connectDescription",
                "Connect your email account to securely transfer attachments into your PDF workflow.",
              )}
            </p>
            <div className="email-provider-actions">
              <Button
                fullWidth
                variant="secondary"
                onClick={() => void connectAccount()}
                leftSection={<EmailOutlinedIcon fontSize="small" />}
              >
                {t("email.connectGmail", "Connect Gmail")}
              </Button>
            </div>
            <small>
              {t(
                "email.oauthNote",
                "Sign-in uses OAuth. Passwords are not stored by Stirling.",
              )}
            </small>
          </div>
        </div>
      )}

      <Modal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("email.settings", "Email settings")}
        centered
      >
        <TextInput
          label={t("email.displayName", "Display name")}
          description={t(
            "email.displayNameHint",
            "This name is displayed instead of the email address in the mailbox.",
          )}
          value={draftDisplayName}
          onChange={(event) => setDraftDisplayName(event.currentTarget.value)}
          placeholder={t("email.displayNamePlaceholder", "e.g. Peter Example")}
          autoFocus
        />
        {accountConnected && (
          <Button
            variant="secondary"
            accent="danger"
            fullWidth
            onClick={() => void disconnectAccount()}
            className="email-disconnect-button"
          >
            Disconnect Gmail
          </Button>
        )}
        <div className="email-settings-actions">
          <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
            {t("email.cancel", "Cancel")}
          </Button>
          <Button onClick={saveSettings}>{t("email.save", "Save")}</Button>
        </div>
      </Modal>
    </main>
  );
}
