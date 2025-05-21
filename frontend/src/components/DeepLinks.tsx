import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Stack, Text, Group } from '@mantine/core';

const DeepLinks: React.FC = () => {
  const commonLinks = [
    {
      name: "Split PDF Pages 1-5",
      url: "/?tool=split&splitMode=byPages&pages=1-5&view=viewer",
      description: "Split a PDF and extract pages 1-5"
    },
    {
      name: "Compress PDF (High)",
      url: "/?tool=compress&level=9&grayscale=true&view=viewer",
      description: "Compress a PDF with high compression level"
    },
    {
      name: "Merge PDFs",
      url: "/?tool=merge&view=fileManager",
      description: "Combine multiple PDF files into one"
    }
  ];

  return (
    <Stack>
      <Text fw={500}>Common PDF Operations</Text>
      {commonLinks.map((link, index) => (
        <Group key={index}>
          <Button
            component={Link}
            to={link.url}
            variant="subtle"
            size="sm"
          >
            {link.name}
          </Button>
          <Text size="sm" color="dimmed">{link.description}</Text>
        </Group>
      ))}
    </Stack>
  );
};

export default DeepLinks;
