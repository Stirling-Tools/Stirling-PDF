import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, ScrollArea } from "@mantine/core";
import {
  ToolRegistryEntry,
  ToolRegistry,
  SubcategoryId,
  getToolSupportsAutomate,
} from "@editor/data/toolsTaxonomy";
import { useToolSections } from "@editor/hooks/useToolSections";
import { renderToolButtons } from "@editor/components/tools/shared/renderToolButtons";
import ToolSearch from "@editor/components/tools/toolPicker/ToolSearch";
import { ToolId } from "@editor/types/toolId";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { useToolWorkflowData } from "@editor/contexts/ToolWorkflowContext";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { getToolDisabledReason } from "@editor/components/tools/fullscreen/shared";

const DROPDOWN_MAX_HEIGHT = 300;

interface ToolSelectorProps {
  onSelect: (toolKey: string) => void;
  excludeTools?: string[];
  toolRegistry: Partial<ToolRegistry>; // Pass registry as prop to break circular dependency
  placeholder?: string;
  /** Open the list and focus the search as soon as it mounts, e.g. for a step just added. */
  defaultOpen?: boolean;
}

interface ToolResultsProps {
  searchTerm: string;
  excludeTools: string[];
  toolRegistry: Partial<ToolRegistry>;
  onSelect: (toolKey: string) => void;
}

/**
 * The open list. Kept in its own component so the tool-workflow context it
 * reads (availability, and ToolButton's favourites) is only needed once the
 * list is actually open.
 */
function ToolResults({
  searchTerm,
  excludeTools,
  toolRegistry,
  onSelect,
}: ToolResultsProps) {
  const { t } = useTranslation();
  const { toolAvailability } = useToolWorkflowData();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  // Offer only tools a step can actually run: not excluded (Automate itself),
  // automatable, with an operationConfig for the executor to resolve, and
  // available on this server. An unavailable tool would sit greyed out in the
  // list and fail only at run time.
  const runnableTools = useMemo(
    () =>
      (Object.entries(toolRegistry) as [ToolId, ToolRegistryEntry][]).filter(
        ([key, tool]) =>
          !excludeTools.includes(key) &&
          getToolSupportsAutomate(tool) &&
          Boolean(tool.operationConfig) &&
          getToolDisabledReason(key, tool, toolAvailability, premiumEnabled) ===
            null,
      ),
    [toolRegistry, excludeTools, toolAvailability, premiumEnabled],
  );

  const matchingTools = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return runnableTools;
    return runnableTools.filter(
      ([key, tool]) =>
        tool.name.toLowerCase().includes(query) ||
        tool.description?.toLowerCase().includes(query) ||
        key.toLowerCase().includes(query),
    );
  }, [runnableTools, searchTerm]);

  const sectionInput = useMemo(
    () =>
      matchingTools.map(([id, tool]) => ({
        item: [id, tool] as [ToolId, ToolRegistryEntry],
      })),
    [matchingTools],
  );
  const { sections, searchGroups } = useToolSections(sectionInput);

  const isSearching = searchTerm.trim().length > 0;
  const displayGroups = useMemo(() => {
    if (isSearching) return searchGroups || [];
    if (!sections || sections.length === 0) {
      if (runnableTools.length === 0) return [];
      return [
        {
          name: "Tools",
          // Synthetic "all tools" group used only as a fallback when the
          // taxonomy produces no sections; "all" is not a real SubcategoryId.
          subcategoryId: "all" as unknown as SubcategoryId,
          tools: runnableTools.map(([key, tool]) => ({ id: key, tool })),
        },
      ];
    }
    const allSection = sections.find((s) => s.key === "all");
    return allSection?.subcategories || [];
  }, [isSearching, searchGroups, sections, runnableTools]);

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: "var(--mantine-radius-md)",
        boxShadow: "var(--mantine-shadow-md)",
        marginTop: "4px",
      }}
    >
      <ScrollArea.Autosize mah={DROPDOWN_MAX_HEIGHT}>
        <Stack gap="sm" p="sm">
          {displayGroups.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" p="md">
              {isSearching
                ? t("tools.noSearchResults", "No tools found")
                : t("tools.noTools", "No tools available")}
            </Text>
          ) : (
            displayGroups.map((subcategory) =>
              renderToolButtons(
                t,
                subcategory,
                null,
                onSelect,
                !isSearching,
                true,
              ),
            )
          )}
        </Stack>
      </ScrollArea.Autosize>
    </div>
  );
}

export default function ToolSelector({
  onSelect,
  excludeTools = [],
  toolRegistry,
  placeholder,
  defaultOpen = false,
}: ToolSelectorProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(defaultOpen);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpened(false);
    setSearchTerm("");
  };

  useEffect(() => {
    if (!opened) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpened(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [opened]);

  return (
    <div
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && opened) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <ToolSearch
        value={searchTerm}
        onChange={(value) => {
          setSearchTerm(value);
          setOpened(true);
        }}
        toolRegistry={toolRegistry}
        mode="unstyled"
        placeholder={
          placeholder || t("automate.creation.tools.add", "Add a tool...")
        }
        hideIcon={true}
        onFocus={() => setOpened(true)}
        autoFocus={defaultOpen}
      />
      {opened && (
        <ToolResults
          searchTerm={searchTerm}
          excludeTools={excludeTools}
          toolRegistry={toolRegistry}
          onSelect={(toolKey) => {
            onSelect(toolKey);
            close();
          }}
        />
      )}
    </div>
  );
}
