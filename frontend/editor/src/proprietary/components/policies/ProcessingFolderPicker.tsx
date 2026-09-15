import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Banner, Button, FormField, Input } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { NewFolderButton } from "@app/components/filesPage/NewFolderButton";
import { FolderListRow } from "@app/components/filesPage/FolderListRow";
import { FolderProcessingTag } from "@app/components/filesPage/FolderProcessingTag";
import type { ProcessingRecordSummary } from "@app/hooks/useProcessingFolders";
import {
  createFolderId,
  diskFolderId,
  folderKind,
  type FolderId,
  type FolderRecord,
} from "@app/types/folder";
import type { PickedDirectory } from "@app/services/directoryPicker";
import {
  canDropDirectory,
  directoryFromDrop,
} from "@app/services/directoryDrop";
import { directoryKey } from "@app/services/localFolderStorage";
import { getFolderChain } from "@app/utils/folderPath";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import {
  processingFolderPath,
  processingFolderForTarget,
  isValidProcessingFolderName,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";
import { useFolderPickerBack } from "@app/components/policies/useFolderPickerBack";
import { ProcessingFolderLocationPicker } from "@app/components/policies/ProcessingFolderLocationPicker";
import { ProcessingFolderActionCard } from "@app/components/policies/ProcessingFolderActionCard";
import type { DownloadsProcessing } from "@app/hooks/useDownloadsProcessing";
import "@app/components/filesPage/FilesPage.css";

type AddedFolder = {
  folder: FolderRecord;
  target: Exclude<ProcessingFolderTarget, { kind: "existing" }>;
};

function addedFolder(
  target: AddedFolder["target"],
  id?: FolderId,
): AddedFolder {
  const local = target.kind === "local";
  return {
    target,
    folder: {
      id:
        id ??
        (local
          ? diskFolderId(directoryKey(target.directory.path))
          : createFolderId()),
      kind: target.kind,
      name: local ? target.directory.name : target.name,
      directory: local ? target.directory.path : undefined,
      parentFolderId: local ? null : target.parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

export interface ProcessingFolderPickerProps {
  active: boolean;
  folders: FolderRecord[];
  recordFor: (folder: FolderRecord) => ProcessingRecordSummary | undefined;
  canPickDirectory: boolean;
  serverDisabledReason: string | null;
  serverLabel: string;
  target: ProcessingFolderTarget | null;
  onChange: (target: ProcessingFolderTarget | null) => void;
  onFolderAdded: () => void;
  onClose: () => void;
  pickDirectory: () => Promise<PickedDirectory | null>;
  downloadsProcessing?: DownloadsProcessing;
}

/** Chooses a destination without creating or mounting anything on cancellation. */
export function ProcessingFolderPicker({
  active,
  folders,
  recordFor,
  canPickDirectory,
  serverDisabledReason,
  serverLabel,
  target,
  onChange,
  onFolderAdded,
  onClose,
  pickDirectory,
  downloadsProcessing,
}: ProcessingFolderPickerProps) {
  const { t } = useTranslation();
  const selectionName = useId();
  const selectedFolder = processingFolderForTarget(target, folders);
  // Draft rows survive selection changes without persisting folders before confirmation.
  const [added, setAdded] = useState<AddedFolder[]>(() =>
    target && target.kind !== "existing"
      ? [
          selectedFolder
            ? { folder: selectedFolder, target }
            : addedFolder(target),
        ]
      : [],
  );
  const pendingSelection = added.find((item) => item.target === target);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<FolderId | undefined>();
  const previousTarget = useRef(target);
  const [currentId, setCurrentId] = useState<FolderId | null>(
    target?.kind === "local"
      ? null
      : selectedFolder
        ? selectedFolder.parentFolderId
        : target?.kind === "server"
          ? target.parentId
          : null,
  );
  const [parentId, setParentId] = useState<FolderId | null>(
    target?.kind === "server" ? target.parentId : null,
  );
  const [search, setSearch] = useState("");
  const visits = useRef<{ id: FolderId | null; search: string }[]>([]);
  const [hasHistory, setHasHistory] = useState(false);
  const goBack = useFolderPickerBack(active && hasHistory, () => {
    const previous = visits.current.pop();
    if (previous) {
      showFolder(previous.id);
      setSearch(previous.search);
    }
    const remaining = visits.current.length > 0;
    setHasHistory(remaining);
    return remaining;
  });
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = [
    ...folders.filter((folder) => folderKind(folder) !== "virtual"),
    ...added
      .filter((item) => !processingFolderForTarget(item.target, folders))
      .map((item) => item.folder),
  ];
  const hasFolders = available.length > 0;
  const showLibrary = hasFolders || !canPickDirectory || creating;
  const emptyServer = !canPickDirectory && !hasFolders;
  const offerServerCreation = canPickDirectory && !serverDisabledReason;
  const addedLocalIds = new Set(
    added
      .filter((item) => item.target.kind === "local")
      .map(
        (item) =>
          processingFolderForTarget(item.target, folders)?.id ?? item.folder.id,
      ),
  );
  const byId = new Map(available.map((folder) => [folder.id, folder]));
  const query = search.trim().toLocaleLowerCase();
  const visible = available
    .filter((folder) =>
      query
        ? folder.name.toLocaleLowerCase().includes(query)
        : currentId === null
          ? !folder.parentFolderId ||
            !byId.has(folder.parentFolderId) ||
            addedLocalIds.has(folder.id)
          : folder.parentFolderId === currentId,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const trail = getFolderChain(currentId, byId);
  const selectedId = selectedFolder?.id ?? pendingSelection?.folder.id ?? null;
  const parent = parentId ? byId.get(parentId) : undefined;
  const creationParentId = currentId;
  const newFolderBlockedReason = canPickDirectory ? null : serverDisabledReason;
  const parentPath = parent
    ? `${serverLabel} / ${processingFolderPath(parent, folders)}`
    : serverLabel;

  function folderDisabledReason(folder: FolderRecord) {
    if (folderKind(folder) === "server") return serverDisabledReason;
    return null;
  }

  function select(folder: FolderRecord) {
    if (folderDisabledReason(folder)) return;
    setCreating(false);
    onChange(
      added.find(
        (item) =>
          (processingFolderForTarget(item.target, folders)?.id ??
            item.folder.id) === folder.id,
      )?.target ?? {
        kind: "existing",
        folder,
      },
    );
  }

  function showFolder(id: FolderId | null) {
    const folder = folders.find((item) => item.id === id);
    if (folder && folderDisabledReason(folder)) return;
    setCurrentId(id);
    setSearch("");
    if (folder) select(folder);
  }

  function remember() {
    visits.current.push({ id: currentId, search });
    setHasHistory(true);
  }

  function navigate(folder: FolderRecord | null) {
    if (folder && folderDisabledReason(folder)) return;
    if (folder && !folders.some((item) => item.id === folder.id)) return;
    if ((folder?.id ?? null) === currentId && !search) return;
    remember();
    showFolder(folder?.id ?? null);
  }

  function cancelCreation() {
    setCreating(false);
    onChange(previousTarget.current);
  }

  function startCreation(requestedParent = creationParentId) {
    const requested = requestedParent ? byId.get(requestedParent) : undefined;
    const current = currentId ? byId.get(currentId) : undefined;
    const invalidLocation =
      (requested && folderKind(requested) !== "server") ||
      (current && folderKind(current) !== "server");
    const nextParent = !invalidLocation && requested ? requested.id : null;
    if (invalidLocation) {
      setCurrentId(null);
      setSearch("");
    }
    visits.current = [];
    setHasHistory(false);
    setCreating(true);
    setEditingId(undefined);
    setName("");
    setParentId(nextParent);
    setError(null);
    if (!creating) previousTarget.current = target;
    onChange(null);
  }

  function addTarget(nextTarget: AddedFolder["target"], id?: FolderId) {
    const existing = processingFolderForTarget(nextTarget, folders);
    const item = existing
      ? { folder: existing, target: nextTarget }
      : addedFolder(nextTarget, id);
    setAdded((current) => [
      ...current.filter((entry) => entry.folder.id !== item.folder.id),
      item,
    ]);
    visits.current = [];
    setHasHistory(false);
    setCurrentId(nextTarget.kind === "server" ? nextTarget.parentId : null);
    setSearch("");
    setCreating(false);
    onChange(nextTarget);
    if (!id) onFolderAdded();
  }

  function editFolder(item: AddedFolder) {
    if (item.target.kind !== "server") return;
    previousTarget.current = target;
    setName(item.target.name);
    setParentId(item.target.parentId);
    setEditingId(item.folder.id);
    setCreating(true);
    onChange(null);
  }

  async function browse() {
    setPicking(true);
    setError(null);
    try {
      const picked = await pickDirectory();
      if (picked) {
        addTarget({
          kind: "local",
          directory: picked,
          name: null,
        });
      }
    } catch (cause) {
      setError(extractErrorMessage(cause));
    } finally {
      setPicking(false);
    }
  }

  async function dropDirectory(dataTransfer: DataTransfer) {
    setPicking(true);
    setError(null);
    try {
      const directory = await directoryFromDrop(dataTransfer);
      if (directory) {
        addTarget({ kind: "local", directory, name: null });
      } else {
        setError(t("processingFolders.setup.dropError"));
      }
    } catch {
      setError(t("processingFolders.setup.dropError"));
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="folder-setup__picker">
      <div
        className={`folder-setup__folder-layout${canPickDirectory && showLibrary ? " folder-setup__folder-layout--computer" : ""}`}
      >
        {canPickDirectory && (
          <aside className="folder-setup__computer">
            <ProcessingFolderActionCard
              title={t(
                canDropDirectory
                  ? "processingFolders.setup.dropHeading"
                  : "processingFolders.setup.computerHeading",
              )}
              description={t(
                canDropDirectory
                  ? "processingFolders.setup.dropDescription"
                  : "processingFolders.setup.computerDescription",
              )}
              onDrop={
                canDropDirectory
                  ? (dataTransfer) => void dropDirectory(dataTransfer)
                  : undefined
              }
              disabled={picking || !active}
              onChoose={() => void browse()}
              footer={
                offerServerCreation
                  ? {
                      label: t("processingFolders.setup.serverAction"),
                      onClick: () => {
                        if (!creating) startCreation(null);
                      },
                    }
                  : downloadsProcessing
                    ? {
                        label: t("processingFolders.setup.downloadsAction"),
                        onClick: downloadsProcessing.start,
                      }
                    : undefined
              }
            />
          </aside>
        )}
        {showLibrary && (
          <div className="folder-setup__library">
            {hasFolders && (
              <div className="folder-setup__folder-toolbar">
                <Input
                  aria-label={t("processingFolders.setup.searchFolders")}
                  placeholder={t("processingFolders.setup.searchFolders")}
                  leadingIcon={<Icon name="search" size={18} />}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <NewFolderButton
                  label={t("processingFolders.setup.addFolder")}
                  localFolderLabel={t("processingFolders.setup.fromComputer")}
                  currentFolderId={creationParentId}
                  allowKindSelection
                  canAddLocalFolder={canPickDirectory}
                  disabledReason={
                    picking
                      ? t("loading", "Loading...")
                      : newFolderBlockedReason
                  }
                  serverDisabledReason={serverDisabledReason}
                  onAddLocalFolder={() => void browse()}
                  onOpenDialog={startCreation}
                  returnFocus={!creating}
                />
              </div>
            )}
            {(creating || emptyServer) && (
              <form
                className="folder-setup__new-folder"
                aria-label={t("processingFolders.setup.newFolder")}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    isValidProcessingFolderName(name) &&
                    !serverDisabledReason
                  ) {
                    addTarget(
                      { kind: "server", name: name.trim(), parentId },
                      editingId,
                    );
                  }
                }}
              >
                <div
                  className="folder-setup__new-folder-icon"
                  aria-hidden="true"
                >
                  <Icon name="folder" size={22} />
                </div>
                <FormField
                  label={t("processingFolders.setup.folderName")}
                  required
                  error={
                    name.trim() && !isValidProcessingFolderName(name)
                      ? t("processingFolders.setup.invalidName")
                      : undefined
                  }
                >
                  <Input
                    autoFocus={active}
                    data-autofocus={active || undefined}
                    value={name}
                    maxLength={120}
                    disabled={Boolean(serverDisabledReason)}
                    placeholder={t("processingFolders.setup.namePlaceholder")}
                    onChange={(event) => setName(event.target.value)}
                  />
                </FormField>
                <div className="folder-setup__new-folder-location">
                  <span>{t("processingFolders.setup.createIn")}</span>
                  <div title={parentPath}>
                    <Icon name="cloud" size={18} />
                    <span>{parentPath}</span>
                    <ProcessingFolderLocationPicker
                      folders={folders}
                      parentId={parentId}
                      serverLabel={serverLabel}
                      onChange={setParentId}
                    />
                    <Button
                      type="submit"
                      disabled={
                        !isValidProcessingFolderName(name) ||
                        Boolean(serverDisabledReason)
                      }
                    >
                      {t(
                        editingId
                          ? "processingFolders.setup.saveFolder"
                          : "processingFolders.setup.addFolder",
                      )}
                    </Button>
                  </div>
                </div>
                <ActionIcon
                  variant="tertiary"
                  aria-label={t("cancel", "Cancel")}
                  onClick={emptyServer ? onClose : cancelCreation}
                >
                  <Icon name="x" size={18} />
                </ActionIcon>
              </form>
            )}
            {hasFolders && (
              <>
                <div className="folder-setup__folder-navigation">
                  <ActionIcon
                    aria-label={t("filesPage.back", "Back")}
                    variant="tertiary"
                    disabled={!hasHistory || picking}
                    onClick={goBack}
                  >
                    <Icon name="arrow-left" size={18} />
                  </ActionIcon>
                  <nav
                    className="files-page-breadcrumbs folder-setup__breadcrumbs"
                    aria-label={t("processingFolders.setup.location")}
                  >
                    {[
                      { id: null, name: t("filesPage.tree", "Folders") },
                      ...trail,
                    ].map((item, index) => (
                      <span
                        key={item.id ?? "root"}
                        className="folder-setup__inline"
                      >
                        {index > 0 && <Icon name="chevron-right" size={14} />}
                        <button
                          type="button"
                          className="files-page-breadcrumb"
                          aria-current={
                            item.id === currentId ? "location" : undefined
                          }
                          onClick={() =>
                            navigate(
                              item.id ? (byId.get(item.id) ?? null) : null,
                            )
                          }
                        >
                          {item.name}
                        </button>
                      </span>
                    ))}
                  </nav>
                </div>
                <div className="folder-setup__folder-scroll">
                  <div
                    className="files-page-list folder-setup__folder-list"
                    role="grid"
                    aria-label={t("processingFolders.setup.selectFolder")}
                  >
                    <div className="files-page-list-row is-header" role="row">
                      <span
                        role="columnheader"
                        aria-label={t("processingFolders.setup.selectFolder")}
                      />
                      <span role="columnheader">
                        {t("filesPage.column.name", "Name")}
                      </span>
                      <span role="columnheader">
                        {t("processingFolders.setup.location")}
                      </span>
                      <span role="columnheader" />
                      <span role="columnheader" />
                    </div>
                    {visible.map((folder) => {
                      const draft = added.find(
                        (item) => item.folder.id === folder.id,
                      );
                      const processing = recordFor(folder);
                      const local = folderKind(folder) === "local";
                      const disabledReason = folderDisabledReason(folder);
                      const blocked = Boolean(disabledReason);
                      return (
                        <FolderListRow
                          key={folder.id}
                          folder={folder}
                          showModified={false}
                          title={disabledReason ?? undefined}
                          status={
                            <div className="folder-setup__folder-details">
                              <span>
                                {local
                                  ? t("processingFolders.setup.computer")
                                  : serverLabel}
                              </span>
                              {processing && (
                                <FolderProcessingTag
                                  enabled={processing.enabled}
                                />
                              )}
                            </div>
                          }
                          parentPath={
                            (query || addedLocalIds.has(folder.id)) &&
                            folder.parentFolderId
                              ? processingFolderPath(
                                  byId.get(folder.parentFolderId) ?? folder,
                                  folders,
                                )
                              : undefined
                          }
                          aria-selected={folder.id === selectedId}
                          aria-disabled={blocked || undefined}
                          className={
                            folder.id === selectedId ? "is-selected" : ""
                          }
                          tabIndex={blocked ? -1 : 0}
                          onClick={() => select(folder)}
                          onDoubleClick={() => {
                            if (!blocked) navigate(folder);
                          }}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget || blocked)
                              return;
                            if (event.key === " " || event.key === "Enter") {
                              event.preventDefault();
                              select(folder);
                            }
                          }}
                          leading={
                            <input
                              type="radio"
                              name={selectionName}
                              aria-label={folder.name}
                              checked={folder.id === selectedId}
                              disabled={blocked}
                              tabIndex={-1}
                              onChange={() => select(folder)}
                            />
                          }
                          trailing={
                            draft?.target.kind === "server" ? (
                              <ActionIcon
                                aria-label={t(
                                  "processingFolders.setup.editFolder",
                                  {
                                    name: folder.name,
                                  },
                                )}
                                variant="tertiary"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  editFolder(draft);
                                }}
                              >
                                <Icon name="pencil" size={16} />
                              </ActionIcon>
                            ) : (
                              (!local ||
                                available.some(
                                  (child) => child.parentFolderId === folder.id,
                                )) && (
                                <ActionIcon
                                  aria-label={t(
                                    "processingFolders.setup.openFolder",
                                    {
                                      name: folder.name,
                                    },
                                  )}
                                  variant="tertiary"
                                  size="sm"
                                  disabled={blocked}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(folder);
                                  }}
                                  onDoubleClick={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  <Icon name="chevron-right" size={18} />
                                </ActionIcon>
                              )
                            )
                          }
                        />
                      );
                    })}
                  </div>
                  {visible.length === 0 && (
                    <p className="folder-setup__empty" role="status">
                      {t(
                        query
                          ? "processingFolders.setup.noMatchingFolders"
                          : "processingFolders.setup.noFolders",
                      )}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {error && <Banner tone="danger" description={error} />}
    </div>
  );
}
