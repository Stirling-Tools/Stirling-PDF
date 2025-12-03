import React, { useEffect, useMemo, useRef } from 'react';
import { Badge, Divider, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type {
  PdfInfoReportData,
  PdfInfoReportEntry,
  PdfInfoBackendData,
  ParsedPdfSections,
} from '@app/types/getPdfInfo';
import '@app/components/tools/validateSignature/reportView/styles.css';
import SummarySection from '@app/components/tools/getPdfInfo/sections/SummarySection';
import KeyValueSection from '@app/components/tools/getPdfInfo/sections/KeyValueSection';
import TableOfContentsSection from '@app/components/tools/getPdfInfo/sections/TableOfContentsSection';
import OtherSection from '@app/components/tools/getPdfInfo/sections/OtherSection';
import PerPageSection from '@app/components/tools/getPdfInfo/sections/PerPageSection';


/** Valid section anchor IDs for navigation */
const VALID_ANCHORS = new Set([
  'summary', 'metadata', 'formFields', 'basicInfo', 'documentInfo',
  'compliance', 'encryption', 'permissions', 'toc', 'other', 'perPage',
]);

interface GetPdfInfoReportViewProps {
  data: PdfInfoReportData & { scrollTo?: string | null };
}

const GetPdfInfoReportView: React.FC<GetPdfInfoReportViewProps> = ({ data }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const entry: PdfInfoReportEntry | null = data.entries[0] ?? null;

  useEffect(() => {
    if (!data.scrollTo || !VALID_ANCHORS.has(data.scrollTo)) return;
    const anchor = data.scrollTo;
    const container = containerRef.current;
    const el = container?.querySelector<HTMLElement>(`#${anchor}`);
    if (el && container) {
      // Calculate scroll position with 4rem buffer from top
      const bufferPx = parseFloat(getComputedStyle(document.documentElement).fontSize) * 4;
      const elementTop = el.getBoundingClientRect().top;
      const containerTop = container.getBoundingClientRect().top;
      const currentScroll = container.scrollTop;
      const targetScroll = currentScroll + (elementTop - containerTop) - bufferPx;
      
      container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
      
      // Flash highlight the section
      el.classList.remove('section-flash-highlight');
      void el.offsetWidth; // Force reflow
      el.classList.add('section-flash-highlight');
      setTimeout(() => el.classList.remove('section-flash-highlight'), 1500);
    }
  }, [data.scrollTo]);

  const sections = useMemo((): ParsedPdfSections => {
    const raw: PdfInfoBackendData = entry?.data ?? {};
    return {
      metadata: raw.Metadata ?? null,
      formFields: raw.FormFields ?? raw['Form Fields'] ?? null,
      basicInfo: raw.BasicInfo ?? raw['Basic Info'] ?? null,
      documentInfo: raw.DocumentInfo ?? raw['Document Info'] ?? null,
      compliance: raw.Compliancy ?? raw.Compliance ?? null,
      encryption: raw.Encryption ?? null,
      permissions: raw.Permissions ?? null,
      toc: raw['Bookmarks/Outline/TOC'] ?? raw['Table of Contents'] ?? null,
      other: raw.Other ?? null,
      perPage: raw.PerPageInfo ?? raw['Per Page Info'] ?? null,
      summaryData: raw.SummaryData ?? null,
    };
  }, [entry]);

  if (!entry) {
    return (
      <div className="report-container">
        <Stack gap="md" align="center">
          <Badge color="gray" variant="light">No Data</Badge>
          <Text size="sm" c="dimmed">Run the tool to generate the report.</Text>
        </Stack>
      </div>
    );
  }

  return (
    <div className="report-container" ref={containerRef}>
      <Stack gap="xl" align="center">

        <div className="simulated-page">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text fw={700} size="xl" style={{ lineHeight: 1.3, wordBreak: 'break-word' }}>
                {entry.fileName}
                <Text component="span" fw={700}> - {t('getPdfInfo.summary.title', 'PDF Summary')}</Text>
              </Text>
              <Divider />
            </Stack>

            <SummarySection sections={sections} hideSectionTitle />

            <KeyValueSection title={t('getPdfInfo.sections.metadata', 'Metadata')} anchorId="metadata" obj={sections.metadata} />

            <KeyValueSection title={t('getPdfInfo.sections.formFields', 'Form Fields')} anchorId="formFields" obj={sections.formFields} />

            <KeyValueSection title={t('getPdfInfo.sections.basicInfo', 'Basic Info')} anchorId="basicInfo" obj={sections.basicInfo} />

            <KeyValueSection title={t('getPdfInfo.sections.documentInfo', 'Document Info')} anchorId="documentInfo" obj={sections.documentInfo} />

            <KeyValueSection title={t('getPdfInfo.sections.compliance', 'Compliance')} anchorId="compliance" obj={sections.compliance} />

            <KeyValueSection title={t('getPdfInfo.sections.encryption', 'Encryption')} anchorId="encryption" obj={sections.encryption} />

            <KeyValueSection title={t('getPdfInfo.sections.permissions', 'Permissions')} anchorId="permissions" obj={sections.permissions} />

            <TableOfContentsSection anchorId="toc" tocArray={sections.toc ?? []} />

            <OtherSection anchorId="other" other={sections.other} />

            <PerPageSection anchorId="perPage" perPage={sections.perPage} />
          </Stack>
        </div>
      </Stack>
    </div>
  );
};

export default GetPdfInfoReportView;


