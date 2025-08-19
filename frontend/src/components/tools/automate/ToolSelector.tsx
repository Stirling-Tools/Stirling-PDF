import React, { useState, useMemo } from 'react';
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

  const handleToolSelect = (toolKey: string) => {
    onSelect(toolKey);
    setOpened(false);
    setSearchTerm('');
  };

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
    <Menu 
      opened={opened} 
      onChange={setOpened}
      width="300px"
      position="bottom-start"
      withinPortal
    >
      <Menu.Target>
        <div onClick={handleSearchFocus} style={{ cursor: 'text' }}>
          <ToolSearch
            value={searchTerm}
            onChange={handleSearchChange}
            toolRegistry={filteredToolRegistry}
            mode="filter"
            placeholder={getDisplayValue()}
            hideIcon={true}
          />
        </div>
      </Menu.Target>

      <Menu.Dropdown p={0}>
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
              displayGroups.map((subcategory) => 
                renderToolButtons(subcategory, null, handleToolSelect, !isSearching)
              )
            )}
          </Stack>
        </ScrollArea>
      </Menu.Dropdown>
    </Menu>
  );
}