/**
 * Inline colour + icon picker for a folder. Rendered inside the folder
 * kebab menu (Mantine Menu.Item with a custom body) so the menu can
 * still own close-on-outside-click behaviour.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";

import { FolderRecord, FOLDER_COLOR_PALETTE } from "@app/types/folder";
import {
  FOLDER_ICONS,
  FolderIconOption,
} from "@app/components/filesPage/folderIcons";
import { Button } from "@app/ui/Button";

interface FolderAppearancePickerProps {
  folder: FolderRecord;
  onChange: (next: { color?: string; icon?: string | null }) => void;
  /** When true, all colour + icon buttons are unresponsive (e.g. while offline). */
  disabled?: boolean;
}

export function FolderAppearancePicker({
  folder,
  onChange,
  disabled = false,
}: FolderAppearancePickerProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.5rem 0.75rem",
        minWidth: "16rem",
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? "none" : undefined,
      }}
      aria-disabled={disabled || undefined}
    >
      <Section label={t("filesPage.appearance.colour", "Colour")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: "0.35rem",
          }}
        >
          {FOLDER_COLOR_PALETTE.map((c) => (
            <Button
              key={c}
              variant="secondary"
              disabled={disabled}
              aria-label={t(
                "filesPage.appearance.useColour",
                "Use colour {{c}}",
                { c },
              )}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ color: c });
              }}
              style={{
                width: "1.6rem",
                height: "1.6rem",
                borderRadius: "50%",
                border:
                  folder.color === c
                    ? "2px solid var(--c-text)"
                    : "2px solid transparent",
                background: c,
                cursor: disabled ? "not-allowed" : "pointer",
                padding: 0,
                outlineOffset: "2px",
              }}
            />
          ))}
        </div>
      </Section>

      <Section label={t("filesPage.appearance.icon", "Icon")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "0.25rem",
          }}
        >
          {FOLDER_ICONS.map((icon) => (
            <IconButton
              key={icon.id}
              icon={icon}
              disabled={disabled}
              selected={
                (icon.id === "none" && !folder.icon) || folder.icon === icon.id
              }
              onClick={() =>
                onChange({ icon: icon.id === "none" ? null : icon.id })
              }
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span
        style={{
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--c-text-subtle)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function IconButton({
  icon,
  selected,
  onClick,
  disabled = false,
}: {
  icon: FolderIconOption;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip label={icon.label} withinPortal>
      <Button
        variant="tertiary"
        disabled={disabled}
        aria-label={icon.label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{
          width: "2rem",
          height: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.1rem",
          borderRadius: "0.4rem",
          background: selected ? "var(--c-hover)" : "transparent",
          border: selected
            ? "1px solid var(--c-primary)"
            : "1px solid transparent",
          cursor: disabled ? "not-allowed" : "pointer",
          padding: 0,
          color: "var(--c-text)",
        }}
      >
        {icon.glyph || "-"}
      </Button>
    </Tooltip>
  );
}
