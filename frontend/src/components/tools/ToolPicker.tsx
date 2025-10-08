import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import { Box, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ToolRegistryEntry } from "../../data/toolsTaxonomy";
import "./toolPicker/ToolPicker.css";
import { useToolSections } from "../../hooks/useToolSections";
import NoToolsFound from "./shared/NoToolsFound";
import { renderToolButtons } from "./shared/renderToolButtons";
import { ToolId } from "src/types/toolId";

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  filteredTools: Array<{ item: [ToolId, ToolRegistryEntry]; matchedText?: string }>;
  isSearching?: boolean;
}

const ToolPicker = ({ selectedToolKey, onSelect, filteredTools, isSearching = false }: ToolPickerProps) => {
  const { t } = useTranslation();
  const [quickHeaderHeight, setQuickHeaderHeight] = useState(0);
  const [allHeaderHeight, setAllHeaderHeight] = useState(0);

  const scrollableRef = useRef<HTMLDivElement>(null);
  const quickHeaderRef = useRef<HTMLDivElement>(null);
  const allHeaderRef = useRef<HTMLDivElement>(null);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const allToolsRef = useRef<HTMLDivElement>(null);

  // Keep header heights in sync with any dynamic size changes
  useLayoutEffect(() => {
    const update = () => {
      if (quickHeaderRef.current) {
        setQuickHeaderHeight(quickHeaderRef.current.offsetHeight || 0);
      }
      if (allHeaderRef.current) {
        setAllHeaderHeight(allHeaderRef.current.offsetHeight || 0);
      }
    };

    update();

    // Update on window resize
    window.addEventListener("resize", update);

    // Update on element resize (e.g., font load, badge count change, zoom)
    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const observe = (el: HTMLDivElement | null, cb: () => void) => {
        if (!el) return;
        const ro = new ResizeObserver(() => cb());
        ro.observe(el);
        observers.push(ro);
      };
      observe(quickHeaderRef.current, update);
      observe(allHeaderRef.current, update);
    }

    return () => {
      window.removeEventListener("resize", update);
      observers.forEach(o => o.disconnect());
    };
  }, []);

  const { sections: visibleSections } = useToolSections(filteredTools);

  const quickSection = useMemo(
    () => visibleSections.find(s => s.key === 'quick'),
    [visibleSections]
  );
  const allSection = useMemo(
    () => visibleSections.find(s => s.key === 'all'),
    [visibleSections]
  );

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    const container = scrollableRef.current;
    const target = ref.current;
    if (container && target) {
      const stackedOffset = ref === allToolsRef
        ? (quickHeaderHeight + allHeaderHeight)
        : quickHeaderHeight;
      const top = target.offsetTop - container.offsetTop - (stackedOffset || 0);
      container.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth"
      });
    }
  };

  // Build flat list by subcategory for search mode
  const { searchGroups } = useToolSections(isSearching ? filteredTools : []);

  return (
    <Box
      h="100%"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-toolbar)"
      }}
    >
      <Box
        ref={scrollableRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
          height: "100%",
          marginTop: -2
        }}
        className="tool-picker-scrollable"
      >
        {isSearching ? (
          <Stack p="sm" gap="xs">
            {searchGroups.length === 0 ? (
              <NoToolsFound />
            ) : (
              searchGroups.map(group => renderToolButtons(t, group, selectedToolKey, onSelect))
            )}
          </Stack>
        ) : (
          <>
        {quickSection && (
          <>
            <div
              ref={quickHeaderRef}
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                borderTop: `0.0625rem solid var(--tool-header-border)`,
                borderBottom: `0.0625rem solid var(--tool-header-border)`,
                padding: "0.5rem 1rem",
                fontWeight: 600,
                background: "var(--tool-header-bg)",
                color: "var(--tool-header-text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onClick={() => scrollTo(quickAccessRef)}
            >
              <span style={{ fontSize: "1rem" }}>{t("toolPicker.quickAccess", "QUICK ACCESS")}</span>
              <span
                style={{
                  background: "var(--tool-header-badge-bg)",
                  color: "var(--tool-header-badge-text)",
                  borderRadius: ".5rem",
                  padding: "0.125rem 0.5rem",
                  fontSize: ".75rem",
                  fontWeight: 700
                }}
              >
                {quickSection?.subcategories.reduce((acc, sc) => acc + sc.tools.length, 0)}
              </span>
            </div>

            <Box ref={quickAccessRef} w="100%" my="sm">
              <Stack p="sm" gap="xs">
                {quickSection?.subcategories.map(sc =>
                  renderToolButtons(t, sc, selectedToolKey, onSelect, false)
                )}
              </Stack>
            </Box>
          </>
        )}

        {allSection && (
          <>
            <div
              ref={allHeaderRef}
              style={{
                position: "sticky",
                top: quickSection ? quickHeaderHeight -1 : 0,
                zIndex: 2,
                borderTop: `0.0625rem solid var(--tool-header-border)`,
                borderBottom: `0.0625rem solid var(--tool-header-border)`,
                padding: "0.5rem 1rem",
                fontWeight: 600,
                background: "var(--tool-header-bg)",
                color: "var(--tool-header-text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
              onClick={() => scrollTo(allToolsRef)}
            >
              <span style={{ fontSize: "1rem" }}>{t("toolPicker.allTools", "ALL TOOLS")}</span>
              <span
                style={{
                  background: "var(--tool-header-badge-bg)",
                  color: "var(--tool-header-badge-text)",
                  borderRadius: ".5rem",
                  padding: "0.125rem 0.5rem",
                  fontSize: ".75rem",
                  fontWeight: 700
                }}
              >
                {allSection?.subcategories.reduce((acc, sc) => acc + sc.tools.length, 0)}
              </span>
            </div>

            <Box ref={allToolsRef} w="100%">
              <Stack p="sm" gap="xs">
                {allSection?.subcategories.map(sc =>
                  renderToolButtons(t, sc, selectedToolKey, onSelect, true)
                )}
              </Stack>
            </Box>
          </>
        )}

        {!quickSection && !allSection && <NoToolsFound />}

        {/* bottom spacer to allow scrolling past the last row */}
        <div aria-hidden style={{ height: 200 }} />
          </>
        )}
      </Box>
    </Box>
  );
};

export default ToolPicker;
