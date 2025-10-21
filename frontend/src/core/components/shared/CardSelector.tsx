import { Stack, Card, Text, Flex } from '@mantine/core';
import { Tooltip } from '@app/components/shared/Tooltip';
import { useTranslation } from 'react-i18next';

export interface CardOption<T = string> {
  value: T;
  prefixKey: string;
  nameKey: string;
  tooltipKey?: string;
  tooltipContent?: any[];
}

export interface CardSelectorProps<T, K extends CardOption<T>> {
  options: K[];
  onSelect: (value: T) => void;
  disabled?: boolean;
  getTooltipContent?: (option: K) => any[];
}

const CardSelector = <T, K extends CardOption<T>>({
  options,
  onSelect,
  disabled = false,
  getTooltipContent
}: CardSelectorProps<T, K>) => {
  const { t } = useTranslation();

  const handleOptionClick = (value: T) => {
    if (!disabled) {
      onSelect(value);
    }
  };

  const getTooltips = (option: K) => {
    if (getTooltipContent) {
      return getTooltipContent(option);
    }
    return [];
  };

  return (
    <Stack gap="sm">
      {options.map((option) => (
        <Tooltip
          key={option.value as string}
          sidebarTooltip
          tips={getTooltips(option)}
        >
          <Card
            radius="md"
            w="100%"
            h={'2.8rem'}
            style={{
              cursor: disabled ? 'default' : 'pointer',
              backgroundColor: 'var(--mantine-color-gray-2)',
              borderColor: 'var(--mantine-color-gray-3)',
              opacity: disabled ? 0.6 : 1,
              display: 'flex',
              flexDirection: 'row',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-3)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-2)';
                e.currentTarget.style.transform = 'translateY(0px)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
            onClick={() => handleOptionClick(option.value)}
          >
            <Flex align={'center'} pl="sm" w="100%">
              <Text size="sm" c="dimmed" ta="center" fw={350}>
                {t(option.prefixKey, "Prefix")}
              </Text>
              <Text
                fw={600}
                size="sm"
                c={undefined}
                ta="center"
                style={{ marginLeft: '0.25rem' }}
              >
                {t(option.nameKey, "Option Name")}
              </Text>
            </Flex>
          </Card>
        </Tooltip>
      ))}
    </Stack>
  );
};

export default CardSelector;
