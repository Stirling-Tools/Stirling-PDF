import React, { useMemo, useState, useCallback } from "react";
import { Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { NavKey, VALID_NAV_KEYS } from "@app/components/shared/config/types";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
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

const SETTINGS_SEARCH_TRANSLATION_PREFIXES: Partial<Record<string, string[]>> =
  {
    general: ["settings.general"],
    hotkeys: ["settings.hotkeys"],
    account: ["account"],
    people: ["settings.workspace"],
    teams: ["settings.workspace", "settings.team"],
    "api-keys": ["settings.developer"],
    connectionMode: ["settings.connection"],
    planBilling: ["settings.planBilling"],
    adminGeneral: ["admin.settings.general"],
    adminFeatures: ["admin.settings.features"],
    adminEndpoints: ["admin.settings.endpoints"],
    adminDatabase: ["admin.settings.database"],
    adminAdvanced: ["admin.settings.advanced"],
    adminSecurity: ["admin.settings.security"],
    adminConnections: [
      "admin.settings.connections",
      "admin.settings.mail",
      "admin.settings.security",
      "admin.settings.telegram",
      "admin.settings.premium",
      "admin.settings.general",
      "settings.securityAuth",
      "settings.connection",
    ],
    adminPlan: [
      "settings.planBilling",
      "admin.settings.premium",
      "settings.licensingAnalytics",
    ],
    adminAudit: ["settings.licensingAnalytics"],
    adminUsage: ["settings.licensingAnalytics"],
    adminLegal: ["admin.settings.legal"],
    adminPrivacy: ["admin.settings.privacy"],
  };

const getTranslationPrefixesForNavKey = (key: string): string[] => {
  const explicitPrefixes = SETTINGS_SEARCH_TRANSLATION_PREFIXES[key] ?? [];

  const inferredPrefixes: string[] = [];

  if (key.startsWith("admin")) {
    const adminSuffix = key.replace(/^admin/, "");
    const normalizedAdminSuffix =
      adminSuffix.charAt(0).toLowerCase() + adminSuffix.slice(1);
    inferredPrefixes.push(`admin.settings.${normalizedAdminSuffix}`);
  } else {
    inferredPrefixes.push(`settings.${key}`);
  }

  return Array.from(new Set([...explicitPrefixes, ...inferredPrefixes]));
};

const flattenTranslationStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenTranslationStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      flattenTranslationStrings,
    );
  }

  return [];
};

const buildMatchSnippet = (text: string, query: string): string => {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return text;
  }

  const maxLength = 84;
  const contextPadding = 28;
  const start = Math.max(0, matchIndex - contextPadding);
  const end = Math.min(text.length, matchIndex + query.length + contextPadding);
  const snippet = text.slice(start, end);

  if (snippet.length <= maxLength) {
    return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
  }

  return `${start > 0 ? "…" : ""}${snippet.slice(0, maxLength)}${end < text.length ? "…" : ""}`;
};

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
          const translationPrefixes = getTranslationPrefixesForNavKey(item.key);
          const translationContent = translationPrefixes.flatMap((prefix) =>
            flattenTranslationStrings(
              t(prefix, { returnObjects: true, defaultValue: {} } as any),
            ),
          );

          const searchableContent = Array.from(
            new Set([
              item.label,
              section.title,
              `/settings/${item.key}`,
              ...translationContent,
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
