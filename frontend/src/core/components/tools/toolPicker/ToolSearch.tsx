import { useState, useRef, useEffect, useMemo } from "react";
import { Stack, Button, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from '@app/components/shared/LocalIcon';
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { TextInput } from "@app/components/shared/TextInput";
import "@app/components/tools/toolPicker/ToolPicker.css";
import { ToolId } from "@app/types/toolId";
import { parseSubToolId, SubToolId } from "@app/types/subtool";
import { filterToolRegistryWithSubTools } from "@app/utils/toolSearch";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { Tooltip } from "@app/components/shared/Tooltip";

interface ToolSearchProps {
  value: string;
  onChange: (value: string) => void;
  toolRegistry: Partial<Record<ToolId, ToolRegistryEntry>>;
  onToolSelect?: (toolId: ToolId) => void;
  mode: "filter" | "dropdown" | "unstyled";
  selectedToolKey?: string | null;
  placeholder?: string;
  hideIcon?: boolean;
  onFocus?: () => void;
  autoFocus?: boolean;
  conversionEndpointStatus?: Record<string, boolean>;
  conversionEndpointsLoading?: boolean;
}

const ToolSearch = ({
  value,
  onChange,
  toolRegistry,
  onToolSelect,
  mode = "filter",
  selectedToolKey,
  placeholder,
  hideIcon = false,
  onFocus,
  autoFocus = false,
  conversionEndpointStatus,
  conversionEndpointsLoading,
}: ToolSearchProps) => {
  const { t } = useTranslation();
  const {
    conversionEndpointStatus: workflowConversionStatus,
    conversionEndpointsLoading: workflowConversionLoading
  } = useToolWorkflow();
  const effectiveEndpointStatus = conversionEndpointStatus ?? workflowConversionStatus;
  const effectiveEndpointsLoading = conversionEndpointsLoading ?? workflowConversionLoading;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredTools = useMemo(() => {
    if (!value.trim()) return [];

    // Filter out selected tool if in dropdown mode
    const filteredRegistry = mode === "dropdown"
      ? Object.fromEntries(Object.entries(toolRegistry).filter(([id]) => id !== selectedToolKey))
      : toolRegistry;

    // Use enhanced search with sub-tools
    const ranked = filterToolRegistryWithSubTools(
      filteredRegistry,
      value,
      t,
      effectiveEndpointStatus,
      effectiveEndpointsLoading
    );

    // Limit total results to avoid overwhelming UI
    return ranked.slice(0, 12);
  }, [value, toolRegistry, mode, selectedToolKey, t, effectiveEndpointStatus, effectiveEndpointsLoading]);

  const handleSearchChange = (searchValue: string) => {
    onChange(searchValue);
    if (mode === "dropdown") {
      setDropdownOpen(searchValue.trim().length > 0 && filteredTools.length > 0);
    }
  };

  const handleSubToolSelect = (subToolId: string) => {
    const { parentId, params } = parseSubToolId(subToolId as SubToolId);
    const [from, to] = params.split('-to-');

    // Navigate to parent tool
    onToolSelect?.(parentId);

    // Set URL params for pre-selection
    const searchParams = new URLSearchParams({ from, to });
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?${searchParams.toString()}`
    );

    setDropdownOpen(false);
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-focus the input when requested
  useEffect(() => {
    if (autoFocus && searchRef.current) {
      setTimeout(() => {
        searchRef.current?.focus();
      }, 10);
    }
  }, [autoFocus]);

  const searchInput = (
      <TextInput
        id="tool-search-input"
        name="tool-search-input"
        ref={searchRef}
        value={value}
        onChange={handleSearchChange}
        placeholder={placeholder || t("toolPicker.searchPlaceholder", "Search tools...")}
        icon={hideIcon ? undefined : <LocalIcon icon="search-rounded" width="1.5rem" height="1.5rem" />}
        autoComplete="off"
        onFocus={onFocus}
      />
  );

  if (mode === "filter") {
    return <div className="search-input-container">{searchInput}</div>;
  }

  if (mode === "unstyled") {
    return searchInput;
  }

  return (
    <div ref={searchRef} style={{ position: "relative" }}>
      {searchInput}
      {dropdownOpen && filteredTools.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: "var(--mantine-color-body)",
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "6px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          <Stack gap="xs" style={{ padding: "8px" }}>
            {filteredTools.map(({ type, item: [id, entry] }) => {
              const isSubTool = type === 'subtool';
              const displayEntry = entry as any;
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
                  key={id}
                  variant="subtle"
                  aria-disabled={!available}
                  onClick={() => {
                    if (!available) return;
                    if (isSubTool) {
                      handleSubToolSelect(id as string);
                    } else {
                      onToolSelect?.(id as ToolId);
                      setDropdownOpen(false);
                    }
                  }}
                  leftSection={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: isSubTool ? '8px' : '0',
                        color: "var(--tools-text-and-icon-color)"
                      }}
                    >
                      {isSubTool && (
                        <LocalIcon
                          icon="subdirectory-arrow-right"
                          width="1rem"
                          height="1rem"
                          style={{ marginRight: '4px', opacity: 0.6 }}
                        />
                      )}
                      {displayEntry.icon}
                    </div>
                  }
                  fullWidth
                  justify="flex-start"
                  style={{
                    borderRadius: "6px",
                    color: "var(--tools-text-and-icon-color)",
                    padding: "8px 12px",
                    paddingLeft: isSubTool ? '4px' : '12px',
                    cursor: available ? undefined : 'not-allowed',
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: isSubTool ? 400 : 500, opacity: available ? 1 : 0.4 }}>
                      {displayEntry.name}
                    </div>
                    {!isSubTool && displayEntry.description && (
                      <Text size="xs" c="dimmed" style={{ marginTop: "2px", opacity: available ? 1 : 0.4 }}>
                        {displayEntry.description}
                      </Text>
                    )}
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
        </div>
      )}
    </div>
  );
};

export default ToolSearch;
