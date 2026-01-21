import React, { useState } from 'react';
import { Group, Button, Text, ActionIcon, Stack, Select } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface MergeFileSorterProps {
  onSortFiles: (sortType: 'filename' | 'dateModified', ascending: boolean) => void;
  disabled?: boolean;
}

const MergeFileSorter: React.FC<MergeFileSorterProps> = ({
  onSortFiles,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [sortType, setSortType] = useState<'filename' | 'dateModified'>('filename');
  const [ascending, setAscending] = useState(true);

  const sortOptions = [
    { value: 'filename', label: t('merge.sortBy.filename', 'File Name') },
    { value: 'dateModified', label: t('merge.sortBy.dateModified', 'Date Modified') },
  ];

  const handleSort = () => {
    onSortFiles(sortType, ascending);
  };

  const handleDirectionToggle = () => {
    setAscending(!ascending);
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t('merge.sortBy.description', "Files will be merged in the order they're selected. Drag to reorder or sort below.")}
      </Text>
      <Stack gap="xs">
        <Group gap="xs" align="end" justify="space-between">
          <Select
            data={sortOptions}
            value={sortType}
            onChange={(value) => setSortType(value as 'filename' | 'dateModified')}
            disabled={disabled}
            label={t('merge.sortBy.label', 'Sort By')}
            size='xs'
            style={{ flex: 1 }}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
          />

          <ActionIcon
            variant="light"
            size="md"
            onClick={handleDirectionToggle}
            disabled={disabled}
            title={ascending ? t('merge.sortBy.ascending', 'Ascending') : t('merge.sortBy.descending', 'Descending')}
          >
            {ascending ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
          </ActionIcon>
        </Group>

        <Button
          variant="light"
          size="xs"
          leftSection={<SortIcon />}
          onClick={handleSort}
          disabled={disabled}
          fullWidth
        >
          {t('merge.sortBy.sort', 'Sort')}
        </Button>
      </Stack>
    </Stack>
  );
};

export default MergeFileSorter;
