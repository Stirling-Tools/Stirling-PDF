import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import "@app/components/viewer/TextSelectionMenu.css";

export function TextSelectionMenu({
  selected,
  menuWrapperProps,
  placement,
}: SelectionSelectionMenuProps) {
  const { t } = useTranslation();
  const { provides: selection } = useSelectionCapability();

  const showAbove = placement?.suggestTop ?? true;

  const handleCopy = useCallback(() => {
    selection?.copyToClipboard();
    selection?.clear();
  }, [selection]);

  if (!selected) return null;

  return (
    <div
      ref={menuWrapperProps?.ref}
      style={menuWrapperProps?.style}
      className="text-selection-anchor"
    >
      <div
        className="text-selection-popup"
        data-above={showAbove || undefined}
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          className="text-selection-popup-btn"
          onClick={handleCopy}
          aria-label={t("viewer.copyText", "Copy")}
          title={t("viewer.copyText", "Copy")}
        >
          <ContentCopyIcon />
        </button>
      </div>
    </div>
  );
}
