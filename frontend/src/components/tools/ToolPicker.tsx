import React, { useState, useMemo } from "react";
import { Box, Text, Stack, Button, TextInput, Group, Tooltip, Collapse, ActionIcon } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SearchIcon from "@mui/icons-material/Search";
import { baseToolRegistry } from "../../data/toolRegistry";
import "./ToolPicker.css";

type Tool = {
  icon: React.ReactNode;
  name: string;
  description: string;
};

type ToolRegistry = {
  [id: string]: Tool;
};

interface ToolPickerProps {
  selectedToolKey: string | null;
  onSelect: (id: string) => void;
  toolRegistry: ToolRegistry;
}

interface GroupedTools {
  [category: string]: {
    [subcategory: string]: Array<{ id: string; tool: Tool }>;
  };
}

const ToolPicker = ({ selectedToolKey, onSelect, toolRegistry }: ToolPickerProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Group tools by category and subcategory in a single pass - O(n)
  const groupedTools = useMemo(() => {
    const grouped: GroupedTools = {};

    Object.entries(toolRegistry).forEach(([id, tool]) => {
      // Get category and subcategory from the base registry
      const baseTool = baseToolRegistry[id as keyof typeof baseToolRegistry];
      const category = baseTool?.category || "Other";
      const subcategory = baseTool?.subcategory || "General";

      if (!grouped[category]) {
        grouped[category] = {};
      }
      if (!grouped[category][subcategory]) {
        grouped[category][subcategory] = [];
      }

      grouped[category][subcategory].push({ id, tool });
    });

    return grouped;
  }, [toolRegistry]);

  // Sort categories in custom order and subcategories alphabetically - O(c * s * log(s))
  const sortedCategories = useMemo(() => {
    const categoryOrder = ['RECOMMENDED TOOLS', 'STANDARD TOOLS', 'ADVANCED TOOLS'];

    return Object.entries(groupedTools)
      .map(([category, subcategories]) => ({
        category,
        subcategories: Object.entries(subcategories)
          .sort(([a], [b]) => a.localeCompare(b)) // Sort subcategories alphabetically
          .map(([subcategory, tools]) => ({
            subcategory,
            tools: tools.sort((a, b) => a.tool.name.localeCompare(b.tool.name)) // Sort tools alphabetically
          }))
      }))
      .sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a.category.toUpperCase());
        const bIndex = categoryOrder.indexOf(b.category.toUpperCase());
        return aIndex - bIndex;
      });
  }, [groupedTools, t]);

  // Filter tools based on search - O(n)
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return sortedCategories;

    return sortedCategories.map(({ category, subcategories }) => ({
      category,
      subcategories: subcategories.map(({ subcategory, tools }) => ({
        subcategory,
        tools: tools.filter(({ tool }) =>
          tool.name.toLowerCase().includes(search.toLowerCase()) ||
          tool.description.toLowerCase().includes(search.toLowerCase())
        )
      })).filter(({ tools }) => tools.length > 0)
    })).filter(({ subcategories }) => subcategories.length > 0);
  }, [sortedCategories, search, t]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const renderToolButton = (id: string, tool: Tool, index: number) => (
    <Tooltip
      key={id}
      label={tool.description}
      position="right"
      withArrow
      openDelay={500}
    >
      <Button
        variant={selectedToolKey === id ? "filled" : "subtle"}
        onClick={() => onSelect(id)}
        size="md"
        radius="md"
        leftSection={tool.icon}
        fullWidth
        justify="flex-start"
        style={{ borderRadius: '0' }}
      >
        <span style={{ marginRight: '8px', opacity: 0.6, fontSize: '0.8em' }}>
          {index + 1}.
        </span>
        {tool.name}
      </Button>
    </Tooltip>
  );

  return (
    <Box style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-toolbar)',
      padding: '0'
    }}>
        <TextInput
          placeholder={t("toolPicker.searchPlaceholder", "Search tools...")}
          value={search}
          radius="md"
          onChange={(e) => setSearch(e.currentTarget.value)}
          autoComplete="off"
          className="search-input rounded-lg"
          leftSection={<SearchIcon sx={{ fontSize: 16, color: 'var(--search-text)' }} />}
        />
      <Box
        className="tool-picker-scrollable"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
          maxHeight: 'calc(100vh - 200px)'
        }}
      >
        <Stack align="flex-start" gap="xs">
          {filteredCategories.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t("toolPicker.noToolsFound", "No tools found")}
            </Text>
          ) : (
            filteredCategories.map(({ category, subcategories }) => (
              <Box key={category} style={{ width: '100%' }}>
                {/* Category Header */}
                <Button
                  variant="subtle"
                  onClick={() => toggleCategory(category)}
                  rightSection={
                    <div style={{
                      transition: 'transform 0.2s ease',
                      transform: expandedCategories.has(category) ? 'rotate(90deg)' : 'rotate(0deg)'
                    }}>
                      <ChevronRightIcon sx={{ fontSize: 16, color: 'var(--text-primary)' }} />
                    </div>
                  }
                  fullWidth
                  justify="space-between"
                  style={{
                    fontWeight: 'bold',
                    backgroundColor: 'var(--bg-toolbar)',
                    marginBottom: '0',
                    borderTop: '1px solid var(--border-default)',
                    borderBottom: '1px solid var(--border-default)',
                    borderRadius: '0',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)'
                  }}
                >
                  {category.toUpperCase()}
                </Button>

                {/* Subcategories */}
                <Collapse in={expandedCategories.has(category)}>
                  <Stack gap="xs" style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
                    {subcategories.map(({ subcategory, tools }) => (
                      <Box key={subcategory}>
                        {/* Subcategory Header (only show if there are multiple subcategories) */}
                        {subcategories.length > 1 && (
                          <Text
                            size="sm"
                            fw={500}
                            style={{
                              marginBottom: '4px',
                              textTransform: 'uppercase',
                              fontSize: '0.75rem',
                              borderBottom: '1px solid var(--border-default)',
                              paddingBottom: '0.5rem',
                              marginLeft: '1rem',
                              marginRight: '1rem',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            {subcategory}
                          </Text>
                        )}

                        {/* Tools in this subcategory */}
                        <Stack gap="xs">
                          {tools.map(({ id, tool }, index) =>
                            renderToolButton(id, tool, index)
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            ))
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default ToolPicker;
