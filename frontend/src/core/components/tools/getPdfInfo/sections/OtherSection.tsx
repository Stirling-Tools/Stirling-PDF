import React from 'react';
import { Accordion, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PdfOtherInfo, PdfAttachmentInfo } from '@app/types/getPdfInfo';
import SectionBlock from '@app/components/tools/getPdfInfo/shared/SectionBlock';
import ScrollableCodeBlock from '@app/components/tools/getPdfInfo/shared/ScrollableCodeBlock';
import { pdfInfoAccordionStyles } from '@app/components/tools/getPdfInfo/shared/accordionStyles';

interface OtherSectionProps {
  anchorId: string;
  other?: PdfOtherInfo | null;
}

const renderAttachmentsList = (attachments: PdfAttachmentInfo[] | undefined, emptyText: string) => {
  if (!attachments || attachments.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>;
  return (
    <Stack gap={4}>
      {attachments.map((attachment, idx) => (
        <div key={idx} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          <Text size="sm" c="dimmed">
            <strong>{attachment.Name || 'Unnamed attachment'}</strong>
            {attachment.Description && ` - ${attachment.Description}`}
            {attachment.FileSize != null && ` (${attachment.FileSize} bytes)`}
          </Text>
        </div>
      ))}
    </Stack>
  );
};

const renderEmbeddedFilesList = (embeddedFiles: PdfEmbeddedFileInfo[] | undefined, emptyText: string) => {
  if (!embeddedFiles || embeddedFiles.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>;
  return (
    <Stack gap={4}>
      {embeddedFiles.map((file, idx) => (
        <div key={idx} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          <Text size="sm" c="dimmed">
            <strong>{file.Name || 'Unnamed file'}</strong>
            {file.FileSize != null && ` (${file.FileSize} bytes)`}
            {file.MimeType && ` - ${file.MimeType}`}
            {file.CreationDate && ` - Created: ${file.CreationDate}`}
            {file.ModificationDate && ` - Modified: ${file.ModificationDate}`}
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

const OtherSection: React.FC<OtherSectionProps> = ({ anchorId, other }) => {
  const { t } = useTranslation();
  const noneDetected = t('getPdfInfo.noneDetected', 'None detected');

  const structureTreeContent = Array.isArray(other?.StructureTree) && other.StructureTree.length > 0
    ? JSON.stringify(other.StructureTree, null, 2)
    : null;

  return (
    <SectionBlock title={t('getPdfInfo.sections.other', 'Other')} anchorId={anchorId}>
      <Stack gap="sm">
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.attachments', 'Attachments')}</Text>
          {renderAttachmentsList(other?.Attachments, noneDetected)}
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.embeddedFiles', 'Embedded Files')}</Text>
          {renderEmbeddedFilesList(other?.EmbeddedFiles, noneDetected)}
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.javaScript', 'JavaScript')}</Text>
          {renderList(other?.JavaScript, noneDetected)}
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.layers', 'Layers')}</Text>
          {renderList(other?.Layers, noneDetected)}
        </Stack>
        <Accordion
          variant="separated"
          radius="md"
          defaultValue=""
          styles={pdfInfoAccordionStyles}
        >
          <Accordion.Item value="structureTree">
            <Accordion.Control>
              <Text fw={600} size="sm">{t('getPdfInfo.other.structureTree', 'StructureTree')}</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <ScrollableCodeBlock content={structureTreeContent} maxHeight="20rem" />
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="xmp">
            <Accordion.Control>
              <Text fw={600} size="sm">{t('getPdfInfo.other.xmp', 'XMPMetadata')}</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <ScrollableCodeBlock content={other?.XMPMetadata} maxHeight="400px" />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </SectionBlock>
  );
};

export default OtherSection;


