import React from 'react';
import { Stack, Text, Divider } from '@mantine/core';

interface SectionBlockProps {
  title: string;
  anchorId: string;
  children: React.ReactNode;
}

const SectionBlock: React.FC<SectionBlockProps> = ({ title, anchorId, children }) => {
  return (
    <Stack gap="sm" id={anchorId}>
      <Text fw={700} size="lg">{title}</Text>
      <Divider />
      {children}
    </Stack>
  );
};

export default SectionBlock;


