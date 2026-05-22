import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Box, Popover, ScrollArea, Text, Loader } from "@mantine/core";
import AddIcon from "@mui/icons-material/Add";
import { useTranslation } from "react-i18next";
import {
  createStirlingFile,
  createFileId,
  createNewStirlingFileStub,
} from "@app/types/fileContext";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { useAllFiles } from "@app/contexts/FileContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { useFileContext } from "@app/contexts/file/fileHooks";
import { useFileManager } from "@app/hooks/useFileManager";
import { fileStorage } from "@app/services/fileStorage";
import apiClient from "@app/services/apiClient";
import {
  parseContentDispositionFilename,
  extractLatestFilesFromBundle,
} from "@app/services/shareBundleUtils";
import { truncateCenter } from "@app/utils/textUtils";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";
import styles from "@app/components/shared/FileSelectorPicker.module.css";
import "@app/components/shared/FileSidebarFileItem.css";

const LS_TAB = "filePicker.tab";
const LS_SORT = "filePicker.sort";
const LS_SORT_DIR = "filePicker.sortDir";

function lsGet<const T extends readonly string[]>(
  key: string,
  fallback: T[number],
  valid: T,
): T[number] {
  try {
    const v = localStorage.getItem(key);
    const allowed = valid as readonly string[];
    if (v && allowed.includes(v)) return v as T[number];
  } catch {
    /* ignore */
  }
  return fallback;
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ms: number | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMeta(stub: StirlingFileStub): string {
  const parts: string[] = [];
  const pages = stub.processedFile?.totalPages;
  if (pages) parts.push(`${pages} ${pages === 1 ? "page" : "pages"}`);
  const size = formatBytes(stub.size ?? 0);
  if (size) parts.push(size);
  const date = formatDate(stub.lastModified || stub.createdAt);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export interface FileSelectorResult {
  stub: StirlingFileStub;
  stirlingFile: StirlingFile;
}

export interface FileSelectorPickerProps {
  placeholder?: string;
  /** FileIds to hide from both lists (e.g. the other slot's current selection) */
  excludeIds?: string[];
  disabled?: boolean;
  /** Optional data-testid applied to the trigger box */
  testId?: string;
  /**
   * Called with the stub (for display) and the ready-to-use StirlingFile (for processing).
   * Files are NOT added to the workbench — data is loaded inline.
   */
  onSelect: (result: FileSelectorResult) => void;
}

export function FileSelectorPicker({
  placeholder,
  excludeIds = [],
  disabled = false,
  testId,
  onSelect,
}: FileSelectorPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"workbench" | "saved">(() =>
    lsGet(LS_TAB, "saved", ["workbench", "saved"]),
  );
  const [sortBy, setSortBy] = useState<"date" | "name">(() =>
    lsGet(LS_SORT, "date", ["date", "name"]),
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() =>
    lsGet(LS_SORT_DIR, "desc", ["asc", "desc"]),
  );
  const [savedStubs, setSavedStubs] = useState<StirlingFileStub[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredStub, setHoveredStub] = useState<{
    rect: DOMRect;
    stub: StirlingFileStub;
  } | null>(null);
  const [hoveredThumbnail, setHoveredThumbnail] = useState<string | null>(null);
  const thumbCancelRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { fileStubs: workbenchStubs } = useAllFiles();
  const indexedDB = useIndexedDB();
  const { selectors } = useFileContext();
  const { loadRecentFiles } = useFileManager();

  // Load thumbnail lazily when hovering over a file row
  useEffect(() => {
    if (!hoveredStub) {
      setHoveredThumbnail(null);
      return;
    }
    if (hoveredStub.stub.thumbnailUrl) {
      setHoveredThumbnail(hoveredStub.stub.thumbnailUrl);
      return;
    }
    thumbCancelRef.current = false;
    setHoveredThumbnail(null);
    (async () => {
      try {
        const file = await indexedDB.loadFile(hoveredStub.stub.id as FileId);
        if (!file || thumbCancelRef.current) return;
        const thumbnail = await generateThumbnailForFile(file);
        if (thumbCancelRef.current || !thumbnail) return;
        setHoveredThumbnail(thumbnail);
        void indexedDB.updateThumbnail(
          hoveredStub.stub.id as FileId,
          thumbnail,
        );
      } catch {
        // non-critical
      }
    })();
    return () => {
      thumbCancelRef.current = true;
    };
  }, [hoveredStub, indexedDB]);

  const handleTabChange = useCallback((tab: "workbench" | "saved") => {
    lsSet(LS_TAB, tab);
    setActiveTab(tab);
  }, []);

  const handleSortChange = useCallback(
    (sort: "date" | "name") => {
      if (sort === sortBy) {
        const newDir = sortDir === "asc" ? "desc" : "asc";
        lsSet(LS_SORT_DIR, newDir);
        setSortDir(newDir);
      } else {
        const defaultDir: "asc" | "desc" = sort === "name" ? "asc" : "desc";
        lsSet(LS_SORT, sort);
        lsSet(LS_SORT_DIR, defaultDir);
        setSortBy(sort);
        setSortDir(defaultDir);
      }
    },
    [sortBy, sortDir],
  );

  // Sync tab/sort from localStorage whenever this picker opens.
  // Both slot pickers mount simultaneously so their useState initialisers run at
  // the same time — a tab change in one picker writes to localStorage but the
  // other picker's React state is stale. Re-reading on open fixes that.
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(lsGet(LS_TAB, "saved", ["workbench", "saved"]));
    setSortBy(lsGet(LS_SORT, "date", ["date", "name"]));
    setSortDir(lsGet(LS_SORT_DIR, "desc", ["asc", "desc"]));
  }, [isOpen]);

  // Load saved files when the saved tab is active and the picker is open
  useEffect(() => {
    if (activeTab !== "saved" || !isOpen) return;
    setSavedLoading(true);
    loadRecentFiles()
      .then(setSavedStubs)
      .finally(() => setSavedLoading(false));
  }, [activeTab, isOpen, loadRecentFiles]);

  const workbenchIdSet = useMemo(
    () => new Set(workbenchStubs.map((s) => s.id)),
    [workbenchStubs],
  );

  const displayStubs = useMemo(() => {
    const base = activeTab === "workbench" ? workbenchStubs : savedStubs;
    const q = searchQuery.trim().toLowerCase();
    const filtered = base.filter(
      (s) =>
        !excludeIds.includes(s.id) && (!q || s.name.toLowerCase().includes(q)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sortBy === "name"
        ? dir * a.name.localeCompare(b.name)
        : dir *
          ((a.lastModified || a.createdAt || 0) -
            (b.lastModified || b.createdAt || 0)),
    );
  }, [
    activeTab,
    workbenchStubs,
    savedStubs,
    excludeIds,
    sortBy,
    sortDir,
    searchQuery,
  ]);

  const loadAndSelect = useCallback(
    async (stub: StirlingFileStub) => {
      if (loadingId) return;

      // Workbench file — get StirlingFile directly from FileContext (no loading needed)
      if (workbenchIdSet.has(stub.id)) {
        const sf = selectors.getFile(stub.id as FileId);
        if (sf) {
          // Prefer the workbench stub (has thumbnail) over the saved stub (may not)
          const workbenchStub =
            selectors.getStirlingFileStub(stub.id as FileId) ?? stub;
          onSelect({ stub: workbenchStub, stirlingFile: sf });
          setIsOpen(false);
        }
        return;
      }

      // Saved file — load bytes without touching the workbench
      setLoadingId(stub.id);
      try {
        let stirlingFile: StirlingFile | null = null;

        if (stub.remoteShareToken) {
          const res = await apiClient.get(
            `/api/v1/storage/share-links/${stub.remoteShareToken}`,
            {
              responseType: "blob",
              suppressErrorToast: true,
              skipAuthRedirect: true,
            } as any,
          );
          const ct =
            res.headers?.["content-type"] ||
            res.headers?.["Content-Type"] ||
            "";
          const disp =
            res.headers?.["content-disposition"] ||
            res.headers?.["Content-Disposition"] ||
            "";
          const files = await extractLatestFilesFromBundle(
            res.data as Blob,
            parseContentDispositionFilename(disp) || "shared-file",
            ct,
          );
          if (files[0])
            stirlingFile = createStirlingFile(files[0], createFileId());
        } else if (stub.remoteStorageId) {
          const res = await apiClient.get(
            `/api/v1/storage/files/${stub.remoteStorageId}/download`,
            {
              responseType: "blob",
              suppressErrorToast: true,
              skipAuthRedirect: true,
            } as any,
          );
          const ct =
            res.headers?.["content-type"] ||
            res.headers?.["Content-Type"] ||
            "";
          const disp =
            res.headers?.["content-disposition"] ||
            res.headers?.["Content-Disposition"] ||
            "";
          const files = await extractLatestFilesFromBundle(
            res.data as Blob,
            parseContentDispositionFilename(disp) || stub.name,
            ct,
          );
          if (files[0])
            stirlingFile = createStirlingFile(files[0], stub.id as FileId);
        } else {
          // Local IndexedDB file
          const localFile = await fileStorage.getStirlingFile(stub.id);
          if (localFile) stirlingFile = localFile;
        }

        if (stirlingFile) {
          // Generate thumbnail on-the-fly if the stub doesn't already have one
          let resolvedStub = stub;
          if (!resolvedStub.thumbnailUrl) {
            try {
              const thumbnail = await generateThumbnailForFile(stirlingFile);
              if (thumbnail) {
                resolvedStub = { ...stub, thumbnailUrl: thumbnail };
                // Persist so subsequent opens don't regenerate
                void fileStorage.updateThumbnail(
                  stirlingFile.fileId as FileId,
                  thumbnail,
                );
              }
            } catch {
              // Non-fatal — thumbnail simply won't show
            }
          }
          onSelect({ stub: resolvedStub, stirlingFile });
          setIsOpen(false);
        }
      } catch (err) {
        console.error("FileSelectorPicker: failed to load file", err);
      } finally {
        setLoadingId(null);
      }
    },
    [loadingId, workbenchIdSet, selectors, onSelect],
  );

  const handleUpload = useCallback(
    async (file: File | null) => {
      if (!file || uploadBusy || disabled) return;
      setUploadBusy(true);
      try {
        const id = createFileId();
        let stub = createNewStirlingFileStub(file, id);
        const stirlingFile = createStirlingFile(file, id);
        // Generate a first-page thumbnail for the uploaded file
        try {
          const thumbnail = await generateThumbnailForFile(file);
          if (thumbnail) stub = { ...stub, thumbnailUrl: thumbnail };
        } catch {
          // Non-fatal — thumbnail simply won't show
        }
        await fileStorage.storeStirlingFile(stirlingFile, stub);
        lsSet(LS_TAB, "saved");
        setActiveTab("saved");
        const refreshed = await loadRecentFiles();
        setSavedStubs(refreshed);
        onSelect({ stub, stirlingFile });
        setIsOpen(false);
      } catch (err) {
        console.error("FileSelectorPicker: upload failed", err);
      } finally {
        setUploadBusy(false);
      }
    },
    [disabled, loadRecentFiles, onSelect, uploadBusy],
  );

  const triggerClass = [
    styles.trigger,
    disabled ? styles.triggerDisabled : "",
    isOpen ? styles.triggerOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Popover
        opened={isOpen}
        onChange={setIsOpen}
        onClose={() => {
          setIsOpen(false);
          setSearchQuery("");
        }}
        position="bottom-start"
        withinPortal
        shadow="md"
        closeOnClickOutside
        clickOutsideEvents={["mousedown", "touchstart"]}
      >
        <Popover.Target>
          <Box
            className={triggerClass}
            style={{ width: "100%" }}
            data-testid={testId}
            onClick={() => {
              if (!disabled) setIsOpen((o) => !o);
            }}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (!disabled && (e.key === "Enter" || e.key === " "))
                setIsOpen((o) => !o);
            }}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
          >
            <Text
              size="sm"
              c="dimmed"
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {placeholder ||
                t("fileSelectorPicker.placeholder", "Select file")}
            </Text>
            <AddIcon
              style={{
                fontSize: 18,
                color: "var(--mantine-color-dimmed)",
                flexShrink: 0,
              }}
            />
          </Box>
        </Popover.Target>

        <Popover.Dropdown className={styles.dropdown}>
          <div className={styles.header}>
            <div className={styles.tabGroup}>
              <div
                className={styles.slimTabBar}
                role="group"
                aria-label={t(
                  "fileSelectorPicker.tabListLabel",
                  "Saved files, workbench, upload",
                )}
              >
                <button
                  type="button"
                  aria-pressed={activeTab === "saved"}
                  className={
                    activeTab === "saved"
                      ? styles.slimTabActive
                      : styles.slimTab
                  }
                  onClick={() => handleTabChange("saved")}
                >
                  {t("fileSelectorPicker.tabs.saved", "Saved files")}
                </button>
                <button
                  type="button"
                  aria-pressed={activeTab === "workbench"}
                  className={
                    activeTab === "workbench"
                      ? styles.slimTabActive
                      : styles.slimTab
                  }
                  onClick={() => handleTabChange("workbench")}
                >
                  {t("fileSelectorPicker.tabs.workbench", "Workbench")}
                </button>
                <button
                  type="button"
                  data-testid="file-selector-upload-btn"
                  className={styles.slimTabUpload}
                  aria-label={t(
                    "fileSelectorPicker.upload",
                    "Upload from computer",
                  )}
                  title={t("fileSelectorPicker.upload", "Upload from computer")}
                  disabled={disabled || uploadBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadBusy ? (
                    <Loader size={11} />
                  ) : (
                    t("fileSelectorPicker.tabs.upload", "Upload")
                  )}
                </button>
              </div>
            </div>

            <div className={styles.sortGroup}>
              <button
                type="button"
                className={[
                  styles.sortBtn,
                  sortBy === "date" ? styles.sortBtnActive : "",
                ].join(" ")}
                onClick={() => handleSortChange("date")}
                title={
                  sortDir === "desc"
                    ? t("fileSelectorPicker.sort.dateDesc", "Newest first")
                    : t("fileSelectorPicker.sort.dateAsc", "Oldest first")
                }
              >
                {t("fileSelectorPicker.sort.dateLabel", "Latest")}
                {sortBy === "date" && (
                  <span className={styles.sortArrow}>
                    {sortDir === "desc" ? " ↓" : " ↑"}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={[
                  styles.sortBtn,
                  sortBy === "name" ? styles.sortBtnActive : "",
                ].join(" ")}
                onClick={() => handleSortChange("name")}
                title={
                  sortDir === "asc"
                    ? t("fileSelectorPicker.sort.nameAsc", "A to Z")
                    : t("fileSelectorPicker.sort.nameDesc", "Z to A")
                }
              >
                {t("fileSelectorPicker.sort.nameLabel", "A–Z")}
                {sortBy === "name" && (
                  <span className={styles.sortArrow}>
                    {sortDir === "asc" ? " ↑" : " ↓"}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              type="search"
              placeholder={t("fileSelectorPicker.search", "Filter files…")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <ScrollArea h={260} className={styles.list}>
            {savedLoading ? (
              <div className={styles.emptyState}>
                <Loader size="sm" />
              </div>
            ) : displayStubs.length === 0 ? (
              <div className={styles.emptyState}>
                <Text size="sm">
                  {t("fileSelectorPicker.empty", "No files available")}
                </Text>
              </div>
            ) : (
              displayStubs.map((stub) => {
                const meta = buildMeta(stub);
                const isItemLoading = loadingId === stub.id;
                return (
                  <button
                    key={stub.id}
                    type="button"
                    className={styles.fileItem}
                    onClick={() => void loadAndSelect(stub)}
                    disabled={!!loadingId}
                    onMouseEnter={(e) =>
                      setHoveredStub({
                        rect: e.currentTarget.getBoundingClientRect(),
                        stub,
                      })
                    }
                    onMouseLeave={() => setHoveredStub(null)}
                  >
                    <div className={styles.fileItemContent}>
                      <span className={styles.fileName} title={stub.name}>
                        {truncateCenter(stub.name, 48)}
                      </span>
                      {meta && <span className={styles.fileMeta}>{meta}</span>}
                    </div>
                    {isItemLoading && <Loader size="xs" />}
                  </button>
                );
              })
            )}
          </ScrollArea>

          {hoveredStub &&
            hoveredThumbnail &&
            createPortal(
              <div
                className="file-sidebar-thumb-tooltip"
                style={{
                  top: hoveredStub.rect.top + hoveredStub.rect.height / 2,
                  left: hoveredStub.rect.left - 170,
                }}
              >
                <img
                  src={hoveredThumbnail}
                  alt=""
                  className="file-sidebar-thumb-img"
                />
              </div>,
              document.body,
            )}
        </Popover.Dropdown>
      </Popover>
      {/* Hidden file input lives outside the Popover so it is always in the DOM.
        Tests can target it directly with setInputFiles without opening the popover. */}
      <input
        ref={fileInputRef}
        type="file"
        data-testid={testId ? `${testId}-input` : "file-selector-upload-input"}
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void handleUpload(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
