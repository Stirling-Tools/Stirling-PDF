import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Banner,
  Button,
  FormField,
  Input,
  SegmentedControl,
} from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { FolderListRow } from "@app/components/filesPage/FolderListRow";
import {
  folderKind,
  type FolderId,
  type FolderRecord,
} from "@app/types/folder";
import type { PickedDirectory } from "@app/services/directoryPicker";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import {
  processingFolderPath,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";
import "@app/components/filesPage/FilesPage.css";

export interface ProcessingFolderPickerProps {
  folders: FolderRecord[];
  canPickDirectory: boolean;
  serverDisabledReason: string | null;
  serverLabel: string;
  target: ProcessingFolderTarget | null;
  onChange: (target: ProcessingFolderTarget | null) => void;
  pickDirectory: () => Promise<PickedDirectory | null>;
}

/** Chooses a destination without creating or mounting anything on cancellation. */
export function ProcessingFolderPicker({
  folders,
  canPickDirectory,
  serverDisabledReason,
  serverLabel,
  target,
  onChange,
  pickDirectory,
}: ProcessingFolderPickerProps) {
  const { t } = useTranslation();
  const selectionName = useId();
  const targetLocation =
    target?.kind === "existing" ? folderKind(target.folder) : target?.kind;
  const [location, setLocation] = useState<"server" | "local">(
    targetLocation === "local" ||
      (!target && canPickDirectory && serverDisabledReason)
      ? "local"
      : "server",
  );
  const [creating, setCreating] = useState(
    target?.kind === "server" ||
      (target?.kind === "local" && target.name !== null),
  );
  const [name, setName] = useState(
    target?.kind === "server" || target?.kind === "local"
      ? (target.name ?? "")
      : "",
  );
  const [currentId, setCurrentId] = useState<FolderId | null>(
    target?.kind === "existing"
      ? target.folder.parentFolderId
      : target?.kind === "server"
        ? target.parentId
        : null,
  );
  const [parentId, setParentId] = useState<FolderId | null>(
    target?.kind === "server" ? target.parentId : null,
  );
  const [directory, setDirectory] = useState<PickedDirectory | null>(
    target?.kind === "local" ? target.directory : null,
  );
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = folders.filter((folder) => folderKind(folder) === location);
  const byId = new Map(available.map((folder) => [folder.id, folder]));
  const blocked = location === "server" && Boolean(serverDisabledReason);
  const rootLabel =
    location === "server" ? serverLabel : t("processingFolders.setup.computer");
  const query = search.trim().toLocaleLowerCase();
  const visible = available
    .filter((folder) =>
      query
        ? folder.name.toLocaleLowerCase().includes(query)
        : currentId === null
          ? !folder.parentFolderId || !byId.has(folder.parentFolderId)
          : folder.parentFolderId === currentId,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const trail: FolderRecord[] = [];
  const seen = new Set<FolderId>();
  let ancestor = currentId ? byId.get(currentId) : undefined;
  while (ancestor && !seen.has(ancestor.id)) {
    trail.unshift(ancestor);
    seen.add(ancestor.id);
    ancestor = ancestor.parentFolderId
      ? byId.get(ancestor.parentFolderId)
      : undefined;
  }
  const selectedId = creating
    ? location === "server"
      ? parentId
      : available.find((folder) => folder.directory === directory?.path)?.id
    : target?.kind === "existing"
      ? target.folder.id
      : null;
  const parent = parentId ? byId.get(parentId) : undefined;
  const selectedPath =
    target?.kind === "existing"
      ? processingFolderPath(target.folder, folders)
      : target?.kind === "local"
        ? target.directory.path
        : creating
          ? parent
            ? processingFolderPath(parent, folders)
            : rootLabel
          : null;

  function updateDraft(
    nextName = name,
    nextParent = parentId,
    nextDirectory = directory,
  ) {
    onChange(
      location === "server"
        ? { kind: "server", name: nextName, parentId: nextParent }
        : nextDirectory
          ? { kind: "local", directory: nextDirectory, name: nextName }
          : null,
    );
  }

  function select(folder: FolderRecord) {
    if (blocked) return;
    if (creating) {
      setParentId(folder.id);
      const picked = folder.directory
        ? { path: folder.directory, name: folder.name }
        : null;
      setDirectory(picked);
      updateDraft(name, folder.id, picked);
    } else {
      setDirectory(null);
      onChange({ kind: "existing", folder });
    }
  }

  function navigate(folder: FolderRecord | null) {
    setCurrentId(folder?.id ?? null);
    setSearch("");
    if (folder) select(folder);
    else {
      setParentId(null);
      setDirectory(null);
      if (creating) updateDraft(name, null, null);
      else onChange(null);
    }
  }

  function toggleCreation() {
    if (creating) {
      setCreating(false);
      onChange(
        location === "local" && directory
          ? { kind: "local", directory, name: null }
          : parent
            ? { kind: "existing", folder: parent }
            : null,
      );
      return;
    }
    const selected =
      target?.kind === "existing"
        ? target.folder
        : currentId
          ? byId.get(currentId)
          : undefined;
    const nextParent = selected?.id ?? null;
    const nextDirectory = selected?.directory
      ? { path: selected.directory, name: selected.name }
      : directory;
    setCreating(true);
    setParentId(nextParent);
    setDirectory(nextDirectory);
    updateDraft(name, nextParent, nextDirectory);
  }

  async function browse() {
    setPicking(true);
    setError(null);
    try {
      const picked = await pickDirectory();
      if (picked) {
        setDirectory(picked);
        onChange({
          kind: "local",
          directory: picked,
          name: creating ? name : null,
        });
      }
    } catch (cause) {
      setError(extractErrorMessage(cause));
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="folder-setup__picker">
      {canPickDirectory && (
        <SegmentedControl
          ariaLabel={t("processingFolders.setup.location")}
          value={location}
          onChange={(value) => {
            setLocation(value);
            setCurrentId(null);
            setParentId(null);
            setDirectory(null);
            setSearch("");
            setCreating(false);
            setError(null);
            onChange(null);
          }}
          options={[
            {
              value: "server",
              label: (
                <span className="folder-setup__inline">
                  <Icon name="cloud" size={16} />
                  {serverLabel}
                </span>
              ),
            },
            {
              value: "local",
              label: (
                <span className="folder-setup__inline">
                  <Icon name="monitor" size={16} />
                  {t("processingFolders.setup.computer")}
                </span>
              ),
            },
          ]}
        />
      )}
      {blocked && <Banner tone="warning" description={serverDisabledReason} />}
      <div className="folder-setup__folder-toolbar">
        <Input
          aria-label={t("processingFolders.setup.searchFolders")}
          placeholder={t("processingFolders.setup.searchFolders")}
          leadingIcon={<Icon name="search" size={18} />}
          value={search}
          disabled={blocked}
          onChange={(event) => setSearch(event.target.value)}
        />
        {location === "local" && (
          <Button
            variant="secondary"
            onClick={() => void browse()}
            loading={picking}
            leftSection={<Icon name="folder-open" size={18} />}
          >
            {t(
              creating
                ? "processingFolders.setup.chooseParent"
                : "processingFolders.setup.browseComputer",
            )}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={blocked}
          aria-pressed={creating}
          onClick={toggleCreation}
          leftSection={<Icon name="plus" size={18} />}
        >
          {t("processingFolders.setup.newFolder")}
        </Button>
      </div>
      <nav
        className="files-page-breadcrumbs folder-setup__breadcrumbs"
        aria-label={t("processingFolders.setup.location")}
      >
        {[{ id: null, name: rootLabel }, ...trail].map((item, index) => (
          <span key={item.id ?? "root"} className="folder-setup__inline">
            {index > 0 && <Icon name="chevron-right" size={14} />}
            <button
              type="button"
              className="files-page-breadcrumb"
              disabled={blocked}
              aria-current={item.id === currentId ? "location" : undefined}
              onClick={() =>
                navigate(item.id ? (byId.get(item.id) ?? null) : null)
              }
            >
              {item.name}
            </button>
          </span>
        ))}
      </nav>
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
              {t("filesPage.column.type", "Type")}
            </span>
            <span role="columnheader" />
            <span role="columnheader">
              {t("filesPage.column.modified", "Modified")}
            </span>
            <span role="columnheader" />
          </div>
          {visible.map((folder) => (
            <FolderListRow
              key={folder.id}
              folder={folder}
              parentPath={
                query && folder.parentFolderId
                  ? processingFolderPath(
                      byId.get(folder.parentFolderId) ?? folder,
                      folders,
                    )
                  : undefined
              }
              aria-selected={folder.id === selectedId}
              aria-disabled={blocked || undefined}
              className={folder.id === selectedId ? "is-selected" : ""}
              tabIndex={blocked ? -1 : 0}
              onClick={() => select(folder)}
              onDoubleClick={() => {
                if (!blocked) navigate(folder);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || blocked) return;
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
                (location === "server" ||
                  available.some(
                    (child) => child.parentFolderId === folder.id,
                  )) && (
                  <ActionIcon
                    aria-label={t("processingFolders.setup.openFolder", {
                      name: folder.name,
                    })}
                    variant="tertiary"
                    size="sm"
                    disabled={blocked}
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(folder);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <Icon name="chevron-right" size={18} />
                  </ActionIcon>
                )
              }
            />
          ))}
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
      {creating && (
        <div className="folder-setup__new-folder">
          <FormField
            label={t("processingFolders.setup.folderName")}
            required
            error={
              name && (/[\\/]/.test(name) || [".", ".."].includes(name.trim()))
                ? t("processingFolders.setup.invalidName")
                : undefined
            }
          >
            <Input
              autoFocus
              value={name}
              disabled={blocked}
              placeholder={t("processingFolders.setup.namePlaceholder")}
              onChange={(event) => {
                setName(event.target.value);
                updateDraft(event.target.value);
              }}
            />
          </FormField>
          <Button variant="tertiary" onClick={toggleCreation}>
            {t("cancel", "Cancel")}
          </Button>
        </div>
      )}
      {selectedPath && (
        <p className="folder-setup__path">
          {creating && (
            <strong>{t("processingFolders.setup.createIn")}: </strong>
          )}
          {selectedPath}
        </p>
      )}
      {error && <Banner tone="danger" description={error} />}
    </div>
  );
}
