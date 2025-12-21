import React from 'react';
import { Accordion, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PdfPerPageInfo, PdfPageInfo, PdfFontInfo } from '@app/types/getPdfInfo';
import SectionBlock from '@app/components/tools/getPdfInfo/shared/SectionBlock';
import KeyValueList from '@app/components/tools/getPdfInfo/shared/KeyValueList';
import { pdfInfoAccordionStyles } from '@app/components/tools/getPdfInfo/shared/accordionStyles';

interface PerPageSectionProps {
  anchorId: string;
  perPage?: PdfPerPageInfo | null;
}

const renderImagesList = (images: PdfImageInfo[] | undefined, emptyText: string) => {
  if (!images || images.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>;
  return (
    <Stack gap={4}>
      {images.map((image, idx) => (
        <div key={idx} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          <Text size="sm" c="dimmed">
            {image.Name ? `${image.Name} ` : 'Image '}
            ({image.Width}×{image.Height}px
            {image.ColorSpace ? `, ${image.ColorSpace}` : ''})
          </Text>
        </div>
      ))}
    </Stack>
  );
};

const renderList = (arr: unknown[] | undefined, emptyText: string) => {
  if (!arr || arr.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>;
  return (
    <Stack gap={4}>
      {arr.map((item, idx) => (
        <Text key={idx} size="sm" c="dimmed" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          {typeof item === 'string' ? item : JSON.stringify(item)}
        </Text>
      ))}
    </Stack>
  );
};

const renderFontsList = (fonts: PdfFontInfo[] | undefined, emptyText: string) => {
  if (!fonts || fonts.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>;
  return (
    <Stack gap={4}>
      {fonts.map((font, idx) => (
        <Text key={idx} size="sm" c="dimmed" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          {`${font.Name ?? 'Unknown'}${font.IsEmbedded ? ' (embedded)' : ''}`}
        </Text>
      ))}
    </Stack>
  );
};

const PerPageSection: React.FC<PerPageSectionProps> = ({ anchorId, perPage }) => {
  const { t } = useTranslation();
  const noneDetected = t('getPdfInfo.noneDetected', 'None detected');

  const hasPages = perPage && Object.keys(perPage).length > 0;

  return (
    <SectionBlock title={t('getPdfInfo.sections.perPageInfo', 'Per Page Info')} anchorId={anchorId}>
      {hasPages ? (
        <Accordion
          variant="separated"
          radius="md"
          defaultValue=""
          styles={pdfInfoAccordionStyles}
        >
          {Object.entries(perPage).map(([pageLabel, pageInfo]: [string, PdfPageInfo]) => (
            <Accordion.Item key={pageLabel} value={pageLabel}>
              <Accordion.Control>
                <Text fw={600} size="sm">{pageLabel}</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <div style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-primary)', borderRadius: 8, padding: 12 }}>
                  <Stack gap="sm">
                    {pageInfo?.Size && (
                      <Stack gap={4}>
                        <Text fw={600} size="sm">{t('getPdfInfo.perPage.size', 'Size')}</Text>
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
                        <Text fw={600} size="sm">{t('getPdfInfo.perPage.annotations', 'Annotations')}</Text>
                        <KeyValueList obj={pageInfo.Annotations} />
                      </Stack>
                    )}
                    <Stack gap={4}>
                      <Text fw={600} size="sm">{t('getPdfInfo.perPage.images', 'Images')}</Text>
                      {renderImagesList(pageInfo?.Images, noneDetected)}
                    </Stack>
                    <Stack gap={4}>
                      <Text fw={600} size="sm">{t('getPdfInfo.perPage.links', 'Links')}</Text>
                      {renderList(pageInfo?.Links, noneDetected)}
                    </Stack>
                    <Stack gap={4}>
                      <Text fw={600} size="sm">{t('getPdfInfo.perPage.fonts', 'Fonts')}</Text>
                      {renderFontsList(pageInfo?.Fonts, noneDetected)}
                    </Stack>
                    {pageInfo?.XObjectCounts && (
                      <Stack gap={4}>
                        <Text fw={600} size="sm">{t('getPdfInfo.perPage.xobjects', 'XObject Counts')}</Text>
                        <KeyValueList obj={pageInfo.XObjectCounts} />
                      </Stack>
                    )}
                    <Stack gap={4}>
                      <Text fw={600} size="sm">{t('getPdfInfo.perPage.multimedia', 'Multimedia')}</Text>
                      {renderList(pageInfo?.Multimedia, noneDetected)}
                    </Stack>
                  </Stack>
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      ) : (
        <Text size="sm" c="dimmed">{noneDetected}</Text>
      )}
    </SectionBlock>
  );
};

export default PerPageSection;


