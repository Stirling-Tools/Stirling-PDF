import React, { useMemo, useState, useCallback } from "react";
import { Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { NavKey, VALID_NAV_KEYS } from "@app/components/shared/config/types";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import {
  buildMatchSnippet,
  getSettingsSectionContent,
} from "@app/data/settingsContentSearch";
import type {
  ConfigNavSection,
  ConfigNavItem,
} from "@app/components/shared/config/configNavSections";

interface SettingsSearchBarProps {
  configNavSections: ConfigNavSection[];
  onNavigate: (key: NavKey) => Promise<void>;
  isMobile: boolean;
}

interface SettingsSearchOption {
  value: NavKey;
  label: string;
  sectionTitle: string;
  destinationPath: string;
  searchableContent: string[];
  matchedContext?: string;
}

export const SettingsSearchBar: React.FC<SettingsSearchBarProps> = ({
  configNavSections,
  onNavigate,
  isMobile,
}) => {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");

  // Build a global index from every accessible settings tab in the modal navigation.
  // This does not render section components, so API calls still happen only when a tab is opened.
  const searchableSections = useMemo<SettingsSearchOption[]>(() => {
    return configNavSections.flatMap((section) =>
      section.items
        .filter((item: ConfigNavItem) => !item.disabled)
        .map((item: ConfigNavItem) => {
          const searchableContent = Array.from(
            new Set([
              item.label,
              section.title,
              `/settings/${item.key}`,
              ...getSettingsSectionContent(item.key, t),
            ]),
          );

          return {
            value: item.key,
            label: item.label,
            sectionTitle: section.title,
            destinationPath: `/settings/${item.key}`,
            searchableContent,
          };
        }),
    );
  }, [configNavSections, t]);

  const filteredSearchableSections = useMemo<SettingsSearchOption[]>(() => {
    const query = searchValue.trim();
    if (!query) {
      return searchableSections;
    }

    const normalizedQuery = query.toLocaleLowerCase();

    return searchableSections.reduce<SettingsSearchOption[]>(
      (accumulator, option) => {
        const matchedEntry = option.searchableContent.find((entry) =>
          entry.toLocaleLowerCase().includes(normalizedQuery),
        );

        if (!matchedEntry) {
          return accumulator;
        }

        accumulator.push({
          ...option,
          matchedContext: buildMatchSnippet(matchedEntry, query),
        });

        return accumulator;
      },
      [],
    );
  }, [searchValue, searchableSections]);

  const handleSearchNavigation = useCallback(
    async (value: string | null) => {
      if (!value) return;
      if (!VALID_NAV_KEYS.includes(value as NavKey)) return;
      await onNavigate(value as NavKey);
      setSearchValue("");
    },
    [onNavigate],
  );

  return (
    <Select
      className="settings-search-select"
      data={filteredSearchableSections}
      value={null}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onChange={handleSearchNavigation}
      placeholder={t("settings.search.placeholder", "Search settings pages...")}
      leftSection={<LocalIcon icon="search-rounded" width={16} height={16} />}
      aria-label={t("navbar.search", "Search")}
      nothingFoundMessage={t("search.noResults", "No results found")}
      searchable
      clearable={false}
      w={isMobile ? 170 : 320}
      filter={({ options }) => options}
      renderOption={({ option }) => {
        const searchOption = option as unknown as SettingsSearchOption;
        return (
          <div className="settings-search-option">
            <Text size="sm" fw={600}>
              {searchOption.label}
            </Text>
            <Text size="xs" c="dimmed">
              {searchOption.sectionTitle} ·{" "}
              {searchOption.matchedContext || searchOption.destinationPath}
            </Text>
          </div>
        );
      }}
      comboboxProps={{
        withinPortal: true,
        zIndex: Z_INDEX_OVER_CONFIG_MODAL,
      }}
    />
  );
};
