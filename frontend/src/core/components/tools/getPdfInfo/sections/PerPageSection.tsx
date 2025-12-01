import React from 'react';
import { Accordion, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import SectionBlock from '../shared/SectionBlock';
import KeyValueList from '../shared/KeyValueList';
import SimpleArrayList from '../shared/SimpleArrayList';
import { pdfInfoAccordionStyles } from '../shared/accordionStyles';

interface PerPageSectionProps {
  anchorId: string;
  perPage?: Record<string, any> | null;
}

const PerPageSection: React.FC<PerPageSectionProps> = ({ anchorId, perPage }) => {
  const { t } = useTranslation();
  const panelBg = 'var(--bg-raised)';
  const panelText = 'var(--text-primary)';

  return (
    <SectionBlock title={t('getPdfInfo.sections.perPageInfo', 'Per Page Info')} anchorId={anchorId}>
      {perPage && Object.keys(perPage as any).length > 0 ? (
        <Accordion
          variant="separated"
          radius="md"
          defaultValue=""
          styles={pdfInfoAccordionStyles}
        >
          {Object.entries(perPage as any).map(([pageLabel, pageInfo]: [string, any]) => (
            <Accordion.Item key={pageLabel} value={pageLabel}>
              <Accordion.Control>
                <Group justify="space-between" w="100%" gap="xs">
                  <Text fw={600} size="sm">{pageLabel}</Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <div style={{ backgroundColor: panelBg, color: panelText, borderRadius: 8, padding: 12 }}>
                  <Stack gap="sm">
                    {pageInfo?.Size && (
                      <Stack gap={4}>
                        <Text size="sm" fw={600}>{t('getPdfInfo.perPage.size', 'Size')}</Text>
                        <KeyValueList obj={pageInfo.Size} />
                      </Stack>
                    )}
                    <KeyValueList obj={{
                      'Rotation': pageInfo?.Rotation,
                      'Page Orientation': pageInfo?.['Page Orientation'],
                      'MediaBox': pageInfo?.MediaBox,
                      'CropBox': pageInfo?.CropBox,
                      'BleedBox': pageInfo?.BleedBox,
                      'TrimBox': pageInfo?.TrimBox,
                      'ArtBox': pageInfo?.ArtBox,
                      'Text Characters Count': pageInfo?.['Text Characters Count'],
                    }} />
                    {pageInfo?.Annotations && (
                      <Stack gap={4}>
                        <Text size="sm" fw={600}>{t('getPdfInfo.perPage.annotations', 'Annotations')}</Text>
                        <KeyValueList obj={pageInfo.Annotations} />
                      </Stack>
                    )}
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>{t('getPdfInfo.perPage.images', 'Images')}</Text>
                      <SimpleArrayList arr={Array.isArray(pageInfo?.Images) ? pageInfo.Images : []} />
                    </Stack>
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>{t('getPdfInfo.perPage.links', 'Links')}</Text>
                      <SimpleArrayList arr={Array.isArray(pageInfo?.Links) ? pageInfo.Links : []} />
                    </Stack>
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>{t('getPdfInfo.perPage.fonts', 'Fonts')}</Text>
                      {Array.isArray(pageInfo?.Fonts) && pageInfo.Fonts.length > 0
                        ? (
                          <Stack gap={4}>
                            {pageInfo.Fonts.map((f: any, idx: number) => (
                              <Text key={idx} size="sm" c="dimmed">
                                {`${f?.Name ?? 'Unknown'}${f?.IsEmbedded ? ' (embedded)' : ''}`}
                              </Text>
                            ))}
                          </Stack>
                        )
                        : <Text size="sm" c="dimmed">{t('getPdfInfo.noneDetected', 'None detected')}</Text>}
                    </Stack>
                    {pageInfo?.XObjectCounts && (
                      <Stack gap={4}>
                        <Text size="sm" fw={600}>{t('getPdfInfo.perPage.xobjects', 'XObject Counts')}</Text>
                        <KeyValueList obj={pageInfo.XObjectCounts} />
                      </Stack>
                    )}
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>{t('getPdfInfo.perPage.multimedia', 'Multimedia')}</Text>
                      <SimpleArrayList arr={Array.isArray(pageInfo?.Multimedia) ? pageInfo.Multimedia : []} />
                    </Stack>
                  </Stack>
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      ) : (
        <Text size="sm" c="dimmed">{t('getPdfInfo.noneDetected', 'None detected')}</Text>
      )}
    </SectionBlock>
  );
};

export default PerPageSection;


