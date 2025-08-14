import React, { useState, useRef, useEffect, useMemo } from "react";
import { TextInput, Stack, Button, Text, useMantineColorScheme } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { type ToolRegistryEntry } from "../../../data/toolRegistry";
import './ToolPicker.css';

interface ToolSearchProps {
  value: string;
  onChange: (value: string) => void;
  toolRegistry: Readonly<Record<string, ToolRegistryEntry>>;
  onToolSelect?: (toolId: string) => void;
  mode: 'filter' | 'dropdown';
  selectedToolKey?: string | null;
}

const ToolSearch = ({ 
  value, 
  onChange, 
  toolRegistry, 
  onToolSelect, 
  mode = 'filter',
  selectedToolKey 
}: ToolSearchProps) => {
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredTools = useMemo(() => {
    if (!value.trim()) return [];
    return Object.entries(toolRegistry)
      .filter(([id, tool]) => {
        if (mode === 'dropdown' && id === selectedToolKey) return false;
        return tool.name.toLowerCase().includes(value.toLowerCase()) ||
               tool.description.toLowerCase().includes(value.toLowerCase());
      })
      .slice(0, 6)
      .map(([id, tool]) => ({ id, tool }));
  }, [value, toolRegistry, mode, selectedToolKey]);

  const handleSearchChange = (searchValue: string) => {
    onChange(searchValue);
    if (mode === 'dropdown') {
      setDropdownOpen(searchValue.trim().length > 0 && filteredTools.length > 0);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchInput = (
    <div className="search-input-container">
      <span className="material-symbols-rounded search-icon" style={{ color: colorScheme === 'dark' ? '#FFFFFF' : '#6B7382' }}>
        search
      </span>
      <input
        ref={searchRef}
        type="text"
        placeholder={t("toolPicker.searchPlaceholder", "Search tools...")}
        value={value}
        onChange={(e) => handleSearchChange(e.currentTarget.value)}
        autoComplete="off"
        className="search-input-field"
        style={{
          backgroundColor: colorScheme === 'dark' ? '#4B525A' : '#FFFFFF',
          color: colorScheme === 'dark' ? '#FFFFFF' : '#6B7382',
        }}
      />
    </div>
  );

  if (mode === 'filter') {
    return searchInput;
  }

  return (
    <div ref={searchRef} style={{ position: 'relative' }}>
      {searchInput}
      {dropdownOpen && filteredTools.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: 'var(--bg-toolbar)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            marginTop: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          <Stack gap="xs" style={{ padding: '8px' }}>
            {filteredTools.map(({ id, tool }) => (
              <Button
                key={id}
                variant="subtle"
                onClick={() => onToolSelect && onToolSelect(id)}
                leftSection={
                  <div style={{ color: 'var(--tools-text-and-icon-color)' }}>
                    {tool.icon}
                  </div>
                }
                fullWidth
                justify="flex-start"
                style={{
                  borderRadius: '6px',
                  color: 'var(--tools-text-and-icon-color)',
                  padding: '8px 12px'
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 500 }}>{tool.name}</div>
                  <Text size="xs" c="dimmed" style={{ marginTop: '2px' }}>
                    {tool.description}
                  </Text>
                </div>
              </Button>
            ))}
          </Stack>
        </div>
      )}
    </div>
  );
};

export default ToolSearch; 