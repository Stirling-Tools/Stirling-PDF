import { Stack, Card, Text } from '@mantine/core';
import { Tooltip } from '../../shared/Tooltip';
import { useTranslation } from 'react-i18next';
import { type SplitMethod, METHOD_OPTIONS } from '../../../constants/splitConstants';
import { useSplitSettingsTips } from '../../tooltips/useSplitSettingsTips';

export interface SplitMethodSelectorProps {
  onMethodSelect: (method: SplitMethod) => void;
  disabled?: boolean;
}

const SplitMethodSelector = ({
  onMethodSelect,
  disabled = false
}: SplitMethodSelectorProps) => {
  const { t } = useTranslation();

  // Get tooltip content for a specific method
  const getMethodTooltip = (method: SplitMethod) => {
    const tooltipContent = useSplitSettingsTips(method);
    return tooltipContent?.tips || [];
  };

  const handleMethodClick = (method: SplitMethod) => {
    if (!disabled) {
      onMethodSelect(method);
    }
  };

  return (
    <Stack gap="sm">
      {METHOD_OPTIONS.map((option) => (
        <Tooltip
          key={option.method}
          sidebarTooltip
          tips={getMethodTooltip(option.method)}
        >
          <Card
            radius="md"
            w="100%"
            h={'3.5rem'}
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
            onClick={() => handleMethodClick(option.method)}
          >
            <div style={{  width: '100%', position: 'relative', display: 'flex', flexDirection: 'row'  }}>
              {/* Prefix in top left corner */}
              <Text size="xs" c="dimmed" ta="center" fw={400} style={{

              }}>
                {t(option.prefixKey, "Split by")}
              </Text>

              <div style={{  }}>
                <Text
                  fw={500}
                  size="sm"
                  c={undefined}
                  ta="center"
                  style={{ marginLeft: '0.25rem' }}
                >
                  {t(option.nameKey, "Method Name")}
                </Text>
              </div>
            </div>
          </Card>
        </Tooltip>
      ))}
    </Stack>
  );
};

export default SplitMethodSelector;
