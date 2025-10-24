import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Text, ScrollArea } from '@mantine/core';
import { AutomateToolId, AutomateToolRegistry, isAutomateToolId } from '../../../types/automation';
import { useToolSections } from '../../../hooks/useToolSections';
import { renderToolButtons } from '../shared/renderToolButtons';
import ToolSearch from '../toolPicker/ToolSearch';
import ToolButton from '../toolPicker/ToolButton';
import { ToolId } from '../../../types/toolId';
import { Entry } from 'type-fest';

type AutomateToolEntry = Entry<AutomateToolRegistry>;

interface ToolSelectorProps {
  onSelect: (toolKey: AutomateToolId) => void;
  toolRegistry: AutomateToolRegistry; // Pass registry as prop to break circular dependency
  selectedValue?: AutomateToolId; // For showing current selection when editing existing tool
  placeholder?: string; // Custom placeholder text
}

export default function ToolSelector({
  onSelect,
  toolRegistry,
  selectedValue,
  placeholder
}: ToolSelectorProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Collect all automatable tools that exist in the registry
  const registryEntries = useMemo(
    () => Object.entries(toolRegistry) as AutomateToolEntry[],
    [toolRegistry]
  );

  // Apply search filter
  const filteredTools = useMemo(() => {
    if (!searchTerm.trim()) {
      return registryEntries;
    }

    const lowercaseSearch = searchTerm.toLowerCase();
    return registryEntries.filter(([key, tool]) => {
      return (
        tool.name.toLowerCase().includes(lowercaseSearch) ||
        tool.description?.toLowerCase().includes(lowercaseSearch) ||
        key.toLowerCase().includes(lowercaseSearch)
      );
    });
  }, [registryEntries, searchTerm]);

  // Create filtered tool registry for ToolSearch
  const filteredToolRegistry = useMemo<Partial<AutomateToolRegistry>>(() => {
    const registry: Partial<AutomateToolRegistry> = {};
    registryEntries.forEach(([key, tool]) => {
      registry[key] = tool;
    });
    return registry;
  }, [registryEntries]);

  // Transform filteredTools to the expected format for useToolSections
  const transformedFilteredTools = useMemo(() => {
    return filteredTools.map((entry) => ({ item: entry }));
  }, [filteredTools]);

  // Use the same tool sections logic as the main ToolPicker
  const { sections, searchGroups } = useToolSections<AutomateToolId>(transformedFilteredTools, searchTerm);

  // Determine what to display: search results or organized sections
  const isSearching = searchTerm.trim().length > 0;
  const displayGroups = useMemo(() => {
    if (isSearching) {
      return searchGroups || [];
    }

    // Find the "all" section which contains all tools without duplicates
    const allSection = sections.find(s => s.key === 'all');
    return allSection?.subcategories || [];
  }, [isSearching, searchGroups, sections]);

  const handleToolSelect = useCallback((toolKey: ToolId) => {
    if (!isAutomateToolId(toolKey)) {
      return;
    }
    onSelect(toolKey);
    setOpened(false);
    setSearchTerm(''); // Clear search to show the selected tool display
  }, [onSelect]);

  const renderedTools = useMemo(
    () =>
      displayGroups.map((subcategory) =>
        renderToolButtons<AutomateToolId>(t, subcategory, selectedValue ?? null, handleToolSelect, !isSearching, true)
      ),
    [displayGroups, handleToolSelect, isSearching, selectedValue, t]
  );

  const handleSearchFocus = () => {
    setOpened(true);
    setShouldAutoFocus(true); // Request auto-focus for the input
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpened(false);
        setSearchTerm('');
      }
    };

    if (opened) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
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
  const selectedTool = selectedValue ? toolRegistry[selectedValue] : undefined;

  const getDisplayValue = () => {
    if (selectedTool) return selectedTool.name;
    return placeholder || t('automate.creation.tools.add', 'Add a tool...');
  };

  return (
    <div ref={containerRef} className='rounded-xl'>
      {/* Always show the target - either selected tool or search input */}

        {selectedValue && selectedTool && !opened ? (
          // Show selected tool in AutomationEntry style when tool is selected and dropdown closed
          <div onClick={handleSearchFocus} style={{ cursor: 'pointer',
           borderRadius: "var(--mantine-radius-lg)" }}>
            <ToolButton
              id={selectedValue}
              tool={selectedTool}
              isSelected={false}
              onSelect={() => {}}
              rounded={true}
              disableNavigation={true}
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
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-sm)',
            boxShadow: 'var(--mantine-shadow-sm)',
            marginTop: '4px',
            minWidth: '16rem'
          }}
        >
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
        </div>
      )}
    </div>
  );
}
