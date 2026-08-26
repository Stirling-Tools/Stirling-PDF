import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CheckIcon from "@mui/icons-material/Check";
import SwapVertIcon from "@mui/icons-material/SwapVert";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { FilesPageSortMode } from "@app/contexts/FilesPageContext";

interface FilesToolbarSortMenuProps {
  value: FilesPageSortMode;
  onChange: (mode: FilesPageSortMode) => void;
}

/**
 * Sort control collapsed to a single icon. The desktop Select needs 160px and
 * still truncated its longest label ("Recent first" → "Recent fi") once the
 * toolbar got tight, so on narrow viewports the options move into a menu where
 * they have room to read in full.
 */
export function FilesToolbarSortMenu({
  value,
  onChange,
}: FilesToolbarSortMenuProps) {
  const { t } = useTranslation();

  const options: { value: FilesPageSortMode; label: string }[] = [
    {
      value: "modified-desc",
      label: t("filesPage.sort.modifiedDesc", "Recent first"),
    },
    {
      value: "modified-asc",
      label: t("filesPage.sort.modifiedAsc", "Oldest first"),
    },
    { value: "name-asc", label: t("filesPage.sort.nameAsc", "Name A→Z") },
    { value: "name-desc", label: t("filesPage.sort.nameDesc", "Name Z→A") },
    {
      value: "size-desc",
      label: t("filesPage.sort.sizeDesc", "Largest first"),
    },
    { value: "size-asc", label: t("filesPage.sort.sizeAsc", "Smallest first") },
  ];

  const label = t("filesPage.sort.label", "Sort files");
  const current = options.find((o) => o.value === value)?.label ?? "";

  return (
    <Menu shadow="md" width={200} position="bottom-end" withinPortal>
      <Menu.Target>
        <div>
          <Tooltip content={`${label} · ${current}`} position="bottom">
            <ActionIcon
              variant="tertiary"
              size="sm"
              aria-label={`${label}: ${current}`}
              className="files-page-toolbar-icon-btn"
            >
              <SwapVertIcon sx={{ fontSize: "1.1rem" }} />
            </ActionIcon>
          </Tooltip>
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{label}</Menu.Label>
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            onClick={() => onChange(option.value)}
            leftSection={
              option.value === value ? (
                <CheckIcon sx={{ fontSize: "1rem" }} />
              ) : (
                <span style={{ display: "inline-block", width: "1rem" }} />
              )
            }
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export default FilesToolbarSortMenu;
