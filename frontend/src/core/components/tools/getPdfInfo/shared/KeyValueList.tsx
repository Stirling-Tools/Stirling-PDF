import React from 'react';
import { Group, Stack, Text } from '@mantine/core';

interface KeyValueListProps {
  obj?: Record<string, unknown> | null;
  emptyLabel?: string;
}

const KeyValueList: React.FC<KeyValueListProps> = ({ obj, emptyLabel }) => {
  if (!obj || Object.keys(obj).length === 0) {
    return <Text size="sm" c="dimmed">{emptyLabel ?? 'None detected'}</Text>;
  }
  return (
    <Stack gap={6}>
      {Object.entries(obj).map(([k, v]) => (
        <Group key={k} wrap="nowrap" align="flex-start" style={{ width: '100%' }}>
          <Text size="sm" style={{ minWidth: 180, maxWidth: 180, flexShrink: 0 }}>{k}</Text>
          <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', flex: 1 }}>
            {v == null ? '' : String(v)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
};

export default KeyValueList;


