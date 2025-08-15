import React from 'react';
import { Stack, Text, Divider, Card, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSuggestedTools } from '../../../hooks/useSuggestedTools';
export interface SuggestedToolsSectionProps {}

export function SuggestedToolsSection(): React.ReactElement {
  const { t } = useTranslation();
  const suggestedTools = useSuggestedTools();

  return (
    <Stack gap="md">
      <Divider />
      
      <Text size="lg" fw={600}>
        {t('editYourNewFiles', 'Edit your new File(s)')}
      </Text>

      <Stack gap="xs">
        {suggestedTools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Card
              key={tool.name}
              p="sm"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={tool.navigate}
            >
              <Group gap="xs">
                <IconComponent fontSize="small" />
                <Text size="sm" fw={500}>
                  {tool.title}
                </Text>
              </Group>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}