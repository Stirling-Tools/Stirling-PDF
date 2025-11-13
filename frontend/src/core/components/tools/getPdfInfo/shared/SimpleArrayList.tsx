import React from 'react';
import { Stack, Text } from '@mantine/core';

interface SimpleArrayListProps {
  arr?: any[] | null;
  emptyLabel?: string;
}

const SimpleArrayList: React.FC<SimpleArrayListProps> = ({ arr, emptyLabel }) => {
  if (!arr || arr.length === 0) {
    return <Text size="sm" c="dimmed">{emptyLabel ?? 'None detected'}</Text>;
  }
  return (
    <Stack gap={4}>
      {arr.map((item, idx) => (
        <Text key={idx} size="sm" c="dimmed">
          {typeof item === 'string' ? item : JSON.stringify(item)}
        </Text>
      ))}
    </Stack>
  );
};

export default SimpleArrayList;


