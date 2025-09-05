import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, Stack } from '@mantine/core';
import WarningIcon from '@mui/icons-material/Warning';
import { ToolDefinition } from '../shared/toolDefinition';

interface DefinitionBasedToolConfigProps {
  definition: ToolDefinition<unknown>;
  parameters: Record<string, unknown>;
  onParameterChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

/**
 * Component that renders tool settings from a ToolDefinition
 * This allows automation to work with definition-based tools automatically
 */
export default function DefinitionBasedToolConfig({
  definition,
  parameters,
  onParameterChange,
  disabled = false
}: DefinitionBasedToolConfigProps) {
  const { t } = useTranslation();

  // Get steps from definition (handle both static and dynamic)
  const stepDefinitions = typeof definition.steps === 'function'
    ? definition.steps(parameters, true, false) // hasFiles = true, hasResults = false (automation context)
    : definition.steps;

  // Show all steps that aren't explicitly hidden
  const visibleSteps = stepDefinitions.filter((stepDef) => {
    return stepDef.isVisible !== false; // Show unless explicitly set to false (not a function)
  });

  if (visibleSteps.length === 0) {
    return (
      <Alert icon={<WarningIcon />} color="orange">
        <Text size="sm">
          {t('automate.config.noSettings', 'This tool does not have configurable settings.')}
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {visibleSteps.map((stepDef) => (
        <div key={stepDef.key}>
          <Text size="sm" fw={500} mb="xs">
            {stepDef.title(t)}
          </Text>
          <stepDef.component
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </div>
      ))}
    </Stack>
  );
}
