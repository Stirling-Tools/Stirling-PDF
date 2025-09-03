import React from "react";
import { Button, Stack, Text, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { BookletImpositionParameters } from "../../../hooks/tools/bookletImposition/useBookletImpositionParameters";

interface BookletImpositionSettingsProps {
  parameters: BookletImpositionParameters;
  onParameterChange: (key: keyof BookletImpositionParameters, value: any) => void;
  disabled?: boolean;
}

const BookletImpositionSettings = ({ parameters, onParameterChange, disabled = false }: BookletImpositionSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Divider ml='-md'></Divider>
      
      {/* Booklet Type */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Booklet Type</Text>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.bookletType === 'BOOKLET' ? 'filled' : 'outline'}
            color={parameters.bookletType === 'BOOKLET' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('bookletType', 'BOOKLET')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Standard<br />Booklet
            </div>
          </Button>
          <Button
            variant={parameters.bookletType === 'SIDE_STITCH_BOOKLET' ? 'filled' : 'outline'}
            color={parameters.bookletType === 'SIDE_STITCH_BOOKLET' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('bookletType', 'SIDE_STITCH_BOOKLET')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Side-Stitch<br />Booklet
            </div>
          </Button>
        </div>
        <Text size="xs" c="dimmed">
          {parameters.bookletType === 'BOOKLET' 
            ? "Standard booklet for saddle-stitched binding (fold in half)"
            : "Side-stitched booklet for binding along the edge"}
        </Text>
      </Stack>

      <Divider />

      {/* Pages Per Sheet */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Pages Per Sheet</Text>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.pagesPerSheet === 2 ? 'filled' : 'outline'}
            color={parameters.pagesPerSheet === 2 ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('pagesPerSheet', 2)}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              2 Pages<br />Per Sheet
            </div>
          </Button>
          <Button
            variant={parameters.pagesPerSheet === 4 ? 'filled' : 'outline'}
            color={parameters.pagesPerSheet === 4 ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('pagesPerSheet', 4)}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              4 Pages<br />Per Sheet
            </div>
          </Button>
        </div>
        <Text size="xs" c="dimmed">
          {parameters.pagesPerSheet === 2 
            ? "Two pages side by side on each sheet (most common)"
            : "Four pages arranged in a 2x2 grid on each sheet"}
        </Text>
      </Stack>

      <Divider />

      {/* Page Orientation */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Page Orientation</Text>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.pageOrientation === 'LANDSCAPE' ? 'filled' : 'outline'}
            color={parameters.pageOrientation === 'LANDSCAPE' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('pageOrientation', 'LANDSCAPE')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Landscape<br />(Recommended)
            </div>
          </Button>
          <Button
            variant={parameters.pageOrientation === 'PORTRAIT' ? 'filled' : 'outline'}
            color={parameters.pageOrientation === 'PORTRAIT' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('pageOrientation', 'PORTRAIT')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Portrait
            </div>
          </Button>
        </div>
        <Text size="xs" c="dimmed">
          {parameters.pageOrientation === 'LANDSCAPE' 
            ? "A4 landscape → A5 portrait when folded (standard booklet size)"
            : "A4 portrait → A6 when folded (smaller booklet)"}
        </Text>
      </Stack>

      <Divider />

      {/* Add Border Option */}
      <Stack gap="sm">
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          title="Adds borders around each page section to help with cutting and alignment"
        >
          <input
            type="checkbox"
            checked={parameters.addBorder}
            onChange={(e) => onParameterChange('addBorder', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">Add borders around pages</Text>
        </label>
        <Text size="xs" c="dimmed" style={{ marginLeft: '24px' }}>
          Helpful for cutting and alignment when printing
        </Text>
      </Stack>
    </Stack>
  );
};

export default BookletImpositionSettings;