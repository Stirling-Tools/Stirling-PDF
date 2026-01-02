import React, { useState, useMemo } from 'react';
import { Box, Stack, Button, Collapse, ActionIcon } from '@mantine/core';
import { getSubcategoryLabel, ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import ToolButton from '@app/components/tools/toolPicker/ToolButton';
import { useTranslation } from 'react-i18next';
import { useToolSections } from '@app/hooks/useToolSections';
import SubcategoryHeader from '@app/components/tools/shared/SubcategoryHeader';
import NoToolsFound from '@app/components/tools/shared/NoToolsFound';
import LocalIcon from '@app/components/shared/LocalIcon';
import FitText from '@app/components/shared/FitText';
import { ToolIcon } from '@app/components/shared/ToolIcon';
import { RankedSearchItem } from '@app/utils/toolSearch';
import { parseSubToolId, SubToolId } from '@app/types/subtool';
import { Tooltip } from '@app/components/shared/Tooltip';
import "@app/components/tools/toolPicker/ToolPicker.css";

interface SearchResultsProps {
  filteredTools: RankedSearchItem[];
  onSelect: (id: string) => void;
  searchQuery?: string;
}

const SearchResults: React.FC<SearchResultsProps> = ({ filteredTools, onSelect, searchQuery }) => {
  const { t } = useTranslation();
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Check if there are any sub-tools in results
  const hasSubTools = filteredTools.some(item => item.type === 'subtool');

  // Separate parent tools for category grouping
  const parentToolsOnly = filteredTools
    .filter(item => item.type === 'parent')
    .map(item => ({ item: item.item as [ToolId, ToolRegistryEntry], matchedText: item.matchedText }));

  const { searchGroups } = useToolSections(parentToolsOnly, searchQuery);

  // Count parent tools
  const parentCount = parentToolsOnly.length;
  const shouldStartCollapsed = (parentId: string, subToolCount: number) => {
    // With 1-5 parents, always expand
    if (parentCount <= 5) return false;

    // With >5 parents, collapse Convert tool or tools with >10 sub-tools
    return parentId === 'convert' || subToolCount > 10;
  };

  // Group results by parent
  const groupedResults = useMemo(() => {
    const groups = new Map<string, { parent: RankedSearchItem; subTools: RankedSearchItem[] }>();

    for (const result of filteredTools) {
      if (result.type === 'parent') {
        const [id] = result.item;
        if (!groups.has(id as string)) {
          groups.set(id as string, { parent: result, subTools: [] });
        }
      } else {
        // Sub-tool - find its parent
        const [subToolId] = result.item;
        const { parentId } = parseSubToolId(subToolId as SubToolId);

        if (!groups.has(parentId)) {
          // Parent not in results yet, create placeholder
          groups.set(parentId, { parent: null as any, subTools: [] });
        }
        groups.get(parentId)!.subTools.push(result);
      }
    }

    return Array.from(groups.values()).filter(g => g.parent); // Remove groups without parent
  }, [filteredTools]);

  // Helper to handle sub-tool selection
  const handleSubToolSelect = (subToolId: string) => {
    const { parentId, params } = parseSubToolId(subToolId as SubToolId);
    const [from, to] = params.split('-to-');

    // Navigate to parent tool
    onSelect(parentId);

    // Set URL params for pre-selection
    const searchParams = new URLSearchParams({ from, to });
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?${searchParams.toString()}`
    );
  };

  const toggleParentExpanded = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  if (filteredTools.length === 0) {
    return <NoToolsFound />;
  }

  // If there are sub-tools, render with grouping
  if (hasSubTools) {
    return (
      <Stack p="sm" gap="xs" className="tool-picker-scrollable">
        {groupedResults.map((group) => {
          const [id, entry] = group.parent.item;
          const tool = entry as ToolRegistryEntry;
          const matchedText = group.parent.matchedText;
          const isSynonymMatch = matchedText && tool.synonyms?.some(synonym =>
            matchedText.toLowerCase().includes(synonym.toLowerCase())
          );
          const matchedSynonym = isSynonymMatch ? tool.synonyms?.find(synonym =>
            matchedText.toLowerCase().includes(synonym.toLowerCase())
          ) : undefined;

          const hasSubTools = group.subTools.length > 0;
          const startCollapsed = shouldStartCollapsed(id as string, group.subTools.length);
          // If should start collapsed: expanded only if user clicked to expand
          // If should start expanded: collapsed only if user clicked to collapse
          const isExpanded = startCollapsed
            ? expandedParents.has(id as string)
            : !expandedParents.has(id as string);

          return (
            <Box key={id as string}>
              {/* Parent tool */}
              <Box style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Box style={{ flex: 1 }}>
                  <ToolButton
                    id={id as ToolId}
                    tool={tool}
                    isSelected={false}
                    onSelect={onSelect}
                    matchedSynonym={matchedSynonym}
                  />
                </Box>
                {hasSubTools && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => toggleParentExpanded(id as string)}
                    style={{ color: 'var(--tools-text-and-icon-color)' }}
                  >
                    <LocalIcon
                      icon={isExpanded ? 'expand-less' : 'expand-more'}
                      width="1.2rem"
                      height="1.2rem"
                    />
                  </ActionIcon>
                )}
              </Box>

              {/* Sub-tools */}
              {hasSubTools && (
                <Collapse in={isExpanded}>
                  <Stack gap="xs" ml="md" mt="xs">
                    {group.subTools.map((subResult) => {
                      const [subId, subEntry] = subResult.item;
                      const displayEntry = subEntry as any;
                      const available = displayEntry?.available !== false;
                      const disabledMessage = t('toolPanel.fullscreen.unavailable', 'Disabled by server administrator:');
                      const disabledTooltipContent = (
                        <span>
                          <strong>{disabledMessage}</strong>{' '}
                          {displayEntry?.description || ''}
                        </span>
                      );

                      const button = (
                        <Button
                          key={subId as string}
                          variant="subtle"
                          size="sm"
                          radius="md"
                          aria-disabled={!available}
                          onClick={() => {
                            if (!available) return;
                            handleSubToolSelect(subId as string);
                          }}
                          className="tool-button"
                          leftSection={
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: '8px',
                                color: "var(--tools-text-and-icon-color)"
                              }}
                            >
                              <LocalIcon
                                icon="subdirectory-arrow-right"
                                width="1rem"
                                height="1rem"
                                style={{ marginRight: '4px', opacity: 0.6 }}
                              />
                              <ToolIcon icon={displayEntry.icon} marginRight="0" style={{ opacity: available ? 1 : 0.4 }} />
                            </div>
                          }
                          fullWidth
                          justify="flex-start"
                          styles={{
                            root: {
                              borderRadius: 0,
                              color: "var(--tools-text-and-icon-color)",
                              overflow: 'visible',
                              cursor: available ? undefined : 'not-allowed'
                            },
                            label: { overflow: 'visible' }
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'visible' }}>
                            <FitText
                              text={displayEntry.name}
                              lines={1}
                              minimumFontScale={0.8}
                              as="span"
                              style={{ display: 'inline-block', maxWidth: '100%', opacity: available ? 1 : 0.4 }}
                            />
                          </div>
                        </Button>
                      );

                      return available ? button : (
                        <Tooltip content={disabledTooltipContent}>
                          <div style={{ opacity: 1 }}>{button}</div>
                        </Tooltip>
                      );
                    })}
                  </Stack>
                </Collapse>
              )}
            </Box>
          );
        })}
        {/* Global spacer to allow scrolling past last row in search mode */}
        <div aria-hidden style={{ height: 200 }} />
      </Stack>
    );
  }

  // No sub-tools - use traditional category grouping
  if (searchGroups.length === 0) {
    return <NoToolsFound />;
  }

  return (
    <Stack p="sm" gap="xs" className="tool-picker-scrollable">
      {searchGroups
        .filter(group => group.subcategoryId !== undefined)
        .map(group => (
          <Box key={group.subcategoryId} w="100%">
            <SubcategoryHeader label={getSubcategoryLabel(t, group.subcategoryId)} />
            <Stack gap="xs">
              {group.tools.map(({ id, tool }) => {
                const matched = parentToolsOnly.find(item => item.item[0] === id);
                const matchedText = matched?.matchedText;
                const isSynonymMatch = matchedText && tool.synonyms?.some(synonym =>
                  matchedText.toLowerCase().includes(synonym.toLowerCase())
                );
                const matchedSynonym = isSynonymMatch ? tool.synonyms?.find(synonym =>
                  matchedText.toLowerCase().includes(synonym.toLowerCase())
                ) : undefined;

                return (
                  <ToolButton
                    key={id}
                    id={id}
                    tool={tool}
                    isSelected={false}
                    onSelect={onSelect}
                    matchedSynonym={matchedSynonym}
                  />
                );
              })}
            </Stack>
          </Box>
        ))}
      {/* Global spacer to allow scrolling past last row in search mode */}
      <div aria-hidden style={{ height: 200 }} />
    </Stack>
  );
};

export default SearchResults;
