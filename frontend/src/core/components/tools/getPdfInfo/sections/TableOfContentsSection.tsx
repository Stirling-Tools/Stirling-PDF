import React from 'react';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PdfTocEntry } from '@app/types/getPdfInfo';
import SectionBlock from '@app/components/tools/getPdfInfo/shared/SectionBlock';

interface TableOfContentsSectionProps {
  anchorId: string;
  tocArray: PdfTocEntry[];
}

const TableOfContentsSection: React.FC<TableOfContentsSectionProps> = ({ anchorId, tocArray }) => {
  const { t } = useTranslation();
  const noneDetected = t('getPdfInfo.noneDetected', 'None detected');

  return (
    <SectionBlock title={t('getPdfInfo.sections.tableOfContents', 'Table of Contents')} anchorId={anchorId}>
      {!tocArray || tocArray.length === 0 ? (
        <Text size="sm" c="dimmed">{noneDetected}</Text>
      ) : (
        <Stack gap={4}>
          {tocArray.map((item, idx) => (
            <Text key={idx} size="sm" c="dimmed">
              {typeof item === 'string' ? item : JSON.stringify(item)}
            </Text>
          ))}
        </Stack>
      )}
    </SectionBlock>
  );
};

export default TableOfContentsSection;


