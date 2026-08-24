import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Divider,
  Modal,
  ScrollArea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
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
  hasAttachment?: boolean;
  attachments: MailAttachment[];
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const DEMO_MESSAGES: MailMessage[] = [
  {
    id: "invoice-01",
    sender: "Nordlicht GmbH",
    address: "buchhaltung@nordlicht.example",
    subject: "Rechnung 2026-0814",
    preview:
      "Anbei finden Sie die Rechnung für den aktuellen Abrechnungszeitraum.",
    date: "Heute, 09:42",
    unread: true,
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
      "Die aktualisierten Unterlagen liegen im Anhang. Bitte um kurze Rückmeldung.",
    date: "Gestern",
    hasAttachment: true,
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
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: "74 KB",
      },
    ],
  },
  {
    id: "meeting-03",
    sender: "Projektteam",
    address: "projektteam@example.com",
    subject: "Nächste Schritte",
    preview:
      "Danke für das Gespräch. Die nächsten Schritte sind im Überblick zusammengefasst.",
    date: "12. Aug.",
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
  const messageListViewportRef = useRef<HTMLDivElement>(null);
  const [selectedAccount, setSelectedAccount] = useState("work");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState(
    DEMO_MESSAGES[0].id,
  );
  const [query, setQuery] = useState("");
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
      setSearchParams({}, { replace: true });
    }
    apiClient
      .get<{ connected: boolean; email?: string; provider?: Provider }>(
        "/api/v1/email/gmail/status",
      )
      .then(({ data }) => {
        if (!active) return;
        setAccountConnected(data.connected || connectedFromCallback);
        setMailboxConfirmed(data.connected);
        if (data.email) setAccountEmail(data.email);
        if (data.provider) setAccountProvider(data.provider);
        else if (connectedFromCallback) setAccountProvider("Gmail");
      })
      .catch(() => {
        if (active) {
          setAccountConnected(false);
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
          attachments: Array<{
            id: string;
            name: string;
            mimeType: string;
            size: number;
          }>;
        }>;
        nextPageToken?: string | null;
      }>(
        `/api/v1/email/gmail/messages?folder=${selectedFolder}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      const mappedMessages = data.messages
        .filter((message) => message.attachments.length > 0)
        .map((message) => ({
          id: message.id,
          sender: message.sender.split(" <")[0] || message.sender,
          address: message.sender.match(/<([^>]+)>/)?.[1] ?? message.sender,
          subject: message.subject || "(Ohne Betreff)",
          preview: message.preview,
          date: message.date,
          unread: message.unread,
          hasAttachment: true,
          attachments: message.attachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            type: attachment.mimeType.split("/").pop()?.toUpperCase() ?? "FILE",
            mimeType: attachment.mimeType,
            size: formatFileSize(attachment.size),
          })),
        }));
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
    setMessages([]);
    setNextPageToken(null);
    if (mailboxConfirmed) void loadMessages();
  }, [mailboxConfirmed, selectedFolder]);

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

  const filteredMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return messages;
    return messages.filter((message) =>
      [message.sender, message.address, message.subject, message.preview]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [messages, query]);

  const selectedMessage =
    filteredMessages.find((message) => message.id === selectedMessageId) ??
    filteredMessages[0];

  const connectAccount = async () => {
    const { data } = await apiClient.get<{ authorizationUrl: string }>(
      "/api/v1/email/gmail/connect",
    );
    window.location.assign(data.authorizationUrl);
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
        `Die Datei "${attachment.name}" ist bereits vorhanden. Soll sie erneut importiert werden?`,
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
            aria-label={t("email.back", "Zurück")}
            onClick={() => navigate("/editor")}
          >
            <ArrowBackIcon fontSize="small" />
          </ActionIcon>
          <div>
            <div className="email-page-eyebrow">
              {t("email.eyebrow", "Dateiquellen")}
            </div>
            <h1>{t("email.title", "E-Mail-Postfach")}</h1>
          </div>
        </div>
        <div className="email-page-header-actions">
          <span className="email-cache-status">
            <span className="email-status-dot" />
            {t("email.cacheReady", "Lokaler Cache aktiv")}
          </span>
          <Tooltip label={t("email.refresh", "Postfach aktualisieren")}>
            <ActionIcon
              variant="tertiary"
              aria-label={t("email.refresh", "Postfach aktualisieren")}
            >
              <RefreshIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("email.settings", "E-Mail-Einstellungen")}>
            <ActionIcon
              variant="tertiary"
              aria-label={t("email.settings", "E-Mail-Einstellungen")}
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
            <span>{t("email.accounts", "Konten")}</span>
            <Tooltip label={t("email.connectAccount", "Konto verbinden")}>
              <ActionIcon
                variant="tertiary"
                aria-label={t("email.connectAccount", "Konto verbinden")}
                onClick={() => setAccountConnected(true)}
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
                  "Verbinde ein Postfach, um Anhänge zu importieren.",
                )}
              </span>
            </div>
          )}

          <Divider my="md" />
          <div className="email-sidebar-heading">
            <span>{t("email.folders", "Postfach")}</span>
          </div>
          <button
            className={`email-folder-row ${selectedFolder === "inbox" ? "is-active" : ""}`}
            onClick={() => setSelectedFolder("inbox")}
          >
            <InboxOutlinedIcon fontSize="small" />
            <span>{t("email.inbox", "Posteingang")}</span>
            <Badge size="sm" variant="light">
              2
            </Badge>
          </button>
          <button
            className={`email-folder-row ${selectedFolder === "starred" ? "is-active" : ""}`}
            onClick={() => setSelectedFolder("starred")}
          >
            <StarBorderIcon fontSize="small" />
            <span>{t("email.starred", "Markiert")}</span>
          </button>
          <button
            className={`email-folder-row ${selectedFolder === "trash" ? "is-active" : ""}`}
            onClick={() => setSelectedFolder("trash")}
          >
            <DeleteOutlineIcon fontSize="small" />
            <span>{t("email.trash", "Papierkorb")}</span>
          </button>

          <div className="email-sidebar-footer">
            <span className="email-sync-label">
              {t("email.syncLabel", "Synchronisierung")}
            </span>
            <strong>{t("email.syncTime", "Vor 4 Minuten")}</strong>
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
          aria-label={t("email.messageList", "E-Mail-Liste")}
        >
          <div className="email-column-toolbar">
            <div>
              <h2>{t("email.inbox", "Posteingang")}</h2>
              <span>
                {filteredMessages.length} {t("email.messages", "Nachrichten")}
              </span>
            </div>
            <TextInput
              className="email-search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t(
                "email.searchPlaceholder",
                "Nachrichten durchsuchen",
              )}
              leftSection={<SearchIcon fontSize="small" />}
              aria-label={t(
                "email.searchPlaceholder",
                "Nachrichten durchsuchen",
              )}
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
                <strong>
                  {t("email.noResults", "Keine Nachrichten gefunden")}
                </strong>
                <span>
                  {t("email.noResultsHint", "Passe deinen Suchbegriff an.")}
                </span>
              </div>
            )}
            {loadingMore && (
              <div className="email-loading-more" role="status" aria-live="polite">
                <span className="email-loading-spinner" aria-hidden="true" />
                <span>{t("email.loadingMore", "Weitere Nachrichten werden geladen ...")}</span>
              </div>
            )}
          </ScrollArea>
        </section>

        <section
          className="email-detail-column"
          aria-label={t("email.messageDetails", "Nachrichtendetails")}
        >
          {selectedMessage ? (
            <>
              <div className="email-detail-toolbar">
                <span className="email-detail-label">
                  {t("email.message", "Nachricht")}
                </span>
                <Tooltip label={t("email.moreActions", "Weitere Aktionen")}>
                  <ActionIcon
                    variant="tertiary"
                    aria-label={t("email.moreActions", "Weitere Aktionen")}
                  >
                    <MoreHorizIcon fontSize="small" />
                  </ActionIcon>
                </Tooltip>
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
                      "Die angehängten Dateien können nach dem Download direkt in den Stirling-PDF-Arbeitsbereich übernommen werden.",
                    )}
                  </p>

                  {selectedMessage.attachments.length > 0 && (
                    <div className="email-attachments">
                      <div className="email-section-label">
                        <span>{t("email.attachments", "Anhänge")}</span>
                        <span>{selectedMessage.attachments.length}</span>
                      </div>
                      {selectedMessage.attachments.map((attachment) => (
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
                              void importAttachment(selectedMessage.id, attachment)
                            }
                          >
                            {downloadedAttachment === attachment.id
                              ? t("email.queued", "Vorgemerkt")
                              : t("email.download", "Importieren")}
                          </Button>
                        </div>
                      ))}
                      <p className="email-attachment-note">
                        <EmailOutlinedIcon fontSize="inherit" />{" "}
                        {t(
                          "email.storageNote",
                          "Anhänge werden im Datei-Workflow gespeichert, E-Mail-Daten bleiben im lokalen Cache.",
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
              <strong>{t("email.selectMessage", "Nachricht auswählen")}</strong>
              <span>
                {t(
                  "email.selectMessageHint",
                  "Wähle eine E-Mail aus der Liste aus.",
                )}
              </span>
            </div>
          )}
        </section>
      </div>

      {!accountConnected && (
        <div className="email-connect-overlay">
          <div className="email-connect-panel">
            <span className="email-connect-icon">
              <LinkIcon />
            </span>
            <span className="email-page-eyebrow">
              {t("email.firstSetup", "Erster Schritt")}
            </span>
            <h2>{t("email.connectTitle", "Postfach verbinden")}</h2>
            <p>
              {t(
                "email.connectDescription",
                "Verbinde dein E-Mail-Konto, um Anhänge sicher in deinen PDF-Workflow zu übernehmen.",
              )}
            </p>
            <div className="email-provider-actions">
              <Button
                fullWidth
                variant="secondary"
                onClick={() => void connectAccount()}
                leftSection={<EmailOutlinedIcon fontSize="small" />}
              >
                Gmail verbinden
              </Button>
            </div>
            <small>
              {t(
                "email.oauthNote",
                "Die Anmeldung erfolgt über OAuth. Passwörter werden nicht in Stirling gespeichert.",
              )}
            </small>
          </div>
        </div>
      )}

      <Modal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("email.settings", "E-Mail-Einstellungen")}
        centered
      >
        <TextInput
          label={t("email.displayName", "Anzeigename")}
          description={t(
            "email.displayNameHint",
            "Dieser Name wird statt der E-Mail-Adresse im Postfach angezeigt.",
          )}
          value={draftDisplayName}
          onChange={(event) => setDraftDisplayName(event.currentTarget.value)}
          placeholder={t("email.displayNamePlaceholder", "z. B. Enrico Ludwig")}
          autoFocus
        />
        <div className="email-settings-actions">
          <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
            {t("email.cancel", "Abbrechen")}
          </Button>
          <Button onClick={saveSettings}>
            {t("email.save", "Speichern")}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
