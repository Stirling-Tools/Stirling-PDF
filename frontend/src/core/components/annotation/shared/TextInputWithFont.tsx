import React, { useState, useEffect } from 'react';
import { Stack, TextInput, Select, Combobox, useCombobox, Group, Box, SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ColorPicker } from '@app/components/annotation/shared/ColorPicker';

interface TextInputWithFontProps {
  text: string;
  onTextChange: (text: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  textColor?: string;
  onTextColorChange?: (color: string) => void;
  textAlign?: 'left' | 'center' | 'right';
  onTextAlignChange?: (align: 'left' | 'center' | 'right') => void;
  disabled?: boolean;
  label: string;
  placeholder: string;
  fontLabel: string;
  fontSizeLabel: string;
  fontSizePlaceholder: string;
  colorLabel?: string;
  onAnyChange?: () => void;
}

export const TextInputWithFont: React.FC<TextInputWithFontProps> = ({
  text,
  onTextChange,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  textColor = '#000000',
  onTextColorChange,
  textAlign = 'left',
  onTextAlignChange,
  disabled = false,
  label,
  placeholder,
  fontLabel,
  fontSizeLabel,
  fontSizePlaceholder,
  colorLabel,
  onAnyChange
}) => {
  const { t } = useTranslation();
  const [fontSizeInput, setFontSizeInput] = useState(fontSize.toString());
  const fontSizeCombobox = useCombobox();
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorInput, setColorInput] = useState(textColor);

  // Sync font size input with prop changes
  useEffect(() => {
    setFontSizeInput(fontSize.toString());
  }, [fontSize]);

  // Sync color input with prop changes
  useEffect(() => {
    setColorInput(textColor);
  }, [textColor]);

  const fontOptions = [
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Times-Roman', label: 'Times' },
    { value: 'Courier', label: 'Courier' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Georgia', label: 'Georgia' },
  ];

  const fontSizeOptions = ['8', '12', '16', '20', '24', '28', '32', '36', '40', '48', '56', '64', '72', '80', '96', '112', '128', '144', '160', '176', '192', '200'];

  // Validate hex color
  const isValidHexColor = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  return (
    <Stack gap="sm">
      <TextInput
        label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          onTextChange(e.target.value);
          onAnyChange?.();
        }}
        disabled={disabled}
        required
      />

      {/* Font Selection */}
      <Select
        label={fontLabel}
        value={fontFamily}
        onChange={(value) => {
          onFontFamilyChange(value || 'Helvetica');
          onAnyChange?.();
        }}
        data={fontOptions}
        disabled={disabled}
        searchable
        allowDeselect={false}
      />

      {/* Font Size and Color */}
      <Group grow>
        <Combobox
          onOptionSubmit={(optionValue) => {
            setFontSizeInput(optionValue);
            const size = parseInt(optionValue);
            if (!isNaN(size)) {
              onFontSizeChange(size);
            }
            fontSizeCombobox.closeDropdown();
          }}
          store={fontSizeCombobox}
          withinPortal={false}
        >
          <Combobox.Target>
            <TextInput
              label={fontSizeLabel}
              placeholder={fontSizePlaceholder}
              value={fontSizeInput}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setFontSizeInput(value);

                // Parse and validate the typed value in real-time
                const size = parseInt(value);
                if (!isNaN(size) && size >= 8 && size <= 200) {
                  onFontSizeChange(size);
                  onAnyChange?.();
                }

                fontSizeCombobox.openDropdown();
                fontSizeCombobox.updateSelectedOptionIndex();
              }}
              onClick={() => fontSizeCombobox.openDropdown()}
              onFocus={() => fontSizeCombobox.openDropdown()}
              onBlur={() => {
                fontSizeCombobox.closeDropdown();
                // Clean up invalid values on blur
                const size = parseInt(fontSizeInput);
                if (isNaN(size) || size < 8 || size > 200) {
                  setFontSizeInput(fontSize.toString());
                } else {
                  onFontSizeChange(size);
                }
              }}
              disabled={disabled}
            />
          </Combobox.Target>

          <Combobox.Dropdown>
            <Combobox.Options>
              {fontSizeOptions.map((size) => (
                <Combobox.Option value={size} key={size}>
                  {size}px
                </Combobox.Option>
              ))}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        {/* Text Color Picker */}
        {onTextColorChange && (
          <Box>
            <TextInput
              label={colorLabel}
              value={colorInput}
              placeholder="#000000"
              disabled={disabled}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setColorInput(value);

                // Update color if valid hex
                if (isValidHexColor(value)) {
                  onTextColorChange(value);
                  onAnyChange?.();
                }
              }}
              onBlur={() => {
                // Revert to valid color on blur if invalid
                if (!isValidHexColor(colorInput)) {
                  setColorInput(textColor);
                }
              }}
              style={{ width: '100%' }}
              rightSection={
                <Box
                  onClick={() => !disabled && setIsColorPickerOpen(true)}
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: textColor,
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    cursor: disabled ? 'default' : 'pointer'
                  }}
                />
              }
            />
          </Box>
        )}
      </Group>

      {/* Color Picker Modal */}
      {onTextColorChange && (
        <ColorPicker
          isOpen={isColorPickerOpen}
          onClose={() => setIsColorPickerOpen(false)}
          selectedColor={textColor}
          onColorChange={(color) => {
            onTextColorChange(color);
            onAnyChange?.();
          }}
        />
      )}

      {/* Text Alignment */}
      {onTextAlignChange && (
        <SegmentedControl
          value={textAlign}
          onChange={(value: string) => {
            onTextAlignChange(value as 'left' | 'center' | 'right');
            onAnyChange?.();
          }}
          disabled={disabled}
          data={[
            { label: t('textAlign.left', 'Left'), value: 'left' },
            { label: t('textAlign.center', 'Center'), value: 'center' },
            { label: t('textAlign.right', 'Right'), value: 'right' },
          ]}
        />
      )}
    </Stack>
  );
};
