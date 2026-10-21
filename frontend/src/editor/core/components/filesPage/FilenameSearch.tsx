import { Popover, TextInput } from "@mantine/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";

/** The host owns the query so it survives switching between list and grid views. */
export function FilenameSearch({
  value,
  onChange,
  zIndex,
}: {
  value: string;
  onChange: (value: string) => void;
  zIndex?: number;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [opened, setOpened] = useState(false);
  const label = t("filesPage.search.label", "Search filenames");
  const active = value.trim().length > 0;
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      closeOnEscape={false}
      width={260}
      position="bottom-end"
      shadow="md"
      withinPortal
      zIndex={zIndex}
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <ActionIcon
          variant={active ? "secondary" : "tertiary"}
          size="sm"
          aria-label={label}
          title={active ? `${label}: ${value}` : label}
          className="files-page-toolbar-icon-btn"
          onClick={() => setOpened((current) => !current)}
        >
          <Icon name="search" size="1.1rem" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // The library also handles Escape to leave the page.
            event.stopPropagation();
            setOpened(false);
          }
        }}
      >
        <TextInput
          ref={inputRef}
          data-autofocus
          size="sm"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={t("filesPage.search.placeholder", "Search filenames…")}
          aria-label={label}
          leftSection={<Icon name="search" size="1rem" />}
          rightSection={
            value ? (
              <ActionIcon
                variant="tertiary"
                size="sm"
                onClick={() => {
                  onChange("");
                  inputRef.current?.focus();
                }}
                aria-label={t("filesPage.search.clear", "Clear search")}
              >
                <Icon name="x" size="0.9rem" />
              </ActionIcon>
            ) : null
          }
        />
      </Popover.Dropdown>
    </Popover>
  );
}
