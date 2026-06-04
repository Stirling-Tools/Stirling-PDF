import { ActionIcon, Tooltip } from "@mantine/core";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";

export function TextSelectionMenu({
  selected,
  menuWrapperProps,
  placement,
}: SelectionSelectionMenuProps) {
  const { t } = useTranslation();
  const { provides: selection } = useSelectionCapability();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      menuWrapperProps?.ref?.(node);
    },
    [menuWrapperProps],
  );

  const showAbove = placement?.suggestTop ?? true;

  useEffect(() => {
    if (!selected || !wrapperRef.current) {
      setPosition(null);
      return;
    }
    const update = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const r = wrapper.getBoundingClientRect();
      setPosition({
        top: showAbove ? r.top - 8 : r.bottom + 8,
        left: r.left + r.width / 2,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [selected, showAbove]);

  const handleCopy = useCallback(() => {
    selection?.copyToClipboard();
  }, [selection]);

  const portalContent =
    position &&
    createPortal(
      <div
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          transform: `translate(-50%, ${showAbove ? "-100%" : "0"})`,
          zIndex: 10000,
          pointerEvents: "auto",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Tooltip label={t("viewer.copyText", "Copy")} withArrow>
          <ActionIcon
            variant="filled"
            size="md"
            onClick={handleCopy}
            aria-label={t("viewer.copyText", "Copy")}
            style={{
              backgroundColor: "var(--mantine-color-body)",
              border: "1px solid var(--mantine-color-default-border)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <ContentCopyIcon style={{ fontSize: 18 }} />
          </ActionIcon>
        </Tooltip>
      </div>,
      document.body,
    );

  return (
    <>
      <div ref={setRef} style={menuWrapperProps?.style} />
      {portalContent}
    </>
  );
}
