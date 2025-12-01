import React from 'react';
import { Accordion, Code, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import SectionBlock from '../shared/SectionBlock';
import SimpleArrayList from '../shared/SimpleArrayList';
import { pdfInfoAccordionStyles } from '../shared/accordionStyles';

interface OtherSectionProps {
  anchorId: string;
  other?: Record<string, any> | null;
}

const OtherSection: React.FC<OtherSectionProps> = ({ anchorId, other }) => {
  const { t } = useTranslation();
  const panelBg = 'var(--bg-raised)';
  const panelText = 'var(--text-primary)';
  return (
    <SectionBlock title={t('getPdfInfo.sections.other', 'Other')} anchorId={anchorId}>
      <Stack gap="sm">
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.attachments', 'Attachments')}</Text>
          <SimpleArrayList arr={Array.isArray(other?.Attachments) ? other?.Attachments : []} />
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.embeddedFiles', 'Embedded Files')}</Text>
          <SimpleArrayList arr={Array.isArray(other?.EmbeddedFiles) ? other?.EmbeddedFiles : []} />
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.javaScript', 'JavaScript')}</Text>
          <SimpleArrayList arr={Array.isArray(other?.JavaScript) ? other?.JavaScript : []} />
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.other.layers', 'Layers')}</Text>
          <SimpleArrayList arr={Array.isArray(other?.Layers) ? other?.Layers : []} />
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
              {Array.isArray(other?.StructureTree) && other?.StructureTree.length > 0
                ? <Code
                    block
                    style={{
                      whiteSpace: 'pre-wrap',
                      backgroundColor: panelBg,
                      color: panelText,
                      maxHeight: '20rem',
                      overflowY: 'auto'
                    }}
                  >
                    {JSON.stringify(other?.StructureTree, null, 2)}
                  </Code>
                : <Text size="sm" c="dimmed">{t('getPdfInfo.noneDetected', 'None detected')}</Text>}
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="xmp">
            <Accordion.Control>
              <Text fw={600} size="sm">{t('getPdfInfo.other.xmp', 'XMPMetadata')}</Text>
            </Accordion.Control>
            <Accordion.Panel>
              {other?.XMPMetadata
                ? <Code
                    block
                    style={{
                      whiteSpace: 'pre-wrap',
                      backgroundColor: panelBg,
                      color: panelText,
                      maxHeight: '400px',
                      overflowY: 'auto'
                    }}
                  >
                    {String(other?.XMPMetadata)}
                  </Code>
                : <Text size="sm" c="dimmed">{t('getPdfInfo.noneDetected', 'None detected')}</Text>}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </SectionBlock>
  );
};

export default OtherSection;


