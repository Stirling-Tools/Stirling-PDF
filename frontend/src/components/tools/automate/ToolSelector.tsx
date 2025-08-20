import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Stack, Text, ScrollArea } from '@mantine/core';
import { ToolRegistryEntry } from '../../../data/toolsTaxonomy';
import { useToolSections } from '../../../hooks/useToolSections';
import { renderToolButtons } from '../shared/renderToolButtons';
import ToolSearch from '../toolPicker/ToolSearch';

interface ToolSelectorProps {
  onSelect: (toolKey: string) => void;
  excludeTools?: string[];
  toolRegistry: Record<string, ToolRegistryEntry>; // Pass registry as prop to break circular dependency
  selectedValue?: string; // For showing current selection when editing existing tool
  placeholder?: string; // Custom placeholder text
}

export default function ToolSelector({
  onSelect,
  excludeTools = [],
  toolRegistry,
  selectedValue,
  placeholder
}: ToolSelectorProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter out excluded tools (like 'automate' itself)
  const baseFilteredTools = useMemo(() => {
    return Object.entries(toolRegistry).filter(([key]) => !excludeTools.includes(key));
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
    const registry: Record<string, ToolRegistryEntry> = {};
    baseFilteredTools.forEach(([key, tool]) => {
      registry[key] = tool;
    });
    return registry;
  }, [baseFilteredTools]);

  // Use the same tool sections logic as the main ToolPicker
  const { sections, searchGroups } = useToolSections(filteredTools);

  // Determine what to display: search results or organized sections
  const isSearching = searchTerm.trim().length > 0;
  const displayGroups = useMemo(() => {
    if (isSearching) {
      return searchGroups || [];
    }

    if (!sections || sections.length === 0) {
      return [];
    }

    // Find the "all" section which contains all tools without duplicates
    const allSection = sections.find(s => (s as any).key === 'all');
    return allSection?.subcategories || [];
  }, [isSearching, searchGroups, sections]);

  const handleToolSelect = useCallback((toolKey: string) => {
    onSelect(toolKey);
    setOpened(false);
    setSearchTerm(''); // Clear search to show the selected tool display
  }, [onSelect]);

  const renderedTools = useMemo(() => 
    displayGroups.map((subcategory) =>
      renderToolButtons(subcategory, null, handleToolSelect, !isSearching)
    ), [displayGroups, handleToolSelect, isSearching]
  );

  const handleSearchFocus = () => {
    setOpened(true);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (!opened) {
      setOpened(true);
    }
  };

  // Get display value for selected tool
  const getDisplayValue = () => {
    if (selectedValue && toolRegistry[selectedValue]) {
      return toolRegistry[selectedValue].name;
    }
    return placeholder || t('automate.creation.tools.add', 'Add a tool...');
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <Menu
        opened={opened}
        onChange={(isOpen) => {
          setOpened(isOpen);
          // Clear search term when menu closes to show proper display
          if (!isOpen) {
            setSearchTerm('');
          }
        }}
        closeOnClickOutside={true}
        closeOnEscape={true}
        position="bottom-start"
        offset={4}
        withinPortal={false}
        trapFocus={false}
        shadow="sm"
        transitionProps={{ duration: 0 }}
      >
        <Menu.Target>
          <div style={{ width: '100%' }}>
            {selectedValue && toolRegistry[selectedValue] && !opened ? (
              // Show selected tool in AutomationEntry style when tool is selected and not searching
              <div onClick={handleSearchFocus} style={{ cursor: 'pointer' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--mantine-spacing-sm)',
                  padding: '0 0.5rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}>
                  <div style={{ color: 'var(--mantine-color-text)', fontSize: '1.2rem' }}>
                    {toolRegistry[selectedValue].icon}
                  </div>
                  <Text size="sm" style={{ flex: 1, color: 'var(--mantine-color-text)' }}>
                    {toolRegistry[selectedValue].name}
                  </Text>
                </div>
              </div>
            ) : (
              // Show search input when no tool selected or actively searching
              <ToolSearch
                value={searchTerm}
                onChange={handleSearchChange}
                toolRegistry={filteredToolRegistry}
                mode="filter"
                placeholder={getDisplayValue()}
                hideIcon={true}
                onFocus={handleSearchFocus}
              />
            )}
          </div>
        </Menu.Target>

      <Menu.Dropdown p={0} style={{ minWidth: '16rem' }}>
        <ScrollArea h={350}>
          <Stack gap="sm" p="sm">
            {displayGroups.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" p="md">
                {isSearching
                  ? t('tools.noSearchResults', 'No tools found')
                  : t('tools.noTools', 'No tools available')
                }
              </Text>
            ) : (
              renderedTools
            )}
          </Stack>
        </ScrollArea>
      </Menu.Dropdown>
    </Menu>
    </div>
  );
}
