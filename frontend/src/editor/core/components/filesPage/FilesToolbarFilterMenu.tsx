import { MultiSelect, Popover, Select, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useLocalProcessingOnly } from "@editor/hooks/useLocalProcessingOnly";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Button } from "@editor/ui/Button";
import { Tooltip } from "@editor/components/shared/Tooltip";
import type { FilesPageOriginFilter } from "@editor/contexts/FilesPageContext";

interface FilesToolbarFilterMenuProps {
  originFilter: FilesPageOriginFilter;
  onOriginChange: (value: FilesPageOriginFilter) => void;
  availableTypes: string[];
  typeFilter: string[];
  onTypeChange: (value: string[]) => void;
  zIndex?: number;
}

export function FilesToolbarFilterMenu({
  originFilter,
  onOriginChange,
  availableTypes,
  typeFilter,
  onTypeChange,
  zIndex,
}: FilesToolbarFilterMenuProps) {
  const { t } = useTranslation();
  const localOnly = useLocalProcessingOnly();

  const activeCount =
    (originFilter !== "all" ? 1 : 0) + (typeFilter.length > 0 ? 1 : 0);
  const label = t("filesPage.filters.label", "Filters");

  const clearAll = () => {
    onOriginChange("all");
    onTypeChange([]);
  };

  return (
    <Popover
      width={260}
      position="bottom-end"
      shadow="md"
      withinPortal
      zIndex={zIndex}
    >
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
              <Icon name="sliders-horizontal" size={"1.1rem"} />
            </ActionIcon>
          </Tooltip>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
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
            ].filter(
              (source) =>
                !localOnly ||
                source.value === "all" ||
                source.value === "local",
            )}
            label={t("filesPage.originFilter", "Filter by source")}
            comboboxProps={{ withinPortal: false }}
          />
          {(availableTypes.length > 1 || typeFilter.length > 0) && (
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
