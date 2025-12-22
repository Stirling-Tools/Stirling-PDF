import React, { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Code,
  Collapse,
  Divider,
  Flex,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import FontDownloadIcon from '@mui/icons-material/FontDownload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { PdfJsonDocument } from '@app/tools/pdfTextEditor/pdfTextEditorTypes';
import {
  analyzeDocumentFonts,
  DocumentFontAnalysis,
  FontAnalysis,
  getFontStatusColor,
  getFontStatusDescription,
} from '@app/tools/pdfTextEditor/fontAnalysis';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip as CustomTooltip } from '@app/components/shared/Tooltip';

interface FontStatusPanelProps {
  document: PdfJsonDocument | null;
  pageIndex?: number;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const FontStatusBadge = ({ analysis }: { analysis: FontAnalysis }) => {
  const color = getFontStatusColor(analysis.status);
  const description = getFontStatusDescription(analysis.status);

  const icon = useMemo(() => {
    switch (analysis.status) {
      case 'perfect':
        return <CheckCircleIcon sx={{ fontSize: 14 }} />;
      case 'embedded-subset':
        return <InfoIcon sx={{ fontSize: 14 }} />;
      case 'system-fallback':
        return <WarningIcon sx={{ fontSize: 14 }} />;
      case 'missing':
        return <ErrorIcon sx={{ fontSize: 14 }} />;
      default:
        return <InfoIcon sx={{ fontSize: 14 }} />;
    }
  }, [analysis.status]);

  return (
    <Tooltip label={description} position="top" withArrow>
      <Badge
        size="xs"
        color={color}
        variant="light"
        leftSection={icon}
        style={{ cursor: 'help' }}
      >
        {analysis.status.replace('-', ' ')}
      </Badge>
    </Tooltip>
  );
};

const FontDetailItem = ({ analysis }: { analysis: FontAnalysis }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Paper withBorder px="sm" py="md" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
      <Stack gap={4}>
        <Flex align="center" justify="space-between" wrap="nowrap">
          <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <FontDownloadIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <CustomTooltip
              sidebarTooltip={false}
              content={analysis.baseName}
              position="top"
            >
              <Text size="xs" fw={500} lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
                {analysis.baseName}
              </Text>
            </CustomTooltip>
            {analysis.isSubset && (
              <Badge size="xs" color="gray" variant="outline" style={{ flexShrink: 0 }}>
                subset
              </Badge>
            )}
          </Group>
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            <FontStatusBadge analysis={analysis} />
            {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          </Group>
        </Flex>

        <Collapse in={expanded}>
          <Stack gap={4} mt={4}>
            {/* Font Details */}
            <Box>
              <Text size="xs" c="dimmed" mb={2}>
                {t('pdfTextEditor.fontAnalysis.details', 'Font Details')}:
              </Text>
              <Stack gap={2}>
                <Group gap={4}>
                  <Text size="xs" c="dimmed">
                    {t('pdfTextEditor.fontAnalysis.embedded', 'Embedded')}:
                  </Text>
                  <Code style={{ fontSize: '0.65rem', padding: '0 4px' }}>{analysis.embedded ? 'Yes' : 'No'}</Code>
                </Group>
                {analysis.subtype && (
                  <Group gap={4}>
                    <Text size="xs" c="dimmed">
                      {t('pdfTextEditor.fontAnalysis.type', 'Type')}:
                    </Text>
                    <Code style={{ fontSize: '0.65rem', padding: '0 4px' }}>{analysis.subtype}</Code>
                  </Group>
                )}
                {analysis.webFormat && (
                  <Group gap={4}>
                    <Text size="xs" c="dimmed">
                      {t('pdfTextEditor.fontAnalysis.webFormat', 'Web Format')}:
                    </Text>
                    <Code style={{ fontSize: '0.65rem', padding: '0 4px' }}>{analysis.webFormat}</Code>
                  </Group>
                )}
              </Stack>
            </Box>

            {/* Warnings */}
            {analysis.warnings.length > 0 && (
              <Box>
                <Text size="xs" c="orange" fw={500}>
                  {t('pdfTextEditor.fontAnalysis.warnings', 'Warnings')}:
                </Text>
                <List size="xs" spacing={2} withPadding>
                  {analysis.warnings.map((warning, index) => (
                    <List.Item key={index}>
                      <Text size="xs">{warning}</Text>
                    </List.Item>
                  ))}
                </List>
              </Box>
            )}

            {/* Suggestions */}
            {analysis.suggestions.length > 0 && (
              <Box>
                <Text size="xs" c="blue" fw={500}>
                  {t('pdfTextEditor.fontAnalysis.suggestions', 'Notes')}:
                </Text>
                <List size="xs" spacing={2} withPadding>
                  {analysis.suggestions.map((suggestion, index) => (
                    <List.Item key={index}>
                      <Text size="xs">{suggestion}</Text>
                    </List.Item>
                  ))}
                </List>
              </Box>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
};

const FontStatusPanel: React.FC<FontStatusPanelProps> = ({
  document,
  pageIndex,
  isCollapsed = false,
  onCollapsedChange
}) => {
  const { t } = useTranslation();

  const fontAnalysis: DocumentFontAnalysis = useMemo(
    () => analyzeDocumentFonts(document, pageIndex),
    [document, pageIndex]
  );

  const { canReproducePerfectly, hasWarnings, summary, fonts } = fontAnalysis;

  // Early return AFTER all hooks are declared
  if (!document || fontAnalysis.fonts.length === 0) {
    return null;
  }

  const statusColor = canReproducePerfectly ? 'green' : hasWarnings ? 'yellow' : 'blue';

  const pageLabel = pageIndex !== undefined
    ? t('pdfTextEditor.fontAnalysis.currentPageFonts', 'Fonts on this page')
    : t('pdfTextEditor.fontAnalysis.allFonts', 'All fonts');

  return (
    <div>
      <div
        style={{
          padding: '0.5rem',
          opacity: isCollapsed ? 0.8 : 1,
          color: isCollapsed ? 'var(--mantine-color-dimmed)' : 'inherit',
          transition: 'opacity 0.2s ease, color 0.2s ease'
        }}
      >
        {/* Header - matches ToolStep style */}
        <Flex
          align="center"
          justify="space-between"
          mb={isCollapsed ? 0 : 'sm'}
          style={{ cursor: 'pointer' }}
          onClick={() => onCollapsedChange?.(!isCollapsed)}
        >
          <Flex align="center" gap="xs">
            <Text fw={500} size="sm">
              {pageLabel}
            </Text>
            <Badge size="xs" color={statusColor} variant="dot">
              {fonts.length}
            </Badge>
          </Flex>

          {isCollapsed ? (
            <LocalIcon icon="chevron-right-rounded" width="1.2rem" height="1.2rem" style={{
              color: 'var(--mantine-color-dimmed)'
            }} />
          ) : (
            <LocalIcon icon="expand-more-rounded" width="1.2rem" height="1.2rem" style={{
              color: 'var(--mantine-color-dimmed)'
            }} />
          )}
        </Flex>

        {/* Content */}
        {!isCollapsed && (
          <Stack gap="xs" pl="sm">
            {/* Overall Status Message */}
            <Text size="xs" c="dimmed">
              {canReproducePerfectly
                ? t(
                    'pdfTextEditor.fontAnalysis.perfectMessage',
                    'All fonts can be reproduced perfectly.'
                  )
                : hasWarnings
                ? t(
                    'pdfTextEditor.fontAnalysis.warningMessage',
                    'Some fonts may not render correctly.'
                  )
                : t(
                    'pdfTextEditor.fontAnalysis.infoMessage',
                    'Font reproduction information available.'
                  )}
            </Text>

            {/* Summary Statistics */}
            <Group gap={4} wrap="wrap">
              {summary.perfect > 0 && (
                <Badge size="xs" color="green" variant="light" leftSection={<CheckCircleIcon sx={{ fontSize: 12 }} />}>
                  {summary.perfect} {t('pdfTextEditor.fontAnalysis.perfect', 'perfect')}
                </Badge>
              )}
              {summary.embeddedSubset > 0 && (
                <Badge size="xs" color="blue" variant="light" leftSection={<InfoIcon sx={{ fontSize: 12 }} />}>
                  {summary.embeddedSubset} {t('pdfTextEditor.fontAnalysis.subset', 'subset')}
                </Badge>
              )}
              {summary.systemFallback > 0 && (
                <Badge size="xs" color="yellow" variant="light" leftSection={<WarningIcon sx={{ fontSize: 12 }} />}>
                  {summary.systemFallback} {t('pdfTextEditor.fontAnalysis.fallback', 'fallback')}
                </Badge>
              )}
              {summary.missing > 0 && (
                <Badge size="xs" color="red" variant="light" leftSection={<ErrorIcon sx={{ fontSize: 12 }} />}>
                  {summary.missing} {t('pdfTextEditor.fontAnalysis.missing', 'missing')}
                </Badge>
              )}
            </Group>

            {/* Font List */}
            <Stack gap={4} mt="xs">
              {fonts.map((font, index) => (
                <FontDetailItem key={`${font.fontId}-${index}`} analysis={font} />
              ))}
            </Stack>
          </Stack>
        )}
      </div>
      <Divider style={{ color: '#E2E8F0', marginLeft: '1rem', marginRight: '-0.5rem' }} />
    </div>
  );
};

export default FontStatusPanel;
