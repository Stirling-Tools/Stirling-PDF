/**
 * Colour + icon picker for a folder. Every change applies immediately, so the
 * surface hosting it needs no save step of its own.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";

import { FolderRecord, FOLDER_COLOR_PALETTE } from "@app/types/folder";
import {
  FOLDER_ICONS,
  FolderIconOption,
} from "@app/components/filesPage/folderIcons";
import "@app/components/filesPage/FolderAppearancePicker.css";

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
      className="folder-appearance"
      data-disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
    >
      <Section label={t("filesPage.appearance.colour", "Colour")}>
        <div className="folder-appearance-swatches">
          {FOLDER_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="folder-appearance-swatch"
              disabled={disabled}
              aria-pressed={folder.color === c}
              aria-label={t(
                "filesPage.appearance.useColour",
                "Use colour {{c}}",
                { c },
              )}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ color: c });
              }}
            >
              {/* The colour is data, not theme, so it stays an inline value. */}
              <span
                className="folder-appearance-dot"
                style={{ background: c }}
              />
            </button>
          ))}
        </div>
      </Section>

      <Section label={t("filesPage.appearance.icon", "Icon")}>
        <div className="folder-appearance-icons">
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
    <div className="folder-appearance-section">
      <span className="folder-appearance-label">{label}</span>
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
      <button
        type="button"
        className="folder-appearance-icon"
        disabled={disabled}
        aria-pressed={selected}
        aria-label={icon.label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {icon.glyph || "—"}
      </button>
    </Tooltip>
  );
}
