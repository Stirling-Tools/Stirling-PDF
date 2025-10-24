import React from 'react';
import { TextInput, Combobox, useCombobox } from '@mantine/core';

interface PenSizeSelectorProps {
  value: number;
  inputValue: string;
  onValueChange: (size: number) => void;
  onInputChange: (input: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  size?: string;
}

const PenSizeSelector = ({
  value,
  inputValue,
  onValueChange,
  onInputChange,
  disabled = false,
  placeholder = "Type or select pen size (1-200)",
  style,
  size
}: PenSizeSelectorProps) => {
  const combobox = useCombobox();

  const penSizeOptions = ['1', '2', '3', '4', '5', '8', '10', '12', '15', '20'];

  return (
    <Combobox
      onOptionSubmit={(optionValue) => {
        const penSize = parseInt(optionValue);
        if (!isNaN(penSize)) {
          onValueChange(penSize);
          onInputChange(optionValue);
        }
        combobox.closeDropdown();
      }}
      store={combobox}
      withinPortal={false}
    >
      <Combobox.Target>
        <TextInput
          placeholder={placeholder}
          size={size}
          value={inputValue}
          onChange={(event) => {
            const inputVal = event.currentTarget.value;
            onInputChange(inputVal);

            const penSize = parseInt(inputVal);
            if (!isNaN(penSize) && penSize >= 1 && penSize <= 200) {
              onValueChange(penSize);
            }

            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            const penSize = parseInt(inputValue);
            if (isNaN(penSize) || penSize < 1 || penSize > 200) {
              onInputChange(value.toString());
            }
          }}
          disabled={disabled}
          style={style}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {penSizeOptions.map((sizeOption) => (
            <Combobox.Option value={sizeOption} key={sizeOption}>
              {sizeOption}px
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};

export default PenSizeSelector;