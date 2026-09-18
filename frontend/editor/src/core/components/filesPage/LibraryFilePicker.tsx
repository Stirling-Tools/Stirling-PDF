import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Drawer, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useMediaQuery } from "@mantine/hooks";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { alert } from "@app/components/toast";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import { useProcessingFolders } from "@app/hooks/useProcessingFolders";
import { useFolderFileStates } from "@app/components/filesPage/useFolderFileStates";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { createQuickKey } from "@app/types/fileContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import {
  FileGrid,
  type FilesPageEntry,
} from "@app/components/filesPage/FileGrid";
import { LibraryToolbar } from "@app/components/filesPage/LibraryToolbar";
import { LibraryTabs } from "@app/components/filesPage/LibraryTabs";
import { useLibraryViewState } from "@app/components/filesPage/useLibraryViewState";
import { useLibraryScrollPosition } from "@app/components/filesPage/useLibraryScrollPosition";
import { FileDetailsPanel } from "@app/components/filesPage/FileDetailsPanel";
import { libraryEntries } from "@app/components/filesPage/libraryEntries";
import { useLibraryFiles } from "@app/components/filesPage/useLibraryFiles";
import { useDiskFolder } from "@app/components/filesPage/useDiskFolder";
import {
  addPickerItems,
  pickerKey,
  supportsPickerFile,
  type PickerItem,
} from "@app/components/filesPage/pickerSelection";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { readDiskFile } from "@app/services/localFolderContents";
import { zipFileService } from "@app/services/zipFileService";
import {
  createNewStirlingFileStub,
  type StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { folderKind, type FolderId } from "@app/types/folder";
import { getFolderChain } from "@app/utils/folderPath";
import { getDropzoneFiles } from "@app/utils/getDropzoneFiles";
import {
  Z_INDEX_FILE_MANAGER_MODAL,
  Z_INDEX_OVER_FILE_MANAGER_MODAL,
} from "@app/styles/zIndex";
import "@app/components/filesPage/FilesPage.css";
import "@app/components/filesPage/LibraryFilePicker.css";

interface Props {
  supportedFormats?: string[];
  onBusyChange: (busy: boolean) => void;
  onExternalPickerChange: (open: boolean) => void;
}

/** Shares the library's data and browser; navigation and uncommitted selections belong to this modal. */
export function LibraryFilePicker({
  supportedFormats,
  onBusyChange,
  onExternalPickerChange,
}: Props) {
  const { t } = useTranslation();
  const { closeFilesModal, onRecentFileSelect, maxSelectable, loadFiles } =
    useFilesModalContext();
  const library = useFilesPage();
  const folders = useFolders();
  const { fileIds: activeFileIds } = useAllFiles();
  const activeWorkspaceFileIds = useMemo(
    () => new Set<string>(activeFileIds),
    [activeFileIds],
  );
  const { config } = useAppConfig();
  const { sharingEnabled } = useSharingEnabled();
  const drive = useGoogleDrivePicker();
  const isPhone = useIsMobile();
  const compact = useMediaQuery("(max-width: 1000px)") ?? false;
  const {
    currentFolderId,
    setCurrentFolderId,
    currentTab,
    setCurrentTab,
    search,
    setSearch,
    sortMode,
    setSortMode,
    originFilter,
    setOriginFilter,
    typeFilter,
    setTypeFilter,
  } = useLibraryViewState("recent");
  const browserRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Map<string, PickerItem>>(
    () => new Map(),
  );
  const [uploads, setUploads] = useState<
    Map<FileId, Extract<PickerItem, { kind: "upload" }>>
  >(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false);
  const [showSelected, setShowSelected] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSelected = useRef<string | null>(null);
  const currentFolder = currentFolderId
    ? folders.foldersById.get(currentFolderId)
    : undefined;
  const directory =
    currentFolder && folderKind(currentFolder) === "local"
      ? currentFolder.directory
      : undefined;
  const { diskEntries, diskLoading } = useDiskFolder(
    directory,
    currentFolderId,
    library.diskRevision,
    setError,
  );
  const processing = useProcessingFolders();
  const processingRecord = currentFolder
    ? processing.stateFor(currentFolder)
    : undefined;
  const { fileStates } = useFolderFileStates(
    processingRecord?.id,
    Boolean(processingRecord),
  );
  const uploadStubs = useMemo(
    () => Array.from(uploads.values(), (item) => item.stub),
    [uploads],
  );
  const { visibleFiles, visibleFolders, availableTypes } = useLibraryFiles({
    allFiles: library.allFiles,
    stagedFiles: uploadStubs,
    currentFolderId,
    currentTab,
    search,
    sortMode,
    originFilter,
    typeFilter,
    diskEntries: directory ? diskEntries : undefined,
  });
  const fileMap = useMemo(
    () =>
      new Map([
        ...library.fileMap,
        ...uploadStubs.map((stub) => [stub.id, stub] as const),
        ...Array.from(selection.values()).flatMap((item) =>
          item.kind === "disk" ? [] : [[item.stub.id, item.stub] as const],
        ),
      ]),
    [library.fileMap, uploadStubs, selection],
  );
  const selectedFileIds = useMemo(
    () =>
      new Set(
        Array.from(selection.values()).flatMap((item) =>
          item.kind === "disk" ? [] : [item.stub.id],
        ),
      ),
    [selection],
  );
  const selectedDiskPaths = useMemo(
    () =>
      new Set(
        Array.from(selection.values()).flatMap((item) =>
          item.kind === "disk" ? [item.entry.path] : [],
        ),
      ),
    [selection],
  );

  const browserEntries = useMemo<FilesPageEntry[]>(
    () => [
      ...visibleFiles
        .filter((stub) => uploads.has(stub.id))
        .map<FilesPageEntry>((file) => ({ kind: "file", file })),
      ...libraryEntries({
        visibleFolders,
        visibleFiles: visibleFiles.filter((stub) => !uploads.has(stub.id)),
        currentFolderId,
        foldersById: folders.foldersById,
        fileCountsByFolder: library.fileCountsByFolder,
        search,
        sortMode,
        originFilter,
        typeFilter,
        diskEntries: directory ? diskEntries : undefined,
      }).map((entry) => ({
        ...entry,
        diskState: fileStates.get(entry.disk?.name ?? entry.file?.name ?? ""),
      })),
    ],
    [
      uploads,
      visibleFolders,
      visibleFiles,
      currentFolderId,
      folders.foldersById,
      library.fileCountsByFolder,
      search,
      sortMode,
      originFilter,
      typeFilter,
      directory,
      diskEntries,
      fileStates,
    ],
  );

  const entries = showSelected
    ? Array.from(selection.values()).map<FilesPageEntry>((item) =>
        item.kind === "disk"
          ? { kind: "diskFile", disk: item.entry }
          : { kind: "file", file: item.stub },
      )
    : browserEntries;

  const itemForEntry = useCallback(
    (entry: FilesPageEntry): PickerItem | null => {
      if (entry.disk) return { kind: "disk", entry: entry.disk };
      if (entry.file)
        return (
          uploads.get(entry.file.id) ?? { kind: "stored", stub: entry.file }
        );
      return null;
    },
    [uploads],
  );

  const selectItem = (item: PickerItem, shift = false) => {
    if (busyRef.current) return;
    const key = pickerKey(item);
    const visible = entries.find((entry) => {
      const candidate = itemForEntry(entry);
      return candidate && pickerKey(candidate) === key;
    });
    if (visible?.diskState === "processing") return;
    const anchor = lastSelected.current;
    setSelection((previous) => {
      if (shift && anchor) {
        const candidates = entries
          .filter((entry) => entry.diskState !== "processing")
          .flatMap((entry) => {
            const candidate = itemForEntry(entry);
            return candidate ? [candidate] : [];
          });
        const from = candidates.findIndex(
          (candidate) => pickerKey(candidate) === anchor,
        );
        const to = candidates.findIndex(
          (candidate) => pickerKey(candidate) === key,
        );
        if (from >= 0 && to >= 0)
          return addPickerItems(
            previous,
            candidates.slice(Math.min(from, to), Math.max(from, to) + 1),
            maxSelectable,
            supportedFormats,
          );
      }
      if (previous.has(key)) {
        const next = new Map(previous);
        next.delete(key);
        return next;
      }
      return addPickerItems(previous, [item], maxSelectable, supportedFormats);
    });
    lastSelected.current = key;
  };

  const disabledReason = (entry: FilesPageEntry) => {
    const item = itemForEntry(entry);
    if (!item) return undefined;
    if (entry.diskState === "processing")
      return t(
        "filesPage.diskState.processingHint",
        "Processing - available when it finishes",
      );
    const name = item.kind === "disk" ? item.entry.name : item.stub.name;
    if (!supportsPickerFile(name, supportedFormats))
      return t(
        "filePicker.unsupported",
        "This file type isn't supported by the selected tool.",
      );
    if (busy) return t("filePicker.adding", "Adding files…");
    if (
      maxSelectable !== null &&
      maxSelectable !== 1 &&
      selection.size >= maxSelectable &&
      !selection.has(pickerKey(item))
    )
      return t("filePicker.limit", "Choose up to {{count}} files.", {
        count: maxSelectable,
      });
    return undefined;
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error
      ? cause.message
      : t("filePicker.error", "Could not add these files. Please try again.");
  const reportError = (cause: unknown) => setError(errorMessage(cause));
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      reportError(cause);
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  const stageFiles = (files: File[]) => {
    if (busyRef.current) return;
    const uploadsByKey = new Map(
      Array.from(uploads.values(), (item) => [createQuickKey(item.file), item]),
    );
    const newItems = files.map((file) => {
      const key = createQuickKey(file);
      const existing = uploadsByKey.get(key);
      const localFilePath = pendingFilePathMappings.get(key);
      pendingFilePathMappings.delete(key);
      if (existing) return existing;
      const stub = createNewStirlingFileStub(file);
      stub.localFilePath = localFilePath;
      const item = { kind: "upload" as const, file, stub };
      uploadsByKey.set(key, item);
      return item;
    });
    setUploads(
      (previous) =>
        new Map([
          ...previous,
          ...newItems.map((item) => [item.stub.id, item] as const),
        ]),
    );
    setSelection((previous) =>
      addPickerItems(previous, newItems, maxSelectable, supportedFormats),
    );
    if (files.some((file) => !supportsPickerFile(file.name, supportedFormats)))
      setError(
        t(
          "filePicker.unsupported",
          "This file type isn't supported by the selected tool.",
        ),
      );
  };

  const pickFromComputer = async () => {
    try {
      stageFiles(
        await openFilesFromDisk({
          multiple: maxSelectable !== 1,
          onFallbackOpen: () => fileInput.current?.click(),
        }),
      );
    } catch (cause) {
      reportError(cause);
    }
  };

  const confirm = async (items = Array.from(selection.values())) => {
    if (busyRef.current) return;
    const eligible = Array.from(
      addPickerItems(
        new Map(),
        items,
        maxSelectable,
        supportedFormats,
      ).values(),
    );
    if (!eligible.length) return;
    busyRef.current = true;
    closeFilesModal();
    try {
      const stored: StirlingFileStub[] = [];
      const incoming: File[] = [];
      for (const item of eligible) {
        if (item.kind === "stored")
          stored.push(library.fileMap.get(item.stub.id) ?? item.stub);
        else if (item.kind === "upload") {
          if (item.stub.localFilePath)
            pendingFilePathMappings.set(
              createQuickKey(item.file),
              item.stub.localFilePath,
            );
          incoming.push(item.file);
        } else {
          const file = await readDiskFile(item.entry);
          if (!file)
            throw new Error(
              t(
                "filePicker.fileUnavailable",
                "{{name}} is no longer available.",
                { name: item.entry.name },
              ),
            );
          pendingFilePathMappings.set(createQuickKey(file), item.entry.path);
          incoming.push(file);
        }
      }
      await onRecentFileSelect(stored, incoming);
    } catch (cause) {
      alert({
        alertType: "error",
        title: t("filePicker.errorTitle", "Couldn't add files"),
        body: errorMessage(cause),
        expandable: false,
        durationMs: 5000,
      });
    }
  };

  const unzip = (stub: StirlingFileStub) =>
    run(async () => {
      const upload = uploads.get(stub.id);
      const [file] = upload ? [upload.file] : await loadFiles([stub]);
      if (!file)
        throw new Error(
          t("filePicker.fileUnavailable", "{{name}} is no longer available.", {
            name: stub.name,
          }),
        );
      const result = await zipFileService.extractAllFiles(file);
      if (!result.success)
        throw new Error(
          result.errors.join("\n") ||
            t(
              "filePicker.emptyZip",
              "No files could be extracted from this ZIP.",
            ),
        );
      const extracted = result.extractedFiles.map((file) => ({
        kind: "upload" as const,
        file,
        stub: createNewStirlingFileStub(file),
      }));
      setUploads(
        (previous) =>
          new Map([
            ...previous,
            ...extracted.map((item) => [item.stub.id, item] as const),
          ]),
      );
      setSelection((previous) => {
        const next = new Map(previous);
        next.delete(pickerKey({ kind: "stored", stub }));
        return addPickerItems(next, extracted, maxSelectable, supportedFormats);
      });
      if (result.errors.length) setError(result.errors.join("\n"));
    });

  const openFolder = (id: FolderId | null) => {
    setShowSelected(false);
    setCurrentTab("all");
    setCurrentFolderId(id);
    setSearch("");
    lastSelected.current = null;
  };
  const onScrollCapture = useLibraryScrollPosition(
    browserRef,
    `${currentTab}:${currentFolderId}:${library.viewMode}:${showSelected}`,
    library.loading || diskLoading,
    entries.length,
  );
  const details = (
    <FileDetailsPanel
      selectedFileIds={[...selectedFileIds]}
      fileMap={fileMap}
      foldersById={folders.foldersById}
      onClose={() => setDetailsOpen(false)}
      onPickVersion={(stub) => selectItem({ kind: "stored", stub })}
    />
  );

  return (
    <div
      ref={browserRef}
      onScrollCapture={onScrollCapture}
      className="files-page library-file-picker"
      data-tour="files-modal"
    >
      <header className="library-picker-header">
        <div>
          <h2>{t("filePicker.title", "Add files")}</h2>
          <Text size="sm" c="dimmed">
            {t(
              "filePicker.subtitle",
              "Choose from your library or add something new.",
            )}
          </Text>
        </div>
        <ActionIcon
          variant="tertiary"
          disabled={busy}
          onClick={closeFilesModal}
          aria-label={t("close", "Close")}
        >
          <Icon name="x" />
        </ActionIcon>
      </header>
      <div className="library-picker-imports" data-tour="file-sources">
        <Button
          variant="tertiary"
          disabled={busy}
          leftSection={<Icon name="file-up" />}
          onClick={() => void pickFromComputer()}
        >
          {t("filePicker.fromComputer", "From your computer")}
        </Button>
        {drive.isEnabled && (
          <Button
            variant="tertiary"
            disabled={busy}
            loading={drive.isLoading}
            leftSection={<Icon name="googledrive" />}
            onClick={() => {
              onExternalPickerChange(true);
              void drive
                .openPicker({ multiple: maxSelectable !== 1 })
                .then(stageFiles)
                .catch(reportError)
                .finally(() => onExternalPickerChange(false));
            }}
          >
            Google Drive
          </Button>
        )}
        {config?.enableMobileScanner && !isPhone && (
          <Button
            variant="tertiary"
            disabled={busy}
            leftSection={<Icon name="qr-code" />}
            onClick={() => setMobileUploadOpen(true)}
          >
            {t("filePicker.fromPhone", "From your phone")}
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple={maxSelectable !== 1}
          accept={supportedFormats
            ?.map((format) => `.${format.replace(/^\./, "")}`)
            .join(",")}
          onChange={(event) => {
            stageFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      {(error || drive.error) && (
        <Alert
          title={t("filePicker.errorTitle", "Couldn't add files")}
          withCloseButton
          onClose={() => setError(null)}
          role="alert"
        >
          {error ?? drive.error}
        </Alert>
      )}
      <LibraryTabs
        currentTab={currentTab}
        sharingEnabled={sharingEnabled}
        onOpenRoot={() => openFolder(null)}
        onChange={(tab) => {
          setShowSelected(false);
          setCurrentTab(tab);
        }}
        breadcrumbs={
          currentFolderId !== null && (
            <nav
              className="files-page-breadcrumbs"
              aria-label={t("filePicker.folderPath", "Folder path")}
            >
              {getFolderChain(currentFolderId, folders.foldersById).map(
                (folder) => (
                  <span className="library-picker-crumb" key={folder.id}>
                    <Icon name="chevron-right" size={14} />
                    <button
                      className="files-page-breadcrumb"
                      onClick={() => openFolder(folder.id)}
                    >
                      {folder.name}
                    </button>
                  </span>
                ),
              )}
            </nav>
          )
        }
      />
      <div className="library-picker-controls">
        <div className="files-page-toolbar-actions">
          <LibraryToolbar
            dropdownZIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
            isMobile={compact}
            availableTypes={availableTypes}
            originFilter={originFilter}
            setOriginFilter={setOriginFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            search={search}
            setSearch={setSearch}
            sortMode={sortMode}
            setSortMode={setSortMode}
            viewMode={library.viewMode}
            setViewMode={library.setViewMode}
          />
        </div>
      </div>
      <div className="files-page-body">
        <Dropzone
          className="library-picker-dropzone"
          disabled={busy}
          activateOnClick={false}
          useFsAccessApi={false}
          getFilesFromEvent={async (event) => {
            try {
              return await getDropzoneFiles(event);
            } catch (cause) {
              setDragging(false);
              reportError(cause);
              return [];
            }
          }}
          onDrop={(files) => {
            setDragging(false);
            stageFiles(files);
          }}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onReject={() => {
            setDragging(false);
            setError(
              t(
                "filePicker.error",
                "Could not add these files. Please try again.",
              ),
            );
          }}
          styles={{ inner: { pointerEvents: "all", height: "100%" } }}
        >
          <div className="files-page-content" data-tour="recent-files">
            {!entries.length &&
            !library.loading &&
            !diskLoading &&
            !search &&
            !typeFilter.length &&
            originFilter === "all" ? (
              <button
                className="library-picker-empty"
                onClick={() => void pickFromComputer()}
                disabled={busy}
              >
                <Icon name="files" size={48} />
                <strong>
                  {t(
                    "filePicker.dropTitle",
                    "Drop files here, or click to browse",
                  )}
                </strong>
                <span>
                  {t(
                    "filePicker.dropHint",
                    "Choose the files you want to work with.",
                  )}
                </span>
              </button>
            ) : (
              <FileGrid
                entries={entries}
                loading={library.loading || diskLoading}
                selectedFileIds={selectedFileIds}
                activeWorkspaceFileIds={activeWorkspaceFileIds}
                viewMode={library.viewMode}
                currentTab={currentTab}
                searchActive={Boolean(
                  search || typeFilter.length || originFilter !== "all",
                )}
                sortMode={sortMode}
                onChangeSortMode={setSortMode}
                onOpenFolder={openFolder}
                onSelectFile={(id, shift) => {
                  const stub = fileMap.get(id);
                  if (stub)
                    selectItem(
                      uploads.get(id) ?? { kind: "stored", stub },
                      shift,
                    );
                }}
                onOpenFile={(stub) =>
                  void confirm([
                    uploads.get(stub.id) ?? { kind: "stored", stub },
                  ])
                }
                onOpenDiskFile={(entry) =>
                  void confirm([{ kind: "disk", entry }])
                }
                onSetSelection={(ids) =>
                  setSelection((previous) => {
                    const next = new Map(previous);
                    for (const [key, item] of next)
                      if (item.kind !== "disk" && !ids.has(item.stub.id))
                        next.delete(key);
                    return addPickerItems(
                      next,
                      [...ids].flatMap((id) => {
                        const stub = fileMap.get(id);
                        return stub
                          ? [
                              uploads.get(id) ?? {
                                kind: "stored" as const,
                                stub,
                              },
                            ]
                          : [];
                      }),
                      maxSelectable,
                      supportedFormats,
                    );
                  })
                }
                picker={{
                  disabledReason,
                  selectedDiskPaths,
                  onSelectDiskFile: (entry, shift) =>
                    selectItem({ kind: "disk", entry }, shift),
                  onSetDiskSelection: (disks) =>
                    setSelection((previous) => {
                      const next = new Map(previous);
                      for (const entry of entries)
                        if (entry.disk)
                          next.delete(
                            pickerKey({ kind: "disk", entry: entry.disk }),
                          );
                      return addPickerItems(
                        next,
                        disks.map((entry) => ({ kind: "disk", entry })),
                        maxSelectable,
                        supportedFormats,
                      );
                    }),
                  onUnzipFile: (stub) => void unzip(stub),
                }}
              />
            )}
            {dragging && (
              <div className="files-page-drop-overlay">
                <Icon name="file-up" size={40} />
                <span>
                  {t(
                    "filePicker.dropTitle",
                    "Drop files here, or click to browse",
                  )}
                </span>
              </div>
            )}
          </div>
        </Dropzone>
        {detailsOpen && selectedFileIds.size > 0 && !compact && details}
      </div>
      <footer className="library-picker-footer">
        <div className="library-picker-selection">
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => setShowSelected((value) => !value)}
            aria-pressed={showSelected}
            disabled={!selection.size && !showSelected}
          >
            {maxSelectable
              ? t(
                  "filePicker.selectedLimit",
                  "{{count}} of {{limit}} selected",
                  { count: selection.size, limit: maxSelectable },
                )
              : t("filesPage.selectedCount", "{{count}} selected", {
                  count: selection.size,
                })}
          </Button>
          {selection.size > 0 && (
            <Button
              size="sm"
              variant="tertiary"
              disabled={busy}
              onClick={() => setSelection(new Map())}
            >
              {t("filesPage.deselectAll", "Clear selection")}
            </Button>
          )}
          {selectedFileIds.size > 0 && (
            <ActionIcon
              variant="tertiary"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-label={t("filesPage.details", "Details")}
            >
              <Icon name="info" size={20} />
            </ActionIcon>
          )}
        </div>
        <div className="library-picker-footer-actions">
          <Button
            fat
            variant="tertiary"
            disabled={busy}
            onClick={closeFilesModal}
          >
            {t("cancel", "Cancel")}
          </Button>
          <Button
            fat
            disabled={!selection.size}
            loading={busy}
            onClick={() => void confirm()}
          >
            {t("filePicker.add", "Add {{count}} files", {
              count: selection.size,
            })}
          </Button>
        </div>
      </footer>
      <Drawer
        opened={compact && detailsOpen && selectedFileIds.size > 0}
        onClose={() => setDetailsOpen(false)}
        position="right"
        title={t("filesPage.details", "Details")}
        zIndex={Z_INDEX_FILE_MANAGER_MODAL + 1}
      >
        {details}
      </Drawer>
      <MobileUploadModal
        opened={mobileUploadOpen}
        onClose={() => setMobileUploadOpen(false)}
        onFilesReceived={(files) => {
          stageFiles(files);
          setMobileUploadOpen(false);
        }}
      />
    </div>
  );
}
