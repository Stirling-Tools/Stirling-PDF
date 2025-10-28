import React, { useState, useEffect } from 'react';
import { Stack, TextInput, Select, Combobox, useCombobox, Group, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ColorPicker } from './ColorPicker';

interface TextInputWithFontProps {
  text: string;
  onTextChange: (text: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  textColor?: string;
  onTextColorChange?: (color: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
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
  disabled = false,
  label,
  placeholder
}) => {
  const { t } = useTranslation();
  const [fontSizeInput, setFontSizeInput] = useState(fontSize.toString());
  const fontSizeCombobox = useCombobox();
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // Sync font size input with prop changes
  useEffect(() => {
    setFontSizeInput(fontSize.toString());
  }, [fontSize]);

  const fontOptions = [
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Times-Roman', label: 'Times' },
    { value: 'Courier', label: 'Courier' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Georgia', label: 'Georgia' },
  ];

  const fontSizeOptions = ['8', '12', '16', '20', '24', '28', '32', '36', '40', '48', '56', '64', '72', '80', '96', '112', '128', '144', '160', '176', '192', '200'];

  return (
    <Stack gap="sm">
      <TextInput
        label={label || t('sign.text.name', 'Signer Name')}
        placeholder={placeholder || t('sign.text.placeholder', 'Enter your full name')}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
        required
      />

      {/* Font Selection */}
      <Select
        label="Font"
        value={fontFamily}
        onChange={(value) => onFontFamilyChange(value || 'Helvetica')}
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
              label="Font Size"
              placeholder="Type or select font size (8-200)"
              value={fontSizeInput}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setFontSizeInput(value);

                // Parse and validate the typed value in real-time
                const size = parseInt(value);
                if (!isNaN(size) && size >= 8 && size <= 200) {
                  onFontSizeChange(size);
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
              label="Text Color"
              value={textColor}
              readOnly
              disabled={disabled}
              onClick={() => !disabled && setIsColorPickerOpen(true)}
              style={{ cursor: disabled ? 'default' : 'pointer' }}
              rightSection={
                <Box
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
          onColorChange={onTextColorChange}
        />
      )}
    </Stack>
  );
};