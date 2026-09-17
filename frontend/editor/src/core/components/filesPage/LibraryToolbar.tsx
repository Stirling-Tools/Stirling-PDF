import { MultiSelect, Select, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { FilesToolbarFilterMenu } from "@app/components/filesPage/FilesToolbarFilterMenu";
import { FilesToolbarSortMenu } from "@app/components/filesPage/FilesToolbarSortMenu";
import {
  FILES_PAGE_VIEW_MODES,
  type FilesPageOriginFilter,
  type FilesPageSortMode,
  type FilesPageViewMode,
} from "@app/contexts/FilesPageContext";
import type { LibraryFilters } from "@app/components/filesPage/useLibraryFiles";

type Props = Pick<
  LibraryFilters,
  "search" | "sortMode" | "originFilter" | "typeFilter" | "setTypeFilter"
> & {
  isMobile: boolean;
  availableTypes: string[];
  setSearch: (value: string) => void;
  setSortMode: (value: FilesPageSortMode) => void;
  setOriginFilter: (value: FilesPageOriginFilter) => void;
  viewMode: FilesPageViewMode;
  setViewMode: (value: FilesPageViewMode) => void;
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
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      {" "}
      {isMobile ? (
        /* Side by side these need ~480px and were truncating to
                   stubs like "All sour"; collapsed they read in full. */
        <>
          <FilesToolbarFilterMenu
            originFilter={originFilter}
            onOriginChange={setOriginFilter}
            availableTypes={availableTypes}
            typeFilter={typeFilter}
            onTypeChange={setTypeFilter}
            search={search}
            onSearchChange={setSearch}
          />
          <FilesToolbarSortMenu value={sortMode} onChange={setSortMode} />
        </>
      ) : (
        <>
          <Select
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
          {availableTypes.length > 1 && (
            <MultiSelect
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
          <TextInput
            size="xs"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder={t("filesPage.search.placeholder", "Filter files…")}
            leftSection={<Icon name="search" size={"1rem"} />}
            rightSection={
              search ? (
                <ActionIcon
                  variant="tertiary"
                  size="sm"
                  onClick={() => setSearch("")}
                  aria-label={t("filesPage.search.clear", "Clear filter")}
                >
                  <Icon name="x" size={"0.9rem"} />
                </ActionIcon>
              ) : null
            }
            aria-label={t("filesPage.search.label", "Filter files by name")}
            style={{ width: 180 }}
          />
          <Select
            size="xs"
            value={sortMode}
            onChange={(value) =>
              value && setSortMode(value as FilesPageSortMode)
            }
            data={[
              {
                value: "modified-desc",
                label: t("filesPage.sort.modifiedDesc", "Recent first"),
              },
              {
                value: "modified-asc",
                label: t("filesPage.sort.modifiedAsc", "Oldest first"),
              },
              {
                value: "name-asc",
                label: t("filesPage.sort.nameAsc", "Name A→Z"),
              },
              {
                value: "name-desc",
                label: t("filesPage.sort.nameDesc", "Name Z→A"),
              },
              {
                value: "size-desc",
                label: t("filesPage.sort.sizeDesc", "Largest first"),
              },
              {
                value: "size-asc",
                label: t("filesPage.sort.sizeAsc", "Smallest first"),
              },
            ]}
            style={{ width: 160 }}
          />
        </>
      )}
      <span className="files-page-toolbar-divider" aria-hidden="true" />
      <SegmentedControl
        size="sm"
        value={viewMode}
        onChange={(v) => {
          // Mantine only emits values declared in `data[].value`, but
          // narrow defensively so a future third option can't silently
          // bypass the FilesPageViewMode contract. Derived from the
          // `as const` tuple so adding a mode anywhere in the code
          // base automatically widens the guard here.
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
