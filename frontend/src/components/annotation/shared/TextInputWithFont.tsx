import React, { useState, useEffect } from 'react';
import { Stack, TextInput, Select, Combobox, useCombobox } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface TextInputWithFontProps {
  text: string;
  onTextChange: (text: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
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
  disabled = false,
  label,
  placeholder
}) => {
  const { t } = useTranslation();
  const [fontSizeInput, setFontSizeInput] = useState(fontSize.toString());
  const fontSizeCombobox = useCombobox();

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

  const fontSizeOptions = ['8', '12', '16', '20', '24', '28', '32', '36', '40', '48'];

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

      {/* Font Size */}
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
            placeholder="Type or select font size (8-72)"
            value={fontSizeInput}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFontSizeInput(value);

              // Parse and validate the typed value in real-time
              const size = parseInt(value);
              if (!isNaN(size) && size >= 8 && size <= 72) {
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
              if (isNaN(size) || size < 8 || size > 72) {
                setFontSizeInput(fontSize.toString());
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
    </Stack>
  );
};