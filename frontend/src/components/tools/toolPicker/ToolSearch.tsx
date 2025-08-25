import React, { useState, useRef, useEffect, useMemo } from "react";
import { Stack, Button, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from '../../shared/LocalIcon';
import { ToolRegistryEntry } from "../../../data/toolsTaxonomy";
import { TextInput } from "../../shared/TextInput";
import './ToolPicker.css';

interface ToolSearchProps {
  value: string;
  onChange: (value: string) => void;
  toolRegistry: Readonly<Record<string, ToolRegistryEntry>>;
  onToolSelect?: (toolId: string) => void;
  mode: 'filter' | 'dropdown';
  selectedToolKey?: string | null;
  placeholder?: string;
  hideIcon?: boolean;
  onFocus?: () => void;
}

const ToolSearch = ({
  value,
  onChange,
  toolRegistry,
  onToolSelect,
  mode = 'filter',
  selectedToolKey,
  placeholder,
  hideIcon = false,
  onFocus
}: ToolSearchProps) => {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      if (
        searchRef.current &&
        dropdownRef.current &&
        !searchRef.current.contains(event.target as Node) &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchInput = (
    <div className="search-input-container">
      <TextInput
        ref={searchRef}
        value={value}
        onChange={handleSearchChange}
        placeholder={placeholder || t("toolPicker.searchPlaceholder", "Search tools...")}
        icon={hideIcon ? undefined : <LocalIcon icon="search-rounded" width="24" height="24" />}
        autoComplete="off"

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
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: '6px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          <Stack gap="xs" style={{ padding: '8px' }}>
            {filteredTools.map(({ id, tool }) => (
              <Button
                key={id}
                variant="subtle"
                onClick={() => {
                  onToolSelect && onToolSelect(id);
                  setDropdownOpen(false);
                }}
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
