import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Divider, Collapse, Button, NumberInput, Checkbox } from "@mantine/core";
import { BookletImpositionParameters } from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";
import ButtonSelector from "@app/components/shared/ButtonSelector";

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
        <Checkbox
          checked={parameters.doubleSided}
          onChange={(event) => {
            const isDoubleSided = event.currentTarget.checked;
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
          label={
            <div>
              <Text size="sm">{t('bookletImposition.doubleSided.label', 'Double-sided printing')}</Text>
              <Text size="xs" c="dimmed">{t('bookletImposition.doubleSided.tooltip', 'Creates both front and back sides for proper booklet printing')}</Text>
            </div>
          }
        />

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
            <Checkbox
              checked={parameters.spineLocation === 'RIGHT'}
              onChange={(event) => onParameterChange('spineLocation', event.currentTarget.checked ? 'RIGHT' : 'LEFT')}
              disabled={disabled}
              label={
                <div>
                  <Text size="sm">{t('bookletImposition.rtlBinding.label', 'Right-to-left binding')}</Text>
                  <Text size="xs" c="dimmed">{t('bookletImposition.rtlBinding.tooltip', 'For Arabic, Hebrew, or other right-to-left languages')}</Text>
                </div>
              }
            />

            {/* Add Border Option */}
            <Checkbox
              checked={parameters.addBorder}
              onChange={(event) => onParameterChange('addBorder', event.currentTarget.checked)}
              disabled={disabled}
              label={
                <div>
                  <Text size="sm">{t('bookletImposition.addBorder.label', 'Add borders around pages')}</Text>
                  <Text size="xs" c="dimmed">{t('bookletImposition.addBorder.tooltip', 'Adds borders around each page section to help with cutting and alignment')}</Text>
                </div>
              }
            />

            {/* Gutter Margin */}
            <Stack gap="xs">
              <Checkbox
                checked={parameters.addGutter}
                onChange={(event) => onParameterChange('addGutter', event.currentTarget.checked)}
                disabled={disabled}
                label={
                  <div>
                    <Text size="sm">{t('bookletImposition.addGutter.label', 'Add gutter margin')}</Text>
                    <Text size="xs" c="dimmed">{t('bookletImposition.addGutter.tooltip', 'Adds inner margin space for binding')}</Text>
                  </div>
                }
              />

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
            <Checkbox
              checked={parameters.flipOnShortEdge}
              onChange={(event) => onParameterChange('flipOnShortEdge', event.currentTarget.checked)}
              disabled={disabled || !parameters.doubleSided}
              label={
                <div>
                  <Text size="sm" c={!parameters.doubleSided ? "dimmed" : undefined}>
                    {t('bookletImposition.flipOnShortEdge.label', 'Flip on short edge')}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {!parameters.doubleSided
                      ? t('bookletImposition.flipOnShortEdge.manualNote', 'Not needed in manual mode - you flip the stack yourself')
                      : t('bookletImposition.flipOnShortEdge.tooltip', 'Enable for short-edge duplex printing (automatic duplex only - ignored in manual mode)')
                    }
                  </Text>
                </div>
              }
            />

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
