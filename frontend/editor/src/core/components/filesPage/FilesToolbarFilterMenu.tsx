import { MultiSelect, Popover, Select, Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import TuneIcon from "@mui/icons-material/Tune";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { FilesPageOriginFilter } from "@app/contexts/FilesPageContext";

interface FilesToolbarFilterMenuProps {
  originFilter: FilesPageOriginFilter;
  onOriginChange: (value: FilesPageOriginFilter) => void;
  availableTypes: string[];
  typeFilter: string[];
  onTypeChange: (value: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

/**
 * Source, type and name filters collapsed behind one icon. Side by side these
 * three need ~480px, so on narrow viewports they were each truncated to
 * unreadable stubs ("All sour"). In the popover they get their full width back,
 * and a dot on the trigger keeps an active filter discoverable while hidden.
 */
export function FilesToolbarFilterMenu({
  originFilter,
  onOriginChange,
  availableTypes,
  typeFilter,
  onTypeChange,
  search,
  onSearchChange,
}: FilesToolbarFilterMenuProps) {
  const { t } = useTranslation();

  const activeCount =
    (originFilter !== "all" ? 1 : 0) +
    (typeFilter.length > 0 ? 1 : 0) +
    (search.trim() !== "" ? 1 : 0);
  const label = t("filesPage.filters.label", "Filters");

  const clearAll = () => {
    onOriginChange("all");
    onTypeChange([]);
    onSearchChange("");
  };

  return (
    <Popover width={260} position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <div>
          <Tooltip
            content={
              activeCount > 0
                ? t(
                    "filesPage.filters.activeCount",
                    "{{count}} filters active",
                    {
                      count: activeCount,
                    },
                  )
                : label
            }
            position="bottom"
          >
            <ActionIcon
              variant={activeCount > 0 ? "primary" : "tertiary"}
              size="sm"
              aria-label={label}
              className="files-page-toolbar-icon-btn"
            >
              <TuneIcon sx={{ fontSize: "1.1rem" }} />
            </ActionIcon>
          </Tooltip>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            size="xs"
            value={search}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            placeholder={t("filesPage.search.placeholder", "Filter files…")}
            leftSection={<SearchIcon sx={{ fontSize: "1rem" }} />}
            rightSection={
              search ? (
                <ActionIcon
                  variant="tertiary"
                  size="sm"
                  onClick={() => onSearchChange("")}
                  aria-label={t("filesPage.search.clear", "Clear filter")}
                >
                  <CloseIcon sx={{ fontSize: "0.9rem" }} />
                </ActionIcon>
              ) : null
            }
            aria-label={t("filesPage.search.label", "Filter files by name")}
          />
          <Select
            size="xs"
            value={originFilter}
            onChange={(value) =>
              value && onOriginChange(value as FilesPageOriginFilter)
            }
            data={[
              { value: "all", label: t("filesPage.origin.all", "All sources") },
              { value: "local", label: t("filesPage.origin.local", "Local") },
              { value: "cloud", label: t("filesPage.origin.cloud", "Cloud") },
              {
                value: "shared-with-me",
                label: t("filesPage.origin.shared", "Shared"),
              },
            ]}
            label={t("filesPage.originFilter", "Filter by source")}
            comboboxProps={{ withinPortal: false }}
          />
          {availableTypes.length > 1 && (
            <MultiSelect
              size="xs"
              value={typeFilter}
              onChange={onTypeChange}
              data={availableTypes.map((ext) => ({ value: ext, label: ext }))}
              placeholder={
                typeFilter.length === 0
                  ? t("filesPage.typeFilter.allTypes", "All types")
                  : undefined
              }
              clearable
              hidePickedOptions
              searchable={false}
              label={t("filesPage.typeFilter.label", "Filter by type")}
              comboboxProps={{ withinPortal: false }}
            />
          )}
          {activeCount > 0 && (
            <Button variant="tertiary" size="sm" onClick={clearAll}>
              {t("filesPage.filters.clearAll", "Clear filters")}
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export default FilesToolbarFilterMenu;
