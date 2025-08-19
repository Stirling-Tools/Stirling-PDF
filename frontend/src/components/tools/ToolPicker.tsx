import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import { Box, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ToolRegistryEntry } from "../../data/toolsTaxonomy";
import ToolButton from "./toolPicker/ToolButton";
import "./toolPicker/ToolPicker.css";
import { useToolSections } from "../../hooks/useToolSections";
import SubcategoryHeader from "./shared/SubcategoryHeader";
import NoToolsFound from "./shared/NoToolsFound";

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  filteredTools: [string, ToolRegistryEntry][];
  isSearching?: boolean;
}

// Helper function to render tool buttons for a subcategory
const renderToolButtons = (
  subcategory: any,
  selectedToolKey: string | null,
  onSelect: (id: string) => void,
  showSubcategoryHeader: boolean = true
) => (
  <Box key={subcategory.subcategory} w="100%">
    {showSubcategoryHeader && (
      <SubcategoryHeader label={subcategory.subcategory} />
    )}
    <Stack gap="xs">
      {subcategory.tools.map(({ id, tool }: { id: string; tool: any }) => (
        <ToolButton
          key={id}
          id={id}
          tool={tool}
          isSelected={selectedToolKey === id}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  </Box>
);

const ToolPicker = ({ selectedToolKey, onSelect, filteredTools, isSearching = false }: ToolPickerProps) => {
  const { t } = useTranslation();
  const [quickHeaderHeight, setQuickHeaderHeight] = useState(0);
  const [allHeaderHeight, setAllHeaderHeight] = useState(0);

  const scrollableRef = useRef<HTMLDivElement>(null);
  const quickHeaderRef = useRef<HTMLDivElement>(null);
  const allHeaderRef = useRef<HTMLDivElement>(null);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const allToolsRef = useRef<HTMLDivElement>(null);

  // On resize adjust headers height to offset height
  useLayoutEffect(() => {
    const update = () => {
      if (quickHeaderRef.current) {
        setQuickHeaderHeight(quickHeaderRef.current.offsetHeight);
      }
      if (allHeaderRef.current) {
        setAllHeaderHeight(allHeaderRef.current.offsetHeight);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { sections: visibleSections } = useToolSections(filteredTools);

  const quickSection = useMemo(
    () => visibleSections.find(s => (s as any).key === 'quick'),
    [visibleSections]
  );
  const allSection = useMemo(
    () => visibleSections.find(s => (s as any).key === 'all'),
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
      h="100vh"
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
          height: "100%"
        }}
        className="tool-picker-scrollable"
      >
        {isSearching ? (
          <Stack p="sm" gap="xs">
            {searchGroups.length === 0 ? (
              <NoToolsFound />
            ) : (
              searchGroups.map(group => renderToolButtons(group, selectedToolKey, onSelect))
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
                marginBottom: -1,
                padding: "0.5rem 1rem",
                fontWeight: 700,
                background: "var(--tool-header-bg)",
                color: "var(--tool-header-text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
              onClick={() => scrollTo(quickAccessRef)}
            >
              <span>{t("toolPicker.quickAccess", "QUICK ACCESS")}</span>
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

            <Box ref={quickAccessRef} w="100%">
              <Stack p="sm" gap="xs">
                {quickSection?.subcategories.map(sc => 
                  renderToolButtons(sc, selectedToolKey, onSelect, false)
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
                top: quickSection ? quickHeaderHeight - 1: 0,
                zIndex: 2,
                borderTop: `0.0625rem solid var(--tool-header-border)`,
                borderBottom: `0.0625rem solid var(--tool-header-border)`,
                padding: "0.5rem 1rem",
                fontWeight: 700,
                background: "var(--tool-header-bg)",
                color: "var(--tool-header-text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
              onClick={() => scrollTo(allToolsRef)}
            >
              <span>{t("toolPicker.allTools", "ALL TOOLS")}</span>
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
                  renderToolButtons(sc, selectedToolKey, onSelect, true)
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
