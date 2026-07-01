import React, { useMemo, useRef } from "react";
import { Box, Button, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import "@app/components/tools/toolPicker/ToolPicker.css";
import { useToolSections } from "@app/hooks/useToolSections";
import type { SubcategoryGroup } from "@app/hooks/useToolSections";
import { useFavoriteToolItems } from "@app/hooks/tools/useFavoriteToolItems";
import NoToolsFound from "@app/components/tools/shared/NoToolsFound";
import { renderToolButtons } from "@app/components/tools/shared/renderToolButtons";
import ToolButton from "@app/components/tools/toolPicker/ToolButton";
import { useToolWorkflowData } from "@app/contexts/ToolWorkflowContext";
import { useSigningBadgeCount } from "@app/hooks/signing/useSigningBadgeCount";
import { ToolId } from "@app/types/toolId";
import { getSubcategoryLabel } from "@app/data/toolsTaxonomy";
import { ToolPickerFooterExtensions } from "@app/components/tools/toolPicker/ToolPickerFooterExtensions";

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  filteredTools: Array<{
    item: [ToolId, ToolRegistryEntry];
    matchedText?: string;
  }>;
  isSearching?: boolean;
  /** Compact "resting" view: favourites + recommended only, with a button to expand. */
  compact?: boolean;
  /** Called when the user clicks "View all tools" in compact mode. */
  onShowAllTools?: () => void;
}

const EMPTY_FILTERED_TOOLS: ToolPickerProps["filteredTools"] = [];
const HEADER_TEXT_STYLE: React.CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 600,
  padding: "1rem 0 0.35rem 0.5rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};
const SCROLLABLE_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  minHeight: 0,
  height: "100%",
  marginTop: -2,
};
const CONTAINER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-toolbar)",
};
const toTitleCase = (s: string) =>
  s.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase(),
  );

const ToolPicker = ({
  selectedToolKey,
  onSelect,
  filteredTools,
  isSearching = false,
  compact = false,
  onShowAllTools,
}: ToolPickerProps) => {
  const { t } = useTranslation();

  const scrollableRef = useRef<HTMLDivElement>(null);

  const { sections: visibleSections } = useToolSections(filteredTools);
  const { favoriteTools, toolRegistry } = useToolWorkflowData();

  const favoriteToolItems = useFavoriteToolItems(favoriteTools, toolRegistry);

  const quickSection = useMemo(
    () => visibleSections.find((s) => s.key === "quick"),
    [visibleSections],
  );

  // Signing items needing the user's attention: requests awaiting their
  // signature, plus their own sessions newly signed since last opened
  // (0 when group signing is disabled).
  const signingBadgeCount = useSigningBadgeCount();

  const recommendedItems = useMemo(() => {
    const items: Array<{ id: string; tool: ToolRegistryEntry }> = [];
    quickSection?.subcategories.forEach((sc: SubcategoryGroup) =>
      sc.tools.forEach((toolEntry) => items.push(toolEntry)),
    );
    // While signing needs the user's attention, surface Shared Signing at the
    // top of Recommended so it's easy to find without hunting in the Signing group.
    if (signingBadgeCount > 0) {
      const sharedSignTool = toolRegistry["sharedSign" as ToolId];
      if (sharedSignTool) {
        return [
          { id: "sharedSign", tool: sharedSignTool },
          ...items.filter(({ id }) => id !== "sharedSign"),
        ];
      }
    }
    return items;
  }, [quickSection, signingBadgeCount, toolRegistry]);

  const allSection = useMemo(
    () => visibleSections.find((s) => s.key === "all"),
    [visibleSections],
  );

  // Build flat list by subcategory for search mode
  const effectiveFilteredForSearch: ToolPickerProps["filteredTools"] =
    isSearching ? filteredTools : EMPTY_FILTERED_TOOLS;
  const { searchGroups } = useToolSections(effectiveFilteredForSearch);

  return (
    <Box h="100%" style={CONTAINER_STYLE}>
      <Box
        ref={scrollableRef}
        style={SCROLLABLE_STYLE}
        className="tool-picker-scrollable"
      >
        {isSearching ? (
          <Stack p="sm" gap="xs">
            {searchGroups.length === 0 ? (
              <NoToolsFound />
            ) : (
              searchGroups.map((group) =>
                renderToolButtons(
                  t,
                  group,
                  selectedToolKey,
                  onSelect,
                  true,
                  false,
                  filteredTools,
                  true,
                ),
              )
            )}
          </Stack>
        ) : compact ? (
          /* Resting state: flat list of pinned + recommended only. */
          <Box className="tool-picker__compact">
            <div style={HEADER_TEXT_STYLE}>
              {t("toolPanel.toolsHeader", "Tools")}
            </div>
            {favoriteToolItems.length === 0 && recommendedItems.length === 0 ? (
              <NoToolsFound />
            ) : (
              <div className="tool-picker__compact-list">
                {favoriteToolItems.map(({ id, tool }) => (
                  <ToolButton
                    key={`fav-${id}`}
                    id={id}
                    tool={tool}
                    isSelected={selectedToolKey === id}
                    onSelect={onSelect}
                    hasStars
                    showDescription
                  />
                ))}
                {recommendedItems
                  .filter(
                    ({ id }) => !favoriteToolItems.some((fav) => fav.id === id),
                  )
                  .map(({ id, tool }) => (
                    <ToolButton
                      key={`rec-${id}`}
                      id={id as ToolId}
                      tool={tool}
                      isSelected={selectedToolKey === id}
                      onSelect={onSelect}
                      hasStars
                      showDescription
                      badgeCount={
                        id === "sharedSign" ? signingBadgeCount : undefined
                      }
                    />
                  ))}
              </div>
            )}
            {onShowAllTools && (
              <Button
                variant="subtle"
                size="sm"
                fullWidth
                onClick={onShowAllTools}
                className="tool-picker__view-all"
                aria-label={t("toolPanel.viewAllTools", "View all tools")}
              >
                {t("toolPanel.viewAllTools", "View all tools")}
              </Button>
            )}
          </Box>
        ) : (
          <>
            {/* All-tools view: favourites + recommended + all subcategories. */}
            <Stack p="sm" gap="xs">
              {favoriteToolItems.length > 0 && (
                <Box w="100%">
                  <div style={HEADER_TEXT_STYLE}>
                    {t("toolPanel.fullscreen.favorites", "Favourites")}
                  </div>
                  <div>
                    {favoriteToolItems.map(({ id, tool }) => (
                      <ToolButton
                        key={`fav-${id}`}
                        id={id}
                        tool={tool}
                        isSelected={selectedToolKey === id}
                        onSelect={onSelect}
                        hasStars
                      />
                    ))}
                  </div>
                </Box>
              )}
              {recommendedItems.length > 0 && (
                <Box w="100%">
                  <div style={HEADER_TEXT_STYLE}>
                    {t("toolPanel.fullscreen.recommended", "Recommended")}
                  </div>
                  <div>
                    {recommendedItems.map(({ id, tool }) => (
                      <ToolButton
                        key={`rec-${id}`}
                        id={id as ToolId}
                        tool={tool}
                        isSelected={selectedToolKey === id}
                        onSelect={onSelect}
                        hasStars
                        badgeCount={
                          id === "sharedSign" ? signingBadgeCount : undefined
                        }
                      />
                    ))}
                  </div>
                </Box>
              )}
              {allSection &&
                allSection.subcategories.map((sc: SubcategoryGroup) => (
                  <Box key={sc.subcategoryId} w="100%">
                    <div style={HEADER_TEXT_STYLE}>
                      {toTitleCase(getSubcategoryLabel(t, sc.subcategoryId))}
                    </div>
                    {renderToolButtons(
                      t,
                      sc,
                      selectedToolKey,
                      onSelect,
                      false,
                      false,
                      undefined,
                      true,
                    )}
                  </Box>
                ))}
            </Stack>

            {!quickSection && !allSection && <NoToolsFound />}

            <div aria-hidden style={{ height: 200 }} />
          </>
        )}
      </Box>
      <ToolPickerFooterExtensions />
    </Box>
  );
};

export default ToolPicker;
