import React from 'react';
import { Container, Stack, Text, Button } from '@mantine/core';
import FolderIcon from '@mui/icons-material/FolderRounded';
import { useFilesModalContext } from '../../contexts/FilesModalContext';

interface LandingPageProps {
  title: string;
}

const LandingPage = ({ title }: LandingPageProps) => {
  const { openFilesModal } = useFilesModalContext();
  return (
    <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Stack align="center" gap="lg">
        <Text size="xl" fw={500} c="dimmed">
          {title}
        </Text>
        <Button
          leftSection={<FolderIcon />}
          size="lg"
          onClick={openFilesModal}
        >
          Open Files
        </Button>
      </Stack>
    </Container>
  );
};

export default LandingPage;