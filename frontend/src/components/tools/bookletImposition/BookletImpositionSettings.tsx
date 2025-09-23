import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Divider, Collapse, Button, NumberInput } from "@mantine/core";
import { BookletImpositionParameters } from "../../../hooks/tools/bookletImposition/useBookletImpositionParameters";
import ButtonSelector from "../../shared/ButtonSelector";

interface BookletImpositionSettingsProps {
  parameters: BookletImpositionParameters;
  onParameterChange: (key: keyof BookletImpositionParameters, value: any) => void;
  disabled?: boolean;
}

const BookletImpositionSettings = ({ parameters, onParameterChange, disabled = false }: BookletImpositionSettingsProps) => {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Stack gap="md">
      <Divider ml='-md'></Divider>


      {/* Double Sided */}
      <Stack gap="sm">
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--mantine-spacing-xs)' }}
          title={t('bookletImposition.doubleSided.tooltip', 'Creates both front and back sides for proper booklet printing')}
        >
          <input
            type="checkbox"
            checked={parameters.doubleSided}
            onChange={(e) => {
              const isDoubleSided = e.target.checked;
              onParameterChange('doubleSided', isDoubleSided);
              // Reset to BOTH when turning double-sided back on
              if (isDoubleSided) {
                onParameterChange('duplexPass', 'BOTH');
              } else {
                // Default to FIRST pass when going to manual duplex
                onParameterChange('duplexPass', 'FIRST');
              }
            }}
            disabled={disabled}
          />
          <Text size="sm">{t('bookletImposition.doubleSided.label', 'Double-sided printing')}</Text>
        </label>

        {/* Manual Duplex Pass Selection - only show when double-sided is OFF */}
        {!parameters.doubleSided && (
          <Stack gap="xs" ml="lg">
            <Text size="sm" fw={500} c="orange">
              {t('bookletImposition.manualDuplex.title', 'Manual Duplex Mode')}
            </Text>
            <Text size="xs" c="dimmed">
              {t('bookletImposition.manualDuplex.instructions', 'For printers without automatic duplex. You\'ll need to run this twice:')}
            </Text>

            <ButtonSelector
              label={t('bookletImposition.duplexPass.label', 'Print Pass')}
              value={parameters.duplexPass}
              onChange={(value) => onParameterChange('duplexPass', value)}
              options={[
                { value: 'FIRST', label: t('bookletImposition.duplexPass.first', '1st Pass') },
                { value: 'SECOND', label: t('bookletImposition.duplexPass.second', '2nd Pass') }
              ]}
              disabled={disabled}
            />

            <Text size="xs" c="blue" fs="italic">
              {parameters.duplexPass === 'FIRST'
                ? t('bookletImposition.duplexPass.firstInstructions', 'Prints front sides → stack face-down → run again with 2nd Pass')
                : t('bookletImposition.duplexPass.secondInstructions', 'Load printed stack face-down → prints back sides')
              }
            </Text>
          </Stack>
        )}
      </Stack>

      <Divider />

      {/* Advanced Options */}
      <Stack gap="sm">
        <Button
          variant="subtle"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          disabled={disabled}
        >
          {t('bookletImposition.advanced.toggle', 'Advanced Options')} {advancedOpen ? '▲' : '▼'}
        </Button>

        <Collapse in={advancedOpen}>
          <Stack gap="md" mt="md">
            {/* Right-to-Left Binding */}
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--mantine-spacing-xs)' }}
              title={t('bookletImposition.rtlBinding.tooltip', 'For Arabic, Hebrew, or other right-to-left languages')}
            >
              <input
                type="checkbox"
                checked={parameters.spineLocation === 'RIGHT'}
                onChange={(e) => onParameterChange('spineLocation', e.target.checked ? 'RIGHT' : 'LEFT')}
                disabled={disabled}
              />
              <Text size="sm">{t('bookletImposition.rtlBinding.label', 'Right-to-left binding')}</Text>
            </label>

            {/* Add Border Option */}
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--mantine-spacing-xs)' }}
              title={t('bookletImposition.addBorder.tooltip', 'Adds borders around each page section to help with cutting and alignment')}
            >
              <input
                type="checkbox"
                checked={parameters.addBorder}
                onChange={(e) => onParameterChange('addBorder', e.target.checked)}
                disabled={disabled}
              />
              <Text size="sm">{t('bookletImposition.addBorder.label', 'Add borders around pages')}</Text>
            </label>

            {/* Gutter Margin */}
            <Stack gap="xs">
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--mantine-spacing-xs)' }}
                title={t('bookletImposition.addGutter.tooltip', 'Adds inner margin space for binding')}
              >
                <input
                  type="checkbox"
                  checked={parameters.addGutter}
                  onChange={(e) => onParameterChange('addGutter', e.target.checked)}
                  disabled={disabled}
                />
                <Text size="sm">{t('bookletImposition.addGutter.label', 'Add gutter margin')}</Text>
              </label>

              {parameters.addGutter && (
                <NumberInput
                  label={t('bookletImposition.gutterSize.label', 'Gutter size (points)')}
                  value={parameters.gutterSize}
                  onChange={(value) => onParameterChange('gutterSize', value || 12)}
                  min={6}
                  max={72}
                  step={6}
                  disabled={disabled}
                  size="sm"
                />
              )}
            </Stack>

            {/* Flip on Short Edge */}
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--mantine-spacing-xs)' }}
              title={!parameters.doubleSided
                ? t('bookletImposition.flipOnShortEdge.manualNote', 'Not needed in manual mode - you flip the stack yourself')
                : t('bookletImposition.flipOnShortEdge.tooltip', 'Enable for short-edge duplex printing (automatic duplex only - ignored in manual mode)')
              }
            >
              <input
                type="checkbox"
                checked={parameters.flipOnShortEdge}
                onChange={(e) => onParameterChange('flipOnShortEdge', e.target.checked)}
                disabled={disabled || !parameters.doubleSided}
              />
              <Text size="sm" c={!parameters.doubleSided ? "dimmed" : undefined}>
                {t('bookletImposition.flipOnShortEdge.label', 'Flip on short edge')}
              </Text>
            </label>

            {/* Paper Size Note */}
            <Text size="xs" c="dimmed" fs="italic">
              {t('bookletImposition.paperSizeNote', 'Paper size is automatically derived from your first page.')}
            </Text>
          </Stack>
        </Collapse>
      </Stack>
    </Stack>
  );
};

export default BookletImpositionSettings;