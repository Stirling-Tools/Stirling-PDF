import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Stack, Text, Group } from '@mantine/core';

const DeepLinks = () => {
  const commonLinks = [
    {
      name: "Split PDF Pages 1-5",
      url: "/?t=split&mode=byPages&p=1-5&v=viewer",
      description: "Split a PDF and extract pages 1-5"
    },
    {
      name: "Compress PDF (High)",
      url: "/?t=compress&level=9&gray=true&v=viewer",
      description: "Compress a PDF with high compression level"
    },
    {
      name: "Merge PDFs",
      url: "/?t=merge&v=fileManager",
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
