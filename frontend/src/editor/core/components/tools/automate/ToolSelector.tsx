import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, ScrollArea } from "@mantine/core";
import {
  ToolRegistryEntry,
  ToolRegistry,
  SubcategoryId,
  getToolSupportsAutomate,
} from "@editor/data/toolsTaxonomy";
import {
  useToolSections,
  type SubcategoryGroup,
} from "@editor/hooks/useToolSections";
import { renderToolButtons } from "@editor/components/tools/shared/renderToolButtons";
import ToolSearch from "@editor/components/tools/toolPicker/ToolSearch";
import { ToolId } from "@editor/types/toolId";
import { ToolIcon } from "@editor/components/shared/ToolIcon";
import { Icon } from "@editor/ui/Icon";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

interface ToolSelectorProps {
  onSelect: (toolKey: string) => void;
  excludeTools?: string[];
  toolRegistry: Partial<ToolRegistry>; // Pass registry as prop to break circular dependency
  selectedValue?: string; // For showing current selection when editing existing tool
  placeholder?: string; // Custom placeholder text
}

export default function ToolSelector({
  onSelect,
  excludeTools = [],
  toolRegistry,
  selectedValue,
  placeholder,
}: ToolSelectorProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter out excluded tools (like 'automate' itself), tools that don't support
  // automation, and tools with no operationConfig - the executor resolves a step
  // through operationConfig, so offering one without it fails only at run time.
  const baseFilteredTools = useMemo(() => {
    return (
      Object.entries(toolRegistry) as [ToolId, ToolRegistryEntry][]
    ).filter(
      ([key, tool]) =>
        !excludeTools.includes(key) &&
        getToolSupportsAutomate(tool) &&
        Boolean(tool.operationConfig),
    );
  }, [toolRegistry, excludeTools]);

  // Apply search filter
  const filteredTools = useMemo(() => {
    if (!searchTerm.trim()) {
      return baseFilteredTools;
    }

    const lowercaseSearch = searchTerm.toLowerCase();
    return baseFilteredTools.filter(([key, tool]) => {
      return (
        tool.name.toLowerCase().includes(lowercaseSearch) ||
        tool.description?.toLowerCase().includes(lowercaseSearch) ||
        key.toLowerCase().includes(lowercaseSearch)
      );
    });
  }, [baseFilteredTools, searchTerm]);

  // Create filtered tool registry for ToolSearch
  const filteredToolRegistry = useMemo(() => {
    const registry: Partial<ToolRegistry> = {};
    baseFilteredTools.forEach(([key, tool]) => {
      registry[key] = tool;
    });
    return registry;
  }, [baseFilteredTools]);

  // Transform filteredTools to the expected format for useToolSections
  const transformedFilteredTools = useMemo(() => {
    return filteredTools.map(([id, tool]) => ({
      item: [id, tool] as [ToolId, ToolRegistryEntry],
    }));
  }, [filteredTools]);

  // Use the same tool sections logic as the main ToolPicker
  const { sections, searchGroups } = useToolSections(transformedFilteredTools);

  // Determine what to display: search results or organized sections
  const isSearching = searchTerm.trim().length > 0;
  const displayGroups = useMemo(() => {
    if (isSearching) {
      return searchGroups || [];
    }

    if (!sections || sections.length === 0) {
      // If no sections, create a simple group from filtered tools
      if (baseFilteredTools.length > 0) {
        return [
          {
            name: "Tools",
            // Synthetic "all tools" group used only as a fallback when the
            // taxonomy produces no sections; "all" is not a real SubcategoryId.
            subcategoryId: "all" as unknown as SubcategoryId,
            tools: baseFilteredTools.map(([key, tool]) => ({ id: key, tool })),
          },
        ];
      }
      return [];
    }

    // Recommended tools live in the quick section and are deliberately absent
    // from "all"; a selector that only reads "all" silently loses Compress,
    // Merge and the rest of the common tools. Merge both sections by
    // subcategory so every automatable tool is offered once.
    const merged = new Map<string, SubcategoryGroup>();
    for (const section of sections) {
      for (const group of section.subcategories) {
        const existing = merged.get(group.subcategoryId);
        if (existing) {
          existing.tools.push(...group.tools);
        } else {
          merged.set(group.subcategoryId, {
            subcategoryId: group.subcategoryId,
            tools: [...group.tools],
          });
        }
      }
    }
    return [...merged.values()];
  }, [isSearching, searchGroups, sections, baseFilteredTools]);

  const handleToolSelect = useCallback(
    (toolKey: string) => {
      onSelect(toolKey);
      setOpened(false);
      setSearchTerm(""); // Clear search to show the selected tool display
    },
    [onSelect],
  );

  const renderedTools = useMemo(
    () =>
      displayGroups.map((subcategory) =>
        renderToolButtons(
          t,
          subcategory,
          null,
          handleToolSelect,
          !isSearching,
          true,
        ),
      ),
    [displayGroups, handleToolSelect, isSearching, t],
  );

  const handleSearchFocus = () => {
    setOpened(true);
    setShouldAutoFocus(true); // Request auto-focus for the input
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpened(false);
        setSearchTerm("");
      }
    };

    if (opened) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [opened]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (!opened) {
      setOpened(true);
    }
  };

  const handleInputFocus = () => {
    if (!opened) {
      setOpened(true);
    }
    // Clear auto-focus flag since input is now focused
    setShouldAutoFocus(false);
  };

  // Get display value for selected tool
  const selectedTool = selectedValue
    ? toolRegistry[selectedValue as ToolId]
    : undefined;

  const getDisplayValue = () => {
    if (selectedTool) return selectedTool.name;
    return placeholder || t("automate.creation.tools.add", "Add a tool...");
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Always show the target - either selected tool or search input */}

      {selectedTool && !opened ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={t(
            "automate.creation.tools.changeTool",
            "Change tool: {{name}}",
            { name: selectedTool.name },
          )}
          onClick={handleSearchFocus}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSearchFocus();
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            minHeight: "2.25rem",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
            borderRadius: "var(--mantine-radius-sm)",
            border: "1px solid var(--c-border)",
            backgroundColor: "var(--c-input-bg)",
          }}
        >
          <ToolIcon icon={selectedTool.icon} color="var(--c-text)" />
          <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
            {selectedTool.name}
          </Text>
          <Icon
            name="chevron-down"
            size={14}
            style={{ color: "var(--c-text-muted)" }}
          />
        </div>
      ) : (
        // Show search input when no tool selected OR when dropdown is opened
        <ToolSearch
          value={searchTerm}
          onChange={handleSearchChange}
          toolRegistry={filteredToolRegistry}
          mode="unstyled"
          placeholder={getDisplayValue()}
          hideIcon={true}
          onFocus={handleInputFocus}
          autoFocus={shouldAutoFocus}
        />
      )}

      {/* Custom dropdown */}
      {opened && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--mantine-radius-sm)",
            boxShadow: "var(--mantine-shadow-sm)",
            marginTop: "4px",
            width: "100%",
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <ScrollArea h={350}>
            <Stack gap="sm" p="sm">
              {displayGroups.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" p="md">
                  {isSearching
                    ? t("tools.noSearchResults", "No tools found")
                    : t("tools.noTools", "No tools available")}
                </Text>
              ) : (
                renderedTools
              )}
            </Stack>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
