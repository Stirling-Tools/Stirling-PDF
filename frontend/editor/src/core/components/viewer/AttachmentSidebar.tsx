import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactElement,
} from "react";
import { Text, Loader, Stack } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useViewer } from "@app/contexts/ViewerContext";
import { useAllFiles, useFileManagement } from "@app/contexts/FileContext";
import { isStirlingFile } from "@app/types/fileContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { PdfAttachmentObject } from "@embedpdf/models";
import AttachmentIcon from "@mui/icons-material/AttachmentRounded";
import CollectionsIcon from "@mui/icons-material/CollectionsBookmarkRounded";
import DownloadIcon from "@mui/icons-material/DownloadRounded";
import ImportIcon from "@mui/icons-material/LibraryAddRounded";
import { useTranslation } from "react-i18next";
import { SidebarBase } from "@app/components/viewer/SidebarBase";
import { detectNonPdfFileType, isPdfFile } from "@app/utils/fileUtils";
import { readPortfolioMemberBytes } from "@app/utils/portfolioMembers";
import "@app/components/viewer/AttachmentSidebar.css";

interface AttachmentSidebarProps {
  visible: boolean;
  thumbnailVisible: boolean;
  bookmarkVisible: boolean;
  documentCacheKey?: string;
  preloadCacheKeys?: string[];
  /** Set for an Adobe PDF Portfolio: renders the richer collection experience
   * (type icons, open-in-place) from the portfolio rather than the open document. */
  portfolio?: PortfolioView | null;
}

export interface PortfolioView {
  /** Read directly for members, so the panel outlives opening one. */
  file: File;
  members: PdfAttachmentObject[];
  /** Member currently on screen, highlighted in the list. */
  activeMemberName: string | null;
}

// Literal LocalIcon elements per member type. Kept as JSX literals (not dynamic
// icon strings) so the icon-bundling scanner picks them up. Keyed by the type
// resolved in memberIconKey below.
const MEMBER_ICON_STYLE = {
  flexShrink: 0,
  color: "var(--icon-files-color)",
} as const;
const MEMBER_ICONS: Record<string, ReactElement> = {
  pdf: (
    <LocalIcon
      icon="picture-as-pdf-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
  image: (
    <LocalIcon
      icon="image-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
  sheet: (
    <LocalIcon
      icon="dataset-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
  data: (
    <LocalIcon
      icon="data-object-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
  text: (
    <LocalIcon
      icon="description-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
  archive: (
    <LocalIcon
      icon="folder-zip-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
  default: (
    <LocalIcon
      icon="draft-rounded"
      width="1.4rem"
      height="1.4rem"
      style={MEMBER_ICON_STYLE}
    />
  ),
};

const memberExtension = (attachment: PdfAttachmentObject): string => {
  const name = (attachment.name || "").toLowerCase();
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
};

// Map a member's mime type / extension to an icon key.
const memberIconKey = (attachment: PdfAttachmentObject): string => {
  const mime = (attachment.mimeType || "").toLowerCase();
  const ext = memberExtension(attachment);
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"].includes(ext)
  )
    return "image";
  if (mime.includes("csv") || ["csv", "xls", "xlsx"].includes(ext))
    return "sheet";
  if (mime.includes("json") || ["json", "xml", "yml", "yaml"].includes(ext))
    return "data";
  if (
    ["doc", "docx", "txt", "md", "rtf"].includes(ext) ||
    mime.startsWith("text/")
  )
    return "text";
  if (["zip", "7z", "rar", "gz", "tar"].includes(ext)) return "archive";
  return "default";
};

// Portfolios often omit an embedded file's /Subtype, so give the viewer a type
// derived from the extension rather than passing a blank one through.
const MEMBER_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
};

const memberMimeType = (attachment: PdfAttachmentObject): string =>
  MEMBER_MIME_TYPES[memberExtension(attachment)] ||
  attachment.mimeType ||
  "application/octet-stream";

// A member opens in the viewer when the viewer can render it; the rest (archives,
// office documents) still download.
const canPreviewMember = (attachment: PdfAttachmentObject): boolean => {
  const probe = {
    name: attachment.name || "",
    type: memberMimeType(attachment),
  };
  return isPdfFile(probe) || detectNonPdfFileType(probe) !== "unknown";
};

interface AttachmentCacheEntry {
  status: "idle" | "loading" | "success" | "error";
  attachments: PdfAttachmentObject[] | null;
  error: string | null;
  lastFetched: number | null;
}

const createEntry = (
  overrides: Partial<AttachmentCacheEntry> = {},
): AttachmentCacheEntry => ({
  status: "idle",
  attachments: null,
  error: null,
  lastFetched: null,
  ...overrides,
});

export const AttachmentSidebar = ({
  visible,
  thumbnailVisible,
  bookmarkVisible,
  documentCacheKey,
  preloadCacheKeys = [],
  portfolio = null,
}: AttachmentSidebarProps) => {
  const isPortfolio = portfolio !== null;
  const { t } = useTranslation();
  const {
    attachmentActions,
    hasAttachmentSupport,
    toggleAttachmentSidebar,
    setActiveFileId,
  } = useViewer();
  const { addFiles } = useFileManagement();
  const { files: libraryFiles } = useAllFiles();
  // Member name -> the file it was opened as, so reopening one returns to it.
  const openedMembers = useRef<Map<string, string>>(new Map());
  const {
    handleToolSelectForced,
    previewFile,
    setPreviewFile,
    registerPreviewImport,
  } = useToolWorkflow();
  const [searchTerm, setSearchTerm] = useState("");
  const [openingMember, setOpeningMember] = useState<string | null>(null);
  const [attachmentSupport, setAttachmentSupport] = useState(() =>
    hasAttachmentSupport(),
  );
  const [activeEntry, setActiveEntry] = useState<AttachmentCacheEntry>(() =>
    createEntry(),
  );
  const cacheRef = useRef<Map<string, AttachmentCacheEntry>>(new Map());
  const [fetchNonce, setFetchNonce] = useState(0);
  const currentKeyRef = useRef<string | null>(documentCacheKey ?? null);

  useEffect(() => {
    currentKeyRef.current = documentCacheKey ?? null;
  }, [documentCacheKey]);

  // Poll once until the attachment bridge registers
  useEffect(() => {
    if (attachmentSupport) return;
    let cancelled = false;
    const id = setInterval(() => {
      if (!cancelled && hasAttachmentSupport()) {
        setAttachmentSupport(true);
        clearInterval(id);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [attachmentSupport, hasAttachmentSupport]);

  // Reset UI and load cached entry (if any) when switching documents
  useEffect(() => {
    setSearchTerm("");

    if (!documentCacheKey) {
      setActiveEntry(createEntry());
      attachmentActions.clearAttachments();
      return;
    }

    const cached = cacheRef.current.get(documentCacheKey);
    if (cached) {
      setActiveEntry(cached);
      if (cached.status === "success") {
        attachmentActions.setLocalAttachments(cached.attachments ?? [], null);
      } else if (cached.status === "error") {
        attachmentActions.setLocalAttachments(
          cached.attachments ?? null,
          cached.error,
        );
      } else {
        attachmentActions.clearAttachments();
      }
    } else {
      setActiveEntry(createEntry());
      attachmentActions.clearAttachments();
    }
  }, [documentCacheKey, attachmentActions]);

  // Keep cache bounded to the currently relevant keys
  useEffect(() => {
    const allowed = new Set<string>();
    if (documentCacheKey) {
      allowed.add(documentCacheKey);
    }
    preloadCacheKeys.forEach((key) => {
      if (key) {
        allowed.add(key);
      }
    });

    cacheRef.current.forEach((_entry, key) => {
      if (!allowed.has(key)) {
        cacheRef.current.delete(key);
      }
    });
  }, [documentCacheKey, preloadCacheKeys]);

  // Fetch attachments for the active document when needed
  useEffect(() => {
    if (!attachmentSupport || !documentCacheKey) return;

    const key = documentCacheKey;
    const cached = cacheRef.current.get(key);
    // Only short-circuit on a finalised success cache. Skipping when
    // cached.status === "loading" caused the sidebar to get stuck: if
    // the previous fetch was cancelled (by a parent re-render that
    // changed the attachmentActions reference - createViewerActions
    // builds a new object every viewer render), the cache still says
    // "loading" but no live fetch is in flight. On the re-run we'd
    // early-return and never refetch, so the UI would sit on the
    // "Loading attachments..." state forever. Same change applied in
    // BookmarkSidebar.
    if (cached && cached.status === "success") {
      return;
    }

    let cancelled = false;
    // Don't write "loading" into the cache - keep the cache for
    // terminal states (success/error) only, so a cancelled run can
    // never leave a stale "loading" entry behind. The visible
    // sidebar state still goes through setActiveEntry below.
    const updateEntry = (entry: AttachmentCacheEntry) => {
      if (entry.status === "success" || entry.status === "error") {
        cacheRef.current.set(key, entry);
      }
      if (!cancelled && currentKeyRef.current === key) {
        setActiveEntry(entry);
      }
    };

    updateEntry(
      createEntry({
        status: "loading",
        attachments: cached?.attachments ?? null,
        lastFetched: cached?.lastFetched ?? null,
      }),
    );

    const fetchWithRetry = async () => {
      // See BookmarkSidebar - matching change. After a file swap the
      // attachment bridge briefly unregisters and the action returns
      // null until the new document is loaded; without retrying on
      // null we'd cache an empty success and miss freshly-added
      // attachments.
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await attachmentActions.getAttachments();
          if (result === null) {
            if (attempt === maxAttempts - 1) return [];
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }
          return Array.isArray(result) ? result : [];
        } catch (error: any) {
          const message =
            typeof error?.message === "string"
              ? error.message.toLowerCase()
              : "";
          const notReady =
            message.includes("document") &&
            message.includes("not") &&
            message.includes("open");

          if (!notReady || attempt === maxAttempts - 1) {
            throw error;
          }

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      return [];
    };

    fetchWithRetry()
      .then((attachments) => {
        if (cancelled) return;
        const entry = createEntry({
          status: "success",
          attachments,
          lastFetched: Date.now(),
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          attachmentActions.setLocalAttachments(attachments, null);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : t("viewer.attachments.loadFailed", "Failed to load attachments");
        const fallback = cacheRef.current.get(key);
        const entry = createEntry({
          status: "error",
          attachments: fallback?.attachments ?? null,
          error: message,
          lastFetched: fallback?.lastFetched ?? null,
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          attachmentActions.setLocalAttachments(null, message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentSupport, documentCacheKey, fetchNonce, attachmentActions]);

  const requestReload = useCallback(() => {
    if (!documentCacheKey) return;
    cacheRef.current.delete(documentCacheKey);
    setActiveEntry(createEntry());
    attachmentActions.clearAttachments();
    setFetchNonce((value) => value + 1);
  }, [documentCacheKey, attachmentActions]);

  const handleDownload = (
    attachment: PdfAttachmentObject,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    if (portfolio) {
      void saveMember(attachment);
      return;
    }
    attachmentActions.downloadAttachment(attachment);
  };

  // Saved from the portfolio's own bytes: the viewer's download acts on whatever
  // document is open, which by then may be a member rather than the portfolio.
  const saveMember = useCallback(
    async (attachment: PdfAttachmentObject) => {
      const bytes = portfolio
        ? await readPortfolioMemberBytes(portfolio.file, attachment.name)
        : null;
      if (!bytes) {
        attachmentActions.downloadAttachment(attachment);
        return;
      }
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: memberMimeType(attachment) }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name || "attachment";
      link.click();
      URL.revokeObjectURL(url);
    },
    [portfolio, attachmentActions],
  );

  const memberFile = useCallback(
    async (attachment: PdfAttachmentObject): Promise<File | null> => {
      const name = attachment.name || "document.pdf";
      const bytes = portfolio
        ? await readPortfolioMemberBytes(portfolio.file, name)
        : null;
      if (!bytes) return null;
      return new File([bytes as BlobPart], name, {
        type: memberMimeType(attachment),
        // Stable across clicks, so the workbench's own name|size|lastModified
        // duplicate check recognises a member it already holds.
        lastModified:
          attachment.creationDate?.getTime() ??
          portfolio?.file.lastModified ??
          0,
      });
    },
    [portfolio],
  );

  /** The file this member was imported as, if it is still in the workbench. */
  const importedAs = useCallback(
    (name: string): string | null => {
      const fileId = openedMembers.current.get(name);
      return fileId &&
        libraryFiles.some((f) => isStirlingFile(f) && f.fileId === fileId)
        ? fileId
        : null;
    },
    [libraryFiles],
  );

  // Bring a member into the workbench as a file of its own.
  const importMember = useCallback(
    async (attachment: PdfAttachmentObject) => {
      const name = attachment.name || "document.pdf";
      const already = importedAs(name);
      if (already) {
        setPreviewFile(null);
        setActiveFileId(already);
        return;
      }
      try {
        setOpeningMember(name);
        const file = await memberFile(attachment);
        if (!file) {
          void saveMember(attachment);
          return;
        }
        const added = await addFiles([file], { selectFiles: true });
        const first = added?.[0];
        if (first) {
          openedMembers.current.set(name, first.fileId);
          registerPreviewImport(null);
          setPreviewFile(null);
          setActiveFileId(first.fileId);
        }
      } catch {
        void saveMember(attachment);
      } finally {
        setOpeningMember(null);
      }
    },
    [
      importedAs,
      memberFile,
      saveMember,
      addFiles,
      setActiveFileId,
      setPreviewFile,
      registerPreviewImport,
    ],
  );

  // Clicking a member shows it without adding it to the workbench. Tools resolve
  // their target from the file store, so selecting one imports it first.
  const previewMember = useCallback(
    async (attachment: PdfAttachmentObject) => {
      if (!canPreviewMember(attachment)) {
        void saveMember(attachment);
        return;
      }
      const name = attachment.name || "document.pdf";
      const already = importedAs(name);
      if (already) {
        setActiveFileId(already);
        return;
      }
      try {
        setOpeningMember(name);
        const file = await memberFile(attachment);
        if (!file) {
          void saveMember(attachment);
          return;
        }
        setPreviewFile(file);
        registerPreviewImport(() => importMember(attachment));
      } catch {
        void saveMember(attachment);
      } finally {
        setOpeningMember(null);
      }
    },
    [
      importedAs,
      memberFile,
      saveMember,
      setActiveFileId,
      setPreviewFile,
      registerPreviewImport,
      importMember,
    ],
  );

  // Drop the pending import once the preview goes, so a dismissed member cannot
  // be pulled in by the next tool the reader picks.
  useEffect(() => {
    if (!previewFile) registerPreviewImport(null);
  }, [previewFile, registerPreviewImport]);

  // Leave no import behind for a portfolio that is no longer on screen.
  useEffect(() => () => registerPreviewImport(null), [registerPreviewImport]);

  const formatDate = (date?: Date) => {
    if (!date) return "";
    try {
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  const handleAddAttachment = useCallback(() => {
    // Close the attachment sidebar before opening the tool so the user
    // doesn't end up looking at two stacked side panels (the sidebar on
    // the right + the tool's settings on the left).
    toggleAttachmentSidebar();
    handleToolSelectForced("addAttachments");
  }, [handleToolSelectForced, toggleAttachmentSidebar]);

  const filteredAttachments = useMemo(() => {
    const attachments =
      portfolio?.members ??
      (Array.isArray(activeEntry.attachments) ? activeEntry.attachments : []);
    if (!searchTerm.trim()) return attachments;
    const term = searchTerm.trim().toLowerCase();
    return attachments.filter((a) => a.name?.toLowerCase().includes(term));
  }, [portfolio?.members, activeEntry.attachments, searchTerm]);

  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined) return "";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const renderAttachments = (attachments: PdfAttachmentObject[]) => {
    return attachments.map((attachment, index) => {
      const rowClick = (event: React.MouseEvent) => {
        if (isPortfolio) {
          event.stopPropagation();
          void previewMember(attachment);
        } else {
          handleDownload(attachment, event);
        }
      };
      const isOpening = openingMember === (attachment.name || "document.pdf");
      const isCurrent =
        isPortfolio && attachment.name === portfolio?.activeMemberName;
      const meta = isPortfolio
        ? [formatFileSize(attachment.size), formatDate(attachment.creationDate)]
            .filter(Boolean)
            .join(" • ")
        : [formatFileSize(attachment.size), attachment.description]
            .filter(Boolean)
            .join(" • ");
      return (
        <div
          key={`${attachment.name}-${index}`}
          className="attachment-item-wrapper"
        >
          <div
            className={
              isCurrent
                ? "attachment-item attachment-item--current"
                : "attachment-item"
            }
            onClick={rowClick}
            role="button"
            tabIndex={0}
            aria-current={isCurrent ? "true" : undefined}
            title={
              isPortfolio
                ? canPreviewMember(attachment)
                  ? t("viewer.portfolio.preview", "Preview")
                  : t("viewer.attachments.download", "Download attachment")
                : undefined
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                rowClick(event as any);
              }
            }}
          >
            {isPortfolio &&
              (MEMBER_ICONS[memberIconKey(attachment)] ?? MEMBER_ICONS.default)}
            <div className="attachment-item__content">
              <Text size="sm" fw={500} className="attachment-item__title">
                {attachment.name ||
                  t("viewer.attachments.untitled", "Untitled")}
              </Text>
              {meta && (
                <Text size="xs" c="dimmed" className="attachment-item__meta">
                  {meta}
                </Text>
              )}
            </div>
            {isOpening ? (
              <Loader size="xs" />
            ) : (
              <>
                {isPortfolio && canPreviewMember(attachment) && (
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    className="attachment-item__download-icon"
                    aria-label={t(
                      "viewer.portfolio.import",
                      "Import into Stirling",
                    )}
                    title={t("viewer.portfolio.import", "Import into Stirling")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void importMember(attachment);
                    }}
                  >
                    <ImportIcon sx={{ fontSize: "1.2rem" }} />
                  </ActionIcon>
                )}
                <ActionIcon
                  variant="tertiary"
                  size="sm"
                  className="attachment-item__download-icon"
                  aria-label={t(
                    "viewer.attachments.download",
                    "Download attachment",
                  )}
                  title={t("viewer.attachments.download", "Download")}
                  onClick={(event) => handleDownload(attachment, event)}
                >
                  <DownloadIcon sx={{ fontSize: "1.2rem" }} />
                </ActionIcon>
              </>
            )}
          </div>
        </div>
      );
    });
  };

  if (!visible) {
    return null;
  }

  const isSearchActive = searchTerm.trim().length > 0;
  // A portfolio supplies its own members, so none of the live-document gates
  // below (capability present, document open, fetch state) apply to it.
  const hasAttachments = portfolio
    ? portfolio.members.length > 0
    : Array.isArray(activeEntry.attachments) &&
      activeEntry.attachments.length > 0;
  const isLocalLoading = attachmentSupport && activeEntry.status === "loading";
  const currentError =
    attachmentSupport && activeEntry.status === "error"
      ? activeEntry.error
      : null;

  const showAttachmentList =
    (isPortfolio || (attachmentSupport && documentCacheKey)) &&
    filteredAttachments.length > 0;
  const showEmptyState =
    !isPortfolio &&
    attachmentSupport &&
    documentCacheKey &&
    !isLocalLoading &&
    !currentError &&
    activeEntry.status === "success" &&
    !hasAttachments;
  const showSearchEmpty =
    (isPortfolio || (attachmentSupport && documentCacheKey)) &&
    isSearchActive &&
    hasAttachments &&
    filteredAttachments.length === 0;
  const showNoDocument = !isPortfolio && attachmentSupport && !documentCacheKey;

  return (
    <SidebarBase
      className="attachment-sidebar"
      title={
        isPortfolio
          ? t("viewer.portfolio.title", "Portfolio")
          : t("viewer.attachments.title", "Attachments")
      }
      icon={isPortfolio ? <CollectionsIcon /> : <AttachmentIcon />}
      rightOffset={`${(thumbnailVisible ? 15 : 0) + (bookmarkVisible ? 15 : 0)}rem`}
      visible={visible}
      onClose={toggleAttachmentSidebar}
      closeLabel={t(
        "viewer.attachments.closeSidebar",
        "Close attachments sidebar",
      )}
      searchTerm={searchTerm}
      searchPlaceholder={
        isPortfolio
          ? t("viewer.portfolio.searchPlaceholder", "Search files")
          : t("viewer.attachments.searchPlaceholder", "Search attachments")
      }
      onSearchChange={setSearchTerm}
    >
      {!attachmentSupport && !isPortfolio && (
        <div className="sidebar-base__empty-state">
          <Text size="sm" c="dimmed" ta="center">
            {t(
              "viewer.attachments.noSupport",
              "Attachment support is unavailable for this viewer.",
            )}
          </Text>
        </div>
      )}

      {attachmentSupport && showNoDocument && (
        <div className="sidebar-base__empty-state">
          <Text size="sm" c="dimmed" ta="center">
            {t(
              "viewer.attachments.noDocument",
              "Open a PDF to view its attachments.",
            )}
          </Text>
        </div>
      )}

      {!isPortfolio &&
        attachmentSupport &&
        documentCacheKey &&
        currentError && (
          <Stack gap="xs" align="center" className="sidebar-base__error">
            <Text size="sm" c="var(--color-red-dark)" ta="center">
              {currentError}
            </Text>
            <ActionIcon
              variant="secondary"
              aria-label={t("viewer.attachments.retry", "Retry")}
              onClick={requestReload}
            >
              <LocalIcon icon="refresh" />
            </ActionIcon>
          </Stack>
        )}

      {!isPortfolio &&
        attachmentSupport &&
        documentCacheKey &&
        isLocalLoading && (
          <Stack
            gap="md"
            align="center"
            c="dimmed"
            py="xl"
            className="sidebar-base__loading"
          >
            <Loader size="md" type="dots" />
            <Text size="sm" ta="center">
              {t("viewer.attachments.loading", "Loading attachments...")}
            </Text>
          </Stack>
        )}

      {showEmptyState && (
        <Stack align="center" gap="sm" py="lg">
          <LocalIcon
            icon="attachment-rounded"
            width="2rem"
            height="2rem"
            style={{ color: "var(--mantine-color-dimmed)" }}
          />
          <Text size="sm" c="dimmed" ta="center">
            {t("viewer.attachments.empty", "No attachments in this document")}
          </Text>
          <Button
            variant="tertiary"
            size="sm"
            onClick={handleAddAttachment}
            leftSection={<LocalIcon icon="add" width="1rem" height="1rem" />}
          >
            {t("viewer.attachments.addAttachment", "Add attachment")}
          </Button>
        </Stack>
      )}

      {showAttachmentList && (
        <>
          {isPortfolio && (
            <Text size="xs" c="dimmed" mb="xs">
              {t("viewer.portfolio.count", {
                count: filteredAttachments.length,
                defaultValue_one: "{{count}} file in this portfolio",
                defaultValue_other: "{{count}} files in this portfolio",
              })}
            </Text>
          )}
          <Button
            variant="tertiary"
            size="sm"
            fullWidth
            justify="start"
            onClick={handleAddAttachment}
            leftSection={
              <LocalIcon icon="add" width="0.9rem" height="0.9rem" />
            }
            style={{ marginBottom: "var(--space-xs)" }}
          >
            {isPortfolio
              ? t("viewer.portfolio.addFile", "Add file")
              : t("viewer.attachments.addAttachment", "Add attachment")}
          </Button>
          <div className="attachment-list">
            {renderAttachments(filteredAttachments)}
          </div>
        </>
      )}

      {showSearchEmpty && (
        <div className="sidebar-base__empty-state">
          <Text size="sm" c="dimmed" ta="center">
            {t(
              "viewer.attachments.noMatch",
              "No attachments match your search",
            )}
          </Text>
        </div>
      )}
    </SidebarBase>
  );
};
