import React, { useMemo, useState } from 'react';
import {
  Accordion,
  Badge,
  Box,
  Code,
  Collapse,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';

import { PdfJsonDocument } from '@app/tools/pdfTextEditor/pdfTextEditorTypes';
import {
  analyzeDocumentFonts,
  DocumentFontAnalysis,
  FontAnalysis,
  getFontStatusColor,
  getFontStatusDescription,
} from '@app/tools/pdfTextEditor/fontAnalysis';

interface FontStatusPanelProps {
  document: PdfJsonDocument | null;
  pageIndex?: number;
}

const FontStatusBadge = ({ analysis }: { analysis: FontAnalysis }) => {
  const color = getFontStatusColor(analysis.status);
  const description = getFontStatusDescription(analysis.status);

  const icon = useMemo(() => {
    switch (analysis.status) {
      case 'perfect':
        return <LocalIcon icon="check-circle-rounded" width={14} height={14} />;
      case 'embedded-subset':
        return <LocalIcon icon="info-rounded" width={14} height={14} />;
      case 'system-fallback':
        return <LocalIcon icon="warning-rounded" width={14} height={14} />;
      case 'missing':
        return <LocalIcon icon="error-rounded" width={14} height={14} />;
      default:
        return <LocalIcon icon="info-rounded" width={14} height={14} />;
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
    <Paper withBorder p="xs" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
      <Stack gap={4}>
        <Group justify="space-between">
          <Group gap={4}>
            <LocalIcon icon="font-download-rounded" width={16} height={16} />
            <Text size="xs" fw={500} lineClamp={1}>
              {analysis.baseName}
            </Text>
            {analysis.isSubset && (
              <Badge size="xs" color="gray" variant="outline">
                subset
              </Badge>
            )}
          </Group>
          <Group gap={4}>
            <FontStatusBadge analysis={analysis} />
            {expanded ? <LocalIcon icon="expand-less-rounded" width={16} height={16} /> : <LocalIcon icon="expand-more-rounded" width={16} height={16} />}
          </Group>
        </Group>

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

const FontStatusPanel: React.FC<FontStatusPanelProps> = ({ document, pageIndex }) => {
  const { t } = useTranslation();

  const fontAnalysis: DocumentFontAnalysis = useMemo(
    () => analyzeDocumentFonts(document, pageIndex),
    [document, pageIndex]
  );

  const { canReproducePerfectly, hasWarnings, summary, fonts } = fontAnalysis;

  const statusIcon = useMemo(() => {
    if (canReproducePerfectly) {
      return <LocalIcon icon="check-circle-rounded" width={16} height={16} />;
    }
    if (hasWarnings) {
      return <LocalIcon icon="warning-rounded" width={16} height={16} />;
    }
    return <LocalIcon icon="info-rounded" width={16} height={16} />;
  }, [canReproducePerfectly, hasWarnings]);

  // Early return AFTER all hooks are declared
  if (!document || fontAnalysis.fonts.length === 0) {
    return null;
  }

  const statusColor = canReproducePerfectly ? 'green' : hasWarnings ? 'yellow' : 'blue';

  const pageLabel = pageIndex !== undefined
    ? t('pdfTextEditor.fontAnalysis.currentPageFonts', 'Fonts on this page')
    : t('pdfTextEditor.fontAnalysis.allFonts', 'All fonts');

  return (
    <Accordion variant="contained" defaultValue={hasWarnings ? 'fonts' : undefined}>
      <Accordion.Item value="fonts">
        <Accordion.Control>
          <Group gap="xs" wrap="wrap" style={{ flex: 1 }}>
            <Group gap="xs" wrap="nowrap">
              {statusIcon}
              <Text size="sm" fw={500}>
                {pageLabel}
              </Text>
              <Badge size="xs" color={statusColor} variant="dot">
                {fonts.length}
              </Badge>
            </Group>

            {/* Warning badges BEFORE expansion */}
            <Group gap={4} wrap="wrap">
              {summary.systemFallback > 0 && (
                <Badge size="xs" color="yellow" variant="filled" leftSection={<LocalIcon icon="warning-rounded" width={12} height={12} />}>
                  {summary.systemFallback} {t('pdfTextEditor.fontAnalysis.fallback', 'fallback')}
                </Badge>
              )}
              {summary.missing > 0 && (
                <Badge size="xs" color="red" variant="filled" leftSection={<LocalIcon icon="error-rounded" width={12} height={12} />}>
                  {summary.missing} {t('pdfTextEditor.fontAnalysis.missing', 'missing')}
                </Badge>
              )}
            </Group>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="xs">
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
                <Badge size="xs" color="green" variant="light" leftSection={<LocalIcon icon="check-circle-rounded" width={12} height={12} />}>
                  {summary.perfect} {t('pdfTextEditor.fontAnalysis.perfect', 'perfect')}
                </Badge>
              )}
              {summary.embeddedSubset > 0 && (
                <Badge size="xs" color="blue" variant="light" leftSection={<LocalIcon icon="info-rounded" width={12} height={12} />}>
                  {summary.embeddedSubset} {t('pdfTextEditor.fontAnalysis.subset', 'subset')}
                </Badge>
              )}
              {summary.systemFallback > 0 && (
                <Badge size="xs" color="yellow" variant="light" leftSection={<LocalIcon icon="warning-rounded" width={12} height={12} />}>
                  {summary.systemFallback} {t('pdfTextEditor.fontAnalysis.fallback', 'fallback')}
                </Badge>
              )}
              {summary.missing > 0 && (
                <Badge size="xs" color="red" variant="light" leftSection={<LocalIcon icon="error-rounded" width={12} height={12} />}>
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
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

export default FontStatusPanel;
