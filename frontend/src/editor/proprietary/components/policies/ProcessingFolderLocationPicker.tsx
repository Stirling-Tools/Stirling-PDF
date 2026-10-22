import { useState } from "react";
import { Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import {
  folderKind,
  type FolderId,
  type FolderRecord,
} from "@app/types/folder";
import { processingFolderPath } from "@app/components/policies/processingFolderSetup";

interface ProcessingFolderLocationPickerProps {
  folders: FolderRecord[];
  parentId: FolderId | null;
  serverLabel: string;
  onChange: (parentId: FolderId | null) => void;
}

/** Offers a parent change only when another valid server location exists. */
export function ProcessingFolderLocationPicker({
  folders,
  parentId,
  serverLabel,
  onChange,
}: ProcessingFolderLocationPickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  if (
    parentId === null &&
    !folders.some((folder) => folderKind(folder) === "server")
  )
    return null;
  const query = search.trim().toLocaleLowerCase();
  const choices = folders
    .filter((folder) => folderKind(folder) !== "virtual")
    .map((folder) => ({ folder, path: processingFolderPath(folder, folders) }))
    .filter(({ path }) => path.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.path.localeCompare(b.path));

  function select(id: FolderId | null) {
    onChange(id);
    setOpened(false);
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={360}
      withinPortal={false}
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Button
          variant="tertiary"
          size="sm"
          aria-label={t("processingFolders.setup.changeLocation")}
          onClick={() => {
            setSearch("");
            setOpened(!opened);
          }}
        >
          {t("processingFolders.setup.change")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown
        className="folder-setup__location-picker"
        role="dialog"
        aria-label={t("processingFolders.setup.changeLocation")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpened(false);
          }
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
          }
        }}
      >
        <Input
          data-autofocus
          aria-label={t("processingFolders.setup.searchLocations")}
          placeholder={t("processingFolders.setup.searchLocations")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          leadingIcon={<Icon name="search" size={16} />}
        />
        <div className="folder-setup__location-options">
          <button
            type="button"
            aria-pressed={parentId === null}
            onClick={() => select(null)}
          >
            <Icon name="cloud" size={16} />
            <span>{serverLabel}</span>
          </button>
          {choices.map(({ folder, path }) => {
            const blocked = folderKind(folder) !== "server";
            return (
              <button
                key={folder.id}
                type="button"
                disabled={blocked}
                title={blocked ? t("filesPage.moveAcrossKindsBlocked") : path}
                aria-pressed={parentId === folder.id}
                onClick={() => select(folder.id)}
              >
                <Icon name={blocked ? "monitor" : "folder"} size={16} />
                <span>{path}</span>
              </button>
            );
          })}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
