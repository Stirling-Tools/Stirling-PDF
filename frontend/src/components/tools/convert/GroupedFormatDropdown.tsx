import React, { useState, useMemo } from "react";
import { Stack, Text, Group, Button, Box, Popover, UnstyledButton, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

interface FormatOption {
  value: string;
  label: string;
  group: string;
}

interface GroupedFormatDropdownProps {
  value?: string;
  placeholder?: string;
  options: FormatOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  minWidth?: string;
}

const GroupedFormatDropdown = ({
  value,
  placeholder = "Select an option",
  options,
  onChange,
  disabled = false,
  minWidth = "300px"
}: GroupedFormatDropdownProps) => {
  const [dropdownOpened, setDropdownOpened] = useState(false);
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();

  // Group options by category
  const groupedOptions = useMemo(() => {
    const groups: Record<string, FormatOption[]> = {};
    
    options.forEach(option => {
      if (!groups[option.group]) {
        groups[option.group] = [];
      }
      groups[option.group].push(option);
    });
    
    return groups;
  }, [options]);

  // Get selected option label for display
  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    const selected = options.find(opt => opt.value === value);
    return selected ? selected.label : value;
  }, [value, options, placeholder]);

  const handleOptionSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setDropdownOpened(false);
  };

  return (
    <Popover
      opened={dropdownOpened}
      onClose={() => setDropdownOpened(false)}
      position="bottom-start"
      withArrow
      shadow="sm"
      disabled={disabled}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setDropdownOpened(!dropdownOpened)}
          disabled={disabled}
          style={{
            padding: '8px 12px',
            border: `1px solid ${theme.colors.gray[4]}`,
            borderRadius: theme.radius.sm,
            backgroundColor: disabled 
              ? theme.colors.gray[1] 
              : colorScheme === 'dark' 
                ? theme.colors.dark[6] 
                : theme.white,
            cursor: disabled ? 'not-allowed' : 'pointer',
            width: '100%',
            color: colorScheme === 'dark' ? theme.colors.dark[0] : theme.colors.dark[9]
          }}
        >
          <Group justify="space-between">
            <Text size="sm" c={value ? undefined : 'dimmed'}>
              {selectedLabel}
            </Text>
            <KeyboardArrowDownIcon 
              style={{ 
                fontSize: 16,
                transform: dropdownOpened ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                color: colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6]
              }} 
            />
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown 
        style={{ 
          minWidth,
          backgroundColor: colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
          border: `1px solid ${colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[4]}`,
        }}
      >
        <Stack gap="md">
          {Object.entries(groupedOptions).map(([groupName, groupOptions]) => (
            <Box key={groupName}>
              <Text 
                size="sm" 
                fw={600} 
                c={colorScheme === 'dark' ? 'dark.2' : 'gray.6'} 
                mb="xs"
              >
                {groupName}
              </Text>
              <Group gap="xs">
                {groupOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={value === option.value ? "filled" : "outline"}
                    size="sm"
                    onClick={() => handleOptionSelect(option.value)}
                    style={{
                      fontSize: '12px',
                      height: '32px',
                      padding: '0 12px'
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </Group>
            </Box>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

export default GroupedFormatDropdown;