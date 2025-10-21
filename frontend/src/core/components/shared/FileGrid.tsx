import { useState } from "react";
import { Box, Flex, Group, Text, Button, TextInput, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SearchIcon from "@mui/icons-material/Search";
import SortIcon from "@mui/icons-material/Sort";
import FileCard from "@app/components/shared/FileCard";
import { StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/file";

interface FileGridProps {
  files: Array<{ file: File; record?: StirlingFileStub }>;
  onRemove?: (index: number) => void;
  onDoubleClick?: (item: { file: File; record?: StirlingFileStub }) => void;
  onView?: (item: { file: File; record?: StirlingFileStub }) => void;
  onEdit?: (item: { file: File; record?: StirlingFileStub }) => void;
  onSelect?: (fileId: FileId) => void;
  selectedFiles?: FileId[];
  showSearch?: boolean;
  showSort?: boolean;
  maxDisplay?: number; // If set, shows only this many files with "Show All" option
  onShowAll?: () => void;
  showingAll?: boolean;
  onDeleteAll?: () => void;
  isFileSupported?: (fileName: string) => boolean; // Function to check if file is supported
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
  showingAll = false,
  onDeleteAll,
  isFileSupported
}: FileGridProps) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('date');

  // Filter files based on search term
  const filteredFiles = files.filter(item =>
    item.file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort files
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return (b.file.lastModified || 0) - (a.file.lastModified || 0);
      case 'name':
        return a.file.name.localeCompare(b.file.name);
      case 'size':
        return (b.file.size || 0) - (a.file.size || 0);
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
      {(showSearch || showSort || onDeleteAll) && (
        <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm">
            {showSearch && (
              <TextInput
                placeholder={t("fileManager.searchFiles", "Search files...")}
                leftSection={<SearchIcon fontSize="small" />}
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
                leftSection={<SortIcon fontSize="small" />}
                style={{ minWidth: 150 }}
              />
            )}
          </Group>

          {onDeleteAll && (
            <Button
              color="red"
              size="sm"
              onClick={onDeleteAll}
            >
              {t("fileManager.deleteAll", "Delete All")}
            </Button>
          )}
        </Group>
      )}

      {/* File Grid */}
      <Flex
        direction="row"
        wrap="wrap"
        gap="md"
        h="30rem"
        style={{ overflowY: "auto", width: "100%" }}
      >
        {displayFiles
          .filter(item => {
            if (!item.record?.id) {
              console.error('FileGrid: File missing StirlingFileStub with proper ID:', item.file.name);
              return false;
            }
            return true;
          })
          .map((item, idx) => {
          const fileId = item.record!.id; // Safe to assert after filter
          const originalIdx = files.findIndex(f => f.record?.id === fileId);
          const supported = isFileSupported ? isFileSupported(item.file.name) : true;
          return (
            <FileCard
              key={fileId + idx}
              file={item.file}
              fileStub={item.record}
              onRemove={onRemove ? () => onRemove(originalIdx) : () => {}}
              onDoubleClick={onDoubleClick && supported ? () => onDoubleClick(item) : undefined}
              onView={onView && supported ? () => onView(item) : undefined}
              onEdit={onEdit && supported ? () => onEdit(item) : undefined}
              isSelected={selectedFiles.includes(fileId)}
              onSelect={onSelect && supported ? () => onSelect(fileId) : undefined}
              isSupported={supported}
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
