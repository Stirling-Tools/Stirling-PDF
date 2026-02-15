import React, { useEffect, useMemo, useRef } from "react";
import { Badge, Box, Button, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import "@app/components/tools/toolPicker/ToolPicker.css";
import { useToolSections } from "@app/hooks/useToolSections";
import type { SubcategoryGroup } from "@app/hooks/useToolSections";
import { useFavoriteToolItems } from "@app/hooks/tools/useFavoriteToolItems";
import NoToolsFound from "@app/components/tools/shared/NoToolsFound";
import { renderToolButtons } from "@app/components/tools/shared/renderToolButtons";
import ToolButton from "@app/components/tools/toolPicker/ToolButton";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolId } from "@app/types/toolId";
import { getSubcategoryLabel } from "@app/data/toolsTaxonomy";
import { usePluginRegistry } from "@app/contexts/PluginRegistryContext";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useNavigate } from "react-router-dom";
import FitText from "@app/components/shared/FitText";
import { LocalIcon } from '@app/components/shared/LocalIcon';

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  filteredTools: Array<{ item: [ToolId, ToolRegistryEntry]; matchedText?: string }>;
  isSearching?: boolean;
}

const ToolPicker = ({ selectedToolKey, onSelect, filteredTools, isSearching = false }: ToolPickerProps) => {
  const { t } = useTranslation();

  const scrollableRef = useRef<HTMLDivElement>(null);

  const { sections: visibleSections } = useToolSections(filteredTools);
  const {
    favoriteTools,
    toolRegistry,
    setLeftPanelView,
    setReaderMode,
    setSearchQuery,
  } = useToolWorkflow();

  const favoriteToolItems = useFavoriteToolItems(favoriteTools, toolRegistry);

  const quickSection = useMemo(
    () => visibleSections.find(s => s.key === 'quick'),
    [visibleSections]
  );

  const recommendedItems = useMemo(() => {
    if (!quickSection) return [] as Array<{ id: string; tool: ToolRegistryEntry }>;
    const items: Array<{ id: string; tool: ToolRegistryEntry }> = [];
    quickSection.subcategories.forEach((sc: SubcategoryGroup) => sc.tools.forEach((toolEntry) => items.push(toolEntry)));
    return items;
  }, [quickSection]);

  const allSection = useMemo(
    () => visibleSections.find(s => s.key === 'all'),
    [visibleSections]
  );

  const { plugins } = usePluginRegistry();
  const navigate = useNavigate();
  const pluginItems = useMemo(
    () => plugins.filter((plugin) => plugin.hasFrontend && plugin.frontendUrl),
    [plugins],
  );

  useEffect(() => {
    pluginItems.forEach((plugin) => {
      console.debug(`[ToolPicker] Rendering icon for plugin ${plugin.id}:`, plugin.icon);
    });
  }, [pluginItems]);

  // Build flat list by subcategory for search mode
  const emptyFilteredTools: ToolPickerProps['filteredTools'] = [];
  const effectiveFilteredForSearch: ToolPickerProps['filteredTools'] = isSearching ? filteredTools : emptyFilteredTools;
  const { searchGroups } = useToolSections(effectiveFilteredForSearch);
  const headerTextStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 500,
    padding: "0.5rem 0 0.25rem 0.5rem",
    textTransform: "none",
    color: "var(--text-secondary, rgba(0, 0, 0, 0.6))",
    opacity: 0.7
  };
  const toTitleCase = (s: string) =>
    s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

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
                      searchGroups.map(group => renderToolButtons(t, group, selectedToolKey, onSelect, true, false, filteredTools, true))
            )}
          </Stack>
        ) : (
          <>
        {/* Flat list: favorites and recommended first, then all subcategories */}
        <Stack p="sm" gap="xs">
          {favoriteToolItems.length > 0 && (
            <Box w="100%">
              <div style={headerTextStyle}>
                {t('toolPanel.fullscreen.favorites', 'Favourites')}
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
              <div style={headerTextStyle}>
                {t('toolPanel.fullscreen.recommended', 'Recommended')}
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
                  />
                ))}
              </div>
            </Box>
          )}
          {pluginItems.length > 0 && (
            <Box w="100%">
              <div style={headerTextStyle}>{t("plugins.shortTitle", "Plugins")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {pluginItems.map((plugin) => (
                  <div key={`plugin-${plugin.id}`} className="tool-button-container">
                    <Tooltip content={plugin.description} position="right" arrow={true} delay={500}>
                      <Button
                        component="a"
                        key={`plugin-${plugin.id}`}
                        variant="subtle"
                        size="sm"
                        radius="md"
                        fullWidth
                        className="tool-button"
                        justify="flex-start"
                        onClick={() => {
                          console.debug(`[ToolPicker] Navigating to plugin ${plugin.id}`);
                          navigate(`/plugins/${plugin.id}`, { state: { plugin } });
                        }}
                        data-tour={`plugin-button-${plugin.id}`}
                        styles={{
                          root: {
                            borderRadius: 0,
                            color: "var(--tools-text-and-icon-color)",
                            overflow: 'visible'
                          },
                          label: { overflow: 'visible' }
                        }}
                      >
                      <>
                      <div
                        className="tool-button-icon"
                        style={{
                          transform: "scale(0.8)",
                          transformOrigin: "center",
                          opacity: 1,
                          color: "var(--tools-text-and-icon-color)",
                          marginRight: "0.5rem"
                        }}
                      >
                      <LocalIcon icon={typeof plugin.icon === 'string' ? plugin.icon : 'extension'} width="24" height="24" />
                      </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'visible' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                            <FitText
                              text={plugin.name}
                              lines={1}
                              minimumFontScale={0.8}
                              as="span"
                              style={{ display: 'inline-block', maxWidth: '100%', opacity:  1 }}
                            />
                          </div>
                        </div>
                      </>
                      </Button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </Box>
          )}
          {allSection && allSection.subcategories.map((sc: SubcategoryGroup) => (
            <Box key={sc.subcategoryId} w="100%">
              <div style={headerTextStyle}>
                {toTitleCase(getSubcategoryLabel(t, sc.subcategoryId))}
              </div>
              {renderToolButtons(t, sc, selectedToolKey, onSelect, false, false, undefined, true)}
            </Box>
          ))}
        </Stack>

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
