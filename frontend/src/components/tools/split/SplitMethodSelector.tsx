import { Grid, Card, Stack, Text } from '@mantine/core';
import { Tooltip } from '../../shared/Tooltip';
import { useTranslation } from 'react-i18next';
import { SPLIT_METHODS, type SplitMethod } from '../../../constants/splitConstants';
import { useSplitSettingsTips } from '../../tooltips/useSplitSettingsTips';

export interface SplitMethodSelectorProps {
  selectedMethod: SplitMethod | '';
  onMethodSelect: (method: SplitMethod) => void;
  disabled?: boolean;
}

interface MethodOption {
  method: SplitMethod;
  icon: string;
  prefixKey: string;
  nameKey: string;
  descKey: string;
  tooltipKey: string;
}

const SplitMethodSelector = ({
  selectedMethod,
  onMethodSelect,
  disabled = false
}: SplitMethodSelectorProps) => {
  const { t } = useTranslation();

  // Get tooltip content for a specific method
  const getMethodTooltip = (method: SplitMethod) => {
    const tooltipContent = useSplitSettingsTips(method);
    return tooltipContent?.tips || [];
  };

  const methodOptions: MethodOption[] = [
    {
      method: SPLIT_METHODS.BY_PAGES,
      icon: "format-list-numbered-rounded",
      prefixKey: "split.methods.prefix.splitAt",
      nameKey: "split.methods.byPages.name",
      descKey: "split.methods.byPages.desc",
      tooltipKey: "split.methods.byPages.tooltip"
    },
    {
      method: SPLIT_METHODS.BY_CHAPTERS,
      icon: "bookmark-rounded",
      prefixKey: "split.methods.prefix.splitBy",
      nameKey: "split.methods.byChapters.name",
      descKey: "split.methods.byChapters.desc",
      tooltipKey: "split.methods.byChapters.tooltip"
    },
    {
      method: SPLIT_METHODS.BY_SECTIONS,
      icon: "grid-on-rounded",
      prefixKey: "split.methods.prefix.splitBy",
      nameKey: "split.methods.bySections.name",
      descKey: "split.methods.bySections.desc",
      tooltipKey: "split.methods.bySections.tooltip"
    },
    {
      method: SPLIT_METHODS.BY_SIZE,
      icon: "storage-rounded",
      prefixKey: "split.methods.prefix.splitBy",
      nameKey: "split.methods.bySize.name",
      descKey: "split.methods.bySize.desc",
      tooltipKey: "split.methods.bySize.tooltip"
    },
    {
      method: SPLIT_METHODS.BY_PAGE_COUNT,
      icon: "numbers-rounded",
      prefixKey: "split.methods.prefix.splitBy",
      nameKey: "split.methods.byPageCount.name",
      descKey: "split.methods.byPageCount.desc",
      tooltipKey: "split.methods.byPageCount.tooltip"
    },
    {
      method: SPLIT_METHODS.BY_DOC_COUNT,
      icon: "content-copy-rounded",
      prefixKey: "split.methods.prefix.splitBy",
      nameKey: "split.methods.byDocCount.name",
      descKey: "split.methods.byDocCount.desc",
      tooltipKey: "split.methods.byDocCount.tooltip"
    },
    {
      method: SPLIT_METHODS.BY_PAGE_DIVIDER,
      icon: "auto-awesome-rounded",
      prefixKey: "split.methods.prefix.splitBy",
      nameKey: "split.methods.byPageDivider.name",
      descKey: "split.methods.byPageDivider.desc",
      tooltipKey: "split.methods.byPageDivider.tooltip"
    }
  ];

  const handleMethodClick = (method: SplitMethod) => {
    if (!disabled) {
      onMethodSelect(method);
    }
  };

  return (
    <Grid>
      {methodOptions.map((option) => (
        <Grid.Col key={option.method} span={{ base: 12, sm: 6 }}>
          <Tooltip
            sidebarTooltip
            tips={getMethodTooltip(option.method)}
          >
            <Card
              shadow="sm"
              radius="md"
              withBorder

              h={120}
              style={{
                cursor: disabled ? 'default' : 'pointer',
                backgroundColor: selectedMethod === option.method ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-gray-2)',
                borderColor: selectedMethod === option.method ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-gray-3)',
                opacity: disabled ? 0.6 : 1,
                display: 'flex',
                flexDirection: 'column'
              }}
              onClick={() => handleMethodClick(option.method)}
            >
              <Stack align="center" gap={0} p="xs" h="100%" justify="Center">
                {/* Prefix section */}
                <Stack align="center" style={{  justifyContent: 'center' }}>
                  <Text
                    size="xs"
                    c="dimmed"
                    ta="center"
                    fw={400}
                  >
                    {t(option.prefixKey, "Split by")}
                  </Text>
                </Stack>

                {/* Title section  */}
                <Stack align="center" style={{ justifyContent: 'center' }}>
                  <Text
                    fw={selectedMethod === option.method ? 600 : 500}
                    size="sm"
                    ta="center"
                    c={selectedMethod === option.method ? 'blue' : undefined}
                   style={{ lineHeight: 1.2 }}
                  >
                    {t(option.nameKey, "Method Name")}
                  </Text>
                </Stack>

                {/* Description section - fixed height
                <Stack align="center" style={{ height: '60px', justifyContent: 'flex-start' }}>
                  <Text size="xs" c="dimmed" ta="center"  style={{ lineHeight: 1.3 }}>
                    {t(option.descKey, "Method description")}
                  </Text>
                </Stack> */}
              </Stack>
            </Card>
          </Tooltip>
        </Grid.Col>
      ))}
    </Grid>
  );
};

export default SplitMethodSelector;
