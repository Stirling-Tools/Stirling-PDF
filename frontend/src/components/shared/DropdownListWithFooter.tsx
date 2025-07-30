import React, { ReactNode, useState, useMemo } from 'react';
import { Stack, Text, Popover, Box, Checkbox, Group, TextInput, useMantineColorScheme } from '@mantine/core';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import SearchIcon from '@mui/icons-material/Search';

export interface DropdownItem {
  value: string;
  name: string;
  leftIcon?: ReactNode;
  disabled?: boolean;
}

export interface DropdownListWithFooterProps {
  // Value and onChange - support both single and multi-select
  value: string | string[];
  onChange: (value: string | string[]) => void;
  
  // Items and display
  items: DropdownItem[];
  placeholder?: string;
  disabled?: boolean;
  
  // Labels and headers
  label?: string;
  header?: ReactNode;
  footer?: ReactNode;
  
  // Behavior
  multiSelect?: boolean;
  searchable?: boolean;
  maxHeight?: number;
  
  // Styling
  className?: string;
  dropdownClassName?: string;
  
  // Popover props
  position?: 'top' | 'bottom' | 'left' | 'right';
  withArrow?: boolean;
  width?: 'target' | number;
}

const DropdownListWithFooter: React.FC<DropdownListWithFooterProps> = ({
  value,
  onChange,
  items,
  placeholder = 'Select option',
  disabled = false,
  label,
  header,
  footer,
  multiSelect = false,
  searchable = false,
  maxHeight = 300,
  className = '',
  dropdownClassName = '',
  position = 'bottom',
  withArrow = false,
  width = 'target'
}) => {
  
  const [searchTerm, setSearchTerm] = useState('');
  const { colorScheme } = useMantineColorScheme();
  
  const isMultiValue = Array.isArray(value);
  const selectedValues = isMultiValue ? value : (value ? [value] : []);

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!searchable || !searchTerm.trim()) {
      return items;
    }
    return items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm, searchable]);

  const handleItemClick = (itemValue: string) => {
    if (multiSelect) {
      const newSelection = selectedValues.includes(itemValue)
        ? selectedValues.filter(v => v !== itemValue)
        : [...selectedValues, itemValue];
      onChange(newSelection);
    } else {
      onChange(itemValue);
    }
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) {
      return placeholder;
    } else if (selectedValues.length === 1) {
      const selectedItem = items.find(item => item.value === selectedValues[0]);
      return selectedItem?.name || selectedValues[0];
    } else {
      return `${selectedValues.length} selected`;
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.currentTarget.value);
  };

  return (
    <Box className={className}>
      {label && (
        <Text size="sm" fw={500} mb={4}>
          {label}
        </Text>
      )}
      
      <Popover 
        width={width} 
        position={position} 
        withArrow={withArrow} 
        shadow="md"
        onClose={() => searchable && setSearchTerm('')}
      >
        <Popover.Target>
          <Box
            style={{
              border: colorScheme === 'dark' 
                ? '1px solid var(--mantine-color-dark-4)' 
                : '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-sm)',
              padding: '8px 12px',
              backgroundColor: colorScheme === 'dark' 
                ? 'var(--mantine-color-dark-6)' 
                : 'var(--mantine-color-white)',
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
              minHeight: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Text size="sm" style={{ flex: 1 }}>
              {getDisplayText()}
            </Text>
            <UnfoldMoreIcon style={{ 
              fontSize: '1rem', 
              color: colorScheme === 'dark' 
                ? 'var(--mantine-color-dark-2)' 
                : 'var(--mantine-color-gray-5)' 
            }} />
          </Box>
        </Popover.Target>
        
        <Popover.Dropdown className={dropdownClassName}>
          <Stack gap="xs">
            {header && (
              <Box style={{ 
                borderBottom: colorScheme === 'dark' 
                  ? '1px solid var(--mantine-color-dark-4)' 
                  : '1px solid var(--mantine-color-gray-2)', 
                paddingBottom: '8px' 
              }}>
                {header}
              </Box>
            )}
            
            {searchable && (
              <Box style={{ 
                borderBottom: colorScheme === 'dark' 
                  ? '1px solid var(--mantine-color-dark-4)' 
                  : '1px solid var(--mantine-color-gray-2)', 
                paddingBottom: '8px' 
              }}>
                <TextInput
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  leftSection={<SearchIcon style={{ fontSize: '1rem' }} />}
                  size="sm"
                  style={{ width: '100%' }}
                />
              </Box>
            )}
            
            <Box style={{ maxHeight, overflowY: 'auto' }}>
              {filteredItems.length === 0 ? (
                <Box style={{ padding: '12px', textAlign: 'center' }}>
                  <Text size="sm" c="dimmed">
                    {searchable && searchTerm ? 'No results found' : 'No items available'}
                  </Text>
                </Box>
              ) : (
                filteredItems.map((item) => (
                <Box
                  key={item.value}
                  onClick={() => !item.disabled && handleItemClick(item.value)}
                  style={{
                    padding: '8px 12px',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    borderRadius: 'var(--mantine-radius-sm)',
                    opacity: item.disabled ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.backgroundColor = colorScheme === 'dark' 
                        ? 'var(--mantine-color-dark-5)' 
                        : 'var(--mantine-color-gray-0)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Group gap="sm" style={{ flex: 1 }}>
                    {item.leftIcon && (
                      <Box style={{ display: 'flex', alignItems: 'center' }}>
                        {item.leftIcon}
                      </Box>
                    )}
                    <Text size="sm">{item.name}</Text>
                  </Group>
                  
                  {multiSelect && (
                    <Checkbox
                      checked={selectedValues.includes(item.value)}
                      onChange={() => {}} // Handled by parent onClick
                      size="sm"
                      disabled={item.disabled}
                    />
                  )}
                </Box>
                ))
              )}
            </Box>
            
            {footer && (
              <Box style={{ 
                borderTop: colorScheme === 'dark' 
                  ? '1px solid var(--mantine-color-dark-4)' 
                  : '1px solid var(--mantine-color-gray-2)', 
                paddingTop: '8px' 
              }}>
                {footer}
              </Box>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};

export default DropdownListWithFooter; 