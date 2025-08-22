import React from 'react';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const NoToolsFound: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <Text c="dimmed" size="sm" p="sm">
      {t("toolPicker.noToolsFound", "No tools found")}
    </Text>
  );
};

export default NoToolsFound;
