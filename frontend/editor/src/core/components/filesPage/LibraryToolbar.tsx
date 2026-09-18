import { MultiSelect, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { FilesToolbarFilterMenu } from "@app/components/filesPage/FilesToolbarFilterMenu";
import { FilesToolbarSortMenu } from "@app/components/filesPage/FilesToolbarSortMenu";
import { FilenameSearch } from "@app/components/filesPage/FilenameSearch";
import {
  FILES_PAGE_VIEW_MODES,
  type FilesPageOriginFilter,
  type FilesPageSortMode,
  type FilesPageViewMode,
} from "@app/contexts/FilesPageContext";
import type { LibraryFilters } from "@app/components/filesPage/useLibraryFiles";

type Props = Pick<
  LibraryFilters,
  "search" | "sortMode" | "originFilter" | "typeFilter"
> & {
  isMobile: boolean;
  availableTypes: string[];
  setSearch: (value: string) => void;
  setSortMode: (value: FilesPageSortMode) => void;
  setOriginFilter: (value: FilesPageOriginFilter) => void;
  setTypeFilter: (value: string[]) => void;
  viewMode: FilesPageViewMode;
  setViewMode: (value: FilesPageViewMode) => void;
  dropdownZIndex?: number;
};

/** Controlled toolbar shared by the library page and its file picker. */
export function LibraryToolbar({
  isMobile,
  availableTypes,
  originFilter,
  setOriginFilter,
  typeFilter,
  setTypeFilter,
  search,
  setSearch,
  sortMode,
  setSortMode,
  viewMode,
  setViewMode,
  dropdownZIndex,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      {isMobile ? (
        <FilesToolbarFilterMenu
          zIndex={dropdownZIndex}
          originFilter={originFilter}
          onOriginChange={setOriginFilter}
          availableTypes={availableTypes}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
        />
      ) : (
        <>
          <Select
            comboboxProps={{ zIndex: dropdownZIndex }}
            size="xs"
            value={originFilter}
            onChange={(value) =>
              value && setOriginFilter(value as FilesPageOriginFilter)
            }
            data={[
              {
                value: "all",
                label: t("filesPage.origin.all", "All sources"),
              },
              {
                value: "local",
                label: t("filesPage.origin.local", "Local"),
              },
              {
                value: "cloud",
                label: t("filesPage.origin.cloud", "Cloud"),
              },
              {
                value: "shared-with-me",
                label: t("filesPage.origin.shared", "Shared"),
              },
            ]}
            style={{ width: 140 }}
            aria-label={t("filesPage.originFilter", "Filter by source")}
          />
          {(availableTypes.length > 1 || typeFilter.length > 0) && (
            <MultiSelect
              comboboxProps={{ zIndex: dropdownZIndex }}
              size="xs"
              value={typeFilter}
              onChange={setTypeFilter}
              data={availableTypes.map((ext) => ({
                value: ext,
                label: ext,
              }))}
              placeholder={
                typeFilter.length === 0
                  ? t("filesPage.typeFilter.allTypes", "All types")
                  : undefined
              }
              clearable
              hidePickedOptions
              searchable={false}
              style={{ width: 160 }}
              aria-label={t("filesPage.typeFilter.label", "Filter by type")}
            />
          )}
        </>
      )}
      <FilenameSearch
        value={search}
        onChange={setSearch}
        zIndex={dropdownZIndex}
      />
      <FilesToolbarSortMenu
        value={sortMode}
        onChange={setSortMode}
        zIndex={dropdownZIndex}
      />
      <span className="files-page-toolbar-divider" aria-hidden="true" />
      <SegmentedControl
        size="sm"
        value={viewMode}
        onChange={(v) => {
          if (!(FILES_PAGE_VIEW_MODES as readonly string[]).includes(v)) return;
          setViewMode(v as FilesPageViewMode);
        }}
        aria-label={t("filesPage.viewMode.label", "View mode")}
        options={[
          {
            value: "grid",
            label: (
              <span
                className="files-page-view-toggle-icon"
                title={t("filesPage.viewMode.grid", "Grid view")}
              >
                <Icon name="layout-grid" size={20} />
                <span className="files-page-sr-only">
                  {t("filesPage.viewMode.grid", "Grid view")}
                </span>
              </span>
            ),
          },
          {
            value: "list",
            label: (
              <span
                className="files-page-view-toggle-icon"
                title={t("filesPage.viewMode.list", "List view")}
              >
                <Icon name="list" size={20} />
                <span className="files-page-sr-only">
                  {t("filesPage.viewMode.list", "List view")}
                </span>
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
