import React, { useState } from 'react';
import { Group, Button, Text, ActionIcon, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import SortIcon from '@mui/icons-material/Sort';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface MergeFileSorterProps {
  onSortFiles: (sortType: 'filename' | 'dateModified', ascending: boolean) => void;
  disabled?: boolean;
}

const MergeFileSorter: React.FC<MergeFileSorterProps> = ({
  onSortFiles,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [ascending, setAscending] = useState(true);

  const sortButtons = [
    {
      key: 'filename' as const,
      icon: <SortByAlphaIcon/>,
      label: t('merge.sortBy.filename', 'Sort by Filename'),
    },
    {
      key: 'dateModified' as const,
      icon: <AccessTimeIcon/>,
      label: t('merge.sortBy.dateModified', 'Sort by Date Modified'),
    },
  ];

  const handleSortDirectionToggle = () => {
    setAscending(!ascending);
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t('merge.sortBy.description', "Files will be merged in the order they're selected. Drag to reorder or use the buttons below to sort.")}
      </Text>
      <Group gap="xs">
        {sortButtons.map(({ key, icon, label }) => (
          <Button
            key={key}
            variant="light"
            size="xs"
            leftSection={icon}
            onClick={() => onSortFiles(key, ascending)}
            disabled={disabled}
          >
            {label}
          </Button>
        ))}

        <ActionIcon
          variant="light"
          size="sm"
          onClick={handleSortDirectionToggle}
          disabled={disabled}
          title={ascending ? t('merge.sortBy.ascending', 'Ascending') : t('merge.sortBy.descending', 'Descending')}
        >
          {ascending ? <ArrowUpwardIcon/> : <ArrowDownwardIcon/>}
        </ActionIcon>
      </Group>
    </Stack>
  );
};

export default MergeFileSorter;
