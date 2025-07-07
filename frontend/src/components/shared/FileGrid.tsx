import React, { useState } from "react";
import { Box, Flex, Group, Text, Button, TextInput, Select, Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SearchIcon from "@mui/icons-material/Search";
import SortIcon from "@mui/icons-material/Sort";
import FileCard from "../fileManagement/FileCard";
import { FileWithUrl } from "../../types/file";

interface FileGridProps {
  files: FileWithUrl[];
  onRemove?: (index: number) => void;
  onDoubleClick?: (file: FileWithUrl) => void;
  onView?: (file: FileWithUrl) => void;
  onEdit?: (file: FileWithUrl) => void;
  onSelect?: (fileId: string) => void;
  selectedFiles?: string[];
  showSearch?: boolean;
  showSort?: boolean;
  maxDisplay?: number; // If set, shows only this many files with "Show All" option
  onShowAll?: () => void;
  showingAll?: boolean;
}

type SortOption = 'date' | 'name' | 'size';

const FileGrid = ({
  files,
  onRemove,
  onDoubleClick,
  onView,
  onEdit,
  onSelect,
  selectedFiles = [],
  showSearch = false,
  showSort = false,
  maxDisplay,
  onShowAll,
  showingAll = false
}: FileGridProps) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('date');

  // Filter files based on search term
  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort files
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return (b.lastModified || 0) - (a.lastModified || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'size':
        return (b.size || 0) - (a.size || 0);
      default:
        return 0;
    }
  });

  // Apply max display limit if specified
  const displayFiles = maxDisplay && !showingAll
    ? sortedFiles.slice(0, maxDisplay)
    : sortedFiles;

  const hasMoreFiles = maxDisplay && !showingAll && sortedFiles.length > maxDisplay;

  return (
    <Box >
      {/* Search and Sort Controls */}
      {(showSearch || showSort) && (
        <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
          {showSearch && (
            <TextInput
              placeholder={t("fileManager.searchFiles", "Search files...")}
              leftSection={<SearchIcon size={16} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.currentTarget.value)}
              style={{ flexGrow: 1, maxWidth: 300, minWidth: 200 }}
            />
          )}

          {showSort && (
            <Select
              data={[
                { value: 'date', label: t("fileManager.sortByDate", "Sort by Date") },
                { value: 'name', label: t("fileManager.sortByName", "Sort by Name") },
                { value: 'size', label: t("fileManager.sortBySize", "Sort by Size") }
              ]}
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              leftSection={<SortIcon size={16} />}
              style={{ minWidth: 150 }}
            />
          )}
        </Group>
      )}

      {/* File Count Badge */}3
            gap: 'md'
          }
        }}
        h="30rem" style={{ overflowY: "auto", width: "100%" }}
      >
        {displayFiles.map((file, idx) => {
          const originalIdx = files.findIndex(f => (f.id || f.name) === (file.id || file.name));
          return (
            <FileCard
              key={file.id || file.name + idx}
              file={file}
              onRemove={onRemove ? () => onRemove(originalIdx) : undefined}
              onDoubleClick={onDoubleClick ? () => onDoubleClick(file) : undefined}
              onView={onView ? () => onView(file) : undefined}
              onEdit={onEdit ? () => onEdit(file) : undefined}
              isSelected={selectedFiles.includes(file.id || file.name)}
              onSelect={onSelect ? () => onSelect(file.id || file.name) : undefined}
            />
          );
        })}
      </Flex>

      {/* Show All Button */}
      {hasMoreFiles && onShowAll && (
        <Group justify="center" mt="md">
          <Button
            variant="light"
            onClick={onShowAll}
          >
            {t("fileManager.showAll", "Show All")} ({sortedFiles.length} files)
          </Button>
        </Group>
      )}

      {/* Empty State */}
      {displayFiles.length === 0 && (
        <Box style={{ textAlign: 'center', padding: '2rem' }}>
          <Text c="dimmed">
            {searchTerm
              ? t("fileManager.noFilesFound", "No files found matching your search")
              : t("fileManager.noFiles", "No files available")
            }
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default FileGrid;
