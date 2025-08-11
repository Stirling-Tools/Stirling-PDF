import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import { Box, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { baseToolRegistry, type ToolRegistryEntry } from "../../data/toolRegistry";
import ToolButton from "./toolPicker/ToolButton";
import "./toolPicker/ToolPicker.css";

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  filteredTools: [string, ToolRegistryEntry][];
}

interface GroupedTools {
  [category: string]: {
    [subcategory: string]: Array<{ id: string; tool: ToolRegistryEntry }>;
  };
}

const ToolPicker = ({ selectedToolKey, onSelect, filteredTools }: ToolPickerProps) => {
  const { t } = useTranslation();
  const [quickHeaderHeight, setQuickHeaderHeight] = useState(0);
  const [allHeaderHeight, setAllHeaderHeight] = useState(0);

  const scrollableRef = useRef<HTMLDivElement>(null);
  const quickHeaderRef = useRef<HTMLDivElement>(null);
  const allHeaderRef = useRef<HTMLDivElement>(null);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const allToolsRef = useRef<HTMLDivElement>(null);

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

  const groupedTools = useMemo(() => {
    const grouped: GroupedTools = {};
    filteredTools.forEach(([id, tool]) => {
      const baseTool = baseToolRegistry[id as keyof typeof baseToolRegistry];
      const category = baseTool?.category || "OTHER";
      const subcategory = baseTool?.subcategory || "General";
      if (!grouped[category]) grouped[category] = {};
      if (!grouped[category][subcategory]) grouped[category][subcategory] = [];
      grouped[category][subcategory].push({ id, tool });
    });
    return grouped;
  }, [filteredTools]);

  const sections = useMemo(() => {
    const mapping: Record<string, "QUICK ACCESS" | "ALL TOOLS"> = {
      "RECOMMENDED TOOLS": "QUICK ACCESS",
      "STANDARD TOOLS": "ALL TOOLS",
      "ADVANCED TOOLS": "ALL TOOLS"
    };
    const quick: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};
    const all: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};
    Object.entries(groupedTools).forEach(([origCat, subs]) => {
      const bucket = mapping[origCat.toUpperCase()] || "ALL TOOLS";
      const target = bucket === "QUICK ACCESS" ? quick : all;
      Object.entries(subs).forEach(([sub, tools]) => {
        if (!target[sub]) target[sub] = [];
        target[sub].push(...tools);
      });
    });

    const sortSubs = (obj: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>>) =>
      Object.entries(obj)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([subcategory, tools]) => ({
          subcategory,
          tools: tools.sort((a, b) => a.tool.name.localeCompare(b.tool.name))
        }));

    return [
      { title: "QUICK ACCESS", ref: quickAccessRef, subcategories: sortSubs(quick) },
      { title: "ALL TOOLS", ref: allToolsRef, subcategories: sortSubs(all) }
    ];
  }, [groupedTools]);

  const visibleSections = sections;

  const quickSection = useMemo(
    () => visibleSections.find(s => s.title === "QUICK ACCESS"),
    [visibleSections]
  );
  const allSection = useMemo(
    () => visibleSections.find(s => s.title === "ALL TOOLS"),
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
        {quickSection && (
          <>
            <div
              ref={quickHeaderRef}
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                borderTop: `1px solid var(--tool-header-border)`,
                borderBottom: `1px solid var(--tool-header-border)`,
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
              <span>QUICK ACCESS</span>
              <span
                style={{
                  background: "var(--tool-header-badge-bg)",
                  color: "var(--tool-header-badge-text)",
                  borderRadius: 8,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {quickSection.subcategories.reduce((acc, sc) => acc + sc.tools.length, 0)}
              </span>
            </div>

            <Box ref={quickAccessRef} w="100%">
              <Stack p="sm" gap="xs">
                {quickSection.subcategories.map(sc => (
                  <Box key={sc.subcategory} w="100%">
                    {quickSection.subcategories.length > 1 && (
                      <Text
                        size="sm"
                        fw={500}
                        mb="0.25rem"
                        mt="1rem"
                        className="tool-subcategory-title"
                      >
                        {sc.subcategory}
                      </Text>
                    )}
                    <Stack gap="xs">
                      {sc.tools.map(({ id, tool }) => (
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
                ))}
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
                borderTop: `1px solid var(--tool-header-border)`,
                borderBottom: `1px solid var(--tool-header-border)`,
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
              <span>ALL TOOLS</span>
              <span
                style={{
                  background: "var(--tool-header-badge-bg)",
                  color: "var(--tool-header-badge-text)",
                  borderRadius: 8,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {allSection.subcategories.reduce((acc, sc) => acc + sc.tools.length, 0)}
              </span>
            </div>

            <Box ref={allToolsRef} w="100%">
              <Stack p="sm" gap="xs">
                {allSection.subcategories.map(sc => (
                  <Box key={sc.subcategory} w="100%">
                    {allSection.subcategories.length > 1 && (
                      <Text
                        size="sm"
                        fw={500}
                        mb="0.25rem"
                        mt="1rem"
                        className="tool-subcategory-title"
                      >
                        {sc.subcategory}
                      </Text>
                    )}
                    <Stack gap="xs">
                      {sc.tools.map(({ id, tool }) => (
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
                ))}
              </Stack>
            </Box>
          </>
        )}

        {!quickSection && !allSection && (
          <Text c="dimmed" size="sm" p="sm">
            {t("toolPicker.noToolsFound", "No tools found")}
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default ToolPicker;
