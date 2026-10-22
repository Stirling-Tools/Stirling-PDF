import React from "react";
import { Group, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";

interface NonPdfSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  totalMatches: number;
  activeMatch: number;
  onNext: () => void;
  onPrevious: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/** In-file search for the virtualized non-PDF viewers, where browser find cannot
 * reach rows that are not mounted. Ctrl/Cmd+F focuses this input instead. */
export function NonPdfSearchBar({
  query,
  onQueryChange,
  totalMatches,
  activeMatch,
  onNext,
  onPrevious,
  inputRef,
}: NonPdfSearchBarProps) {
  const { t } = useTranslation();
  const hasQuery = query.trim().length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === "Escape") {
      onQueryChange("");
      event.currentTarget.blur();
    }
  };

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <TextInput
        ref={inputRef}
        data-testid="nonpdf-search-input"
        size="xs"
        w={200}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("viewer.nonPdf.findPlaceholder", "Find in file")}
        aria-label={t("viewer.nonPdf.findPlaceholder", "Find in file")}
        leftSection={<Icon name="search" size="0.85rem" />}
      />
      {hasQuery && (
        <Group gap={2} wrap="nowrap" align="center">
          <Text
            size="xs"
            c="dimmed"
            aria-live="polite"
            data-testid="nonpdf-search-count"
            data-total={totalMatches}
            data-active={activeMatch}
          >
            {totalMatches > 0
              ? t("viewer.nonPdf.matchCount", {
                  current: activeMatch + 1,
                  total: totalMatches,
                  defaultValue: "{{current}} of {{total}}",
                })
              : t("viewer.nonPdf.noMatches", "No matches")}
          </Text>
          <ActionIcon
            size="sm"
            variant="tertiary"
            aria-label={t("viewer.nonPdf.previousMatch", "Previous match")}
            disabled={totalMatches === 0}
            onClick={onPrevious}
          >
            <Icon name="chevron-up" size="1rem" />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="tertiary"
            aria-label={t("viewer.nonPdf.nextMatch", "Next match")}
            disabled={totalMatches === 0}
            onClick={onNext}
          >
            <Icon name="chevron-down" size="1rem" />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
}
