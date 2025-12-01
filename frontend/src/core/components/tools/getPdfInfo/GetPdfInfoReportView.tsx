import React, { useEffect, useMemo, useRef } from 'react';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PdfInfoReportData, PdfInfoReportEntry } from '@app/types/getPdfInfo';
import '@app/components/tools/validateSignature/reportView/styles.css';
import SummarySection from './sections/SummarySection';
import KeyValueSection from './sections/KeyValueSection';
import TableOfContentsSection from './sections/TableOfContentsSection';
import OtherSection from './sections/OtherSection';
import PerPageSection from './sections/PerPageSection';

interface GetPdfInfoReportViewProps {
  data: PdfInfoReportData & { scrollTo?: string | null };
}

const GetPdfInfoReportView: React.FC<GetPdfInfoReportViewProps> = ({ data }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const entry: PdfInfoReportEntry | null = data.entries[0] ?? null;

  useEffect(() => {
    if (!data.scrollTo) return;
    const idMap: Record<string, string> = {
      summary: 'summary',
      metadata: 'metadata',
      formFields: 'formFields',
      basicInfo: 'basicInfo',
      documentInfo: 'documentInfo',
      compliance: 'compliance',
      encryption: 'encryption',
      permissions: 'permissions',
      toc: 'toc',
      other: 'other',
      perPage: 'perPage',
    };
    const anchor = idMap[data.scrollTo];
    if (!anchor) return;
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

  const sections = useMemo(() => {
    const raw = entry?.data ?? {};
    return {
      metadata: (raw as any)['Metadata'] as Record<string, unknown> | undefined,
      formFields: (raw as any)['FormFields'] ?? (raw as any)['Form Fields'],
      basicInfo: (raw as any)['BasicInfo'] ?? (raw as any)['Basic Info'],
      documentInfo: (raw as any)['DocumentInfo'] ?? (raw as any)['Document Info'],
      compliance: (raw as any)['Compliancy'] ?? (raw as any)['Compliance'],
      encryption: (raw as any)['Encryption'] as Record<string, unknown> | undefined,
      permissions: (raw as any)['Permissions'] as Record<string, unknown> | undefined,
      toc: (raw as any)['Bookmarks/Outline/TOC'] ?? (raw as any)['Table of Contents'],
      other: (raw as any)['Other'] as Record<string, unknown> | undefined,
      perPage: (raw as any)['PerPageInfo'] ?? (raw as any)['Per Page Info'],
      summaryData: (raw as any)['SummaryData'] as Record<string, unknown> | undefined,
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
              <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={700} size="xl" style={{ lineHeight: 1.1 }}>
                  {entry.fileName}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('getPdfInfo.report.entryLabel', 'Full information summary')}
                </Text>
              </div>
            </Group>

            <SummarySection sections={sections as any} />

            <KeyValueSection title={t('getPdfInfo.sections.metadata', 'Metadata')} anchorId="metadata" obj={sections.metadata ?? null} />

            <KeyValueSection title={t('getPdfInfo.sections.formFields', 'Form Fields')} anchorId="formFields" obj={sections.formFields as any} />

            <KeyValueSection title={t('getPdfInfo.sections.basicInfo', 'Basic Info')} anchorId="basicInfo" obj={sections.basicInfo ?? null} />

            <KeyValueSection title={t('getPdfInfo.sections.documentInfo', 'Document Info')} anchorId="documentInfo" obj={sections.documentInfo ?? null} />

            <KeyValueSection title={t('getPdfInfo.sections.compliance', 'Compliance')} anchorId="compliance" obj={sections.compliance ?? null} />

            <KeyValueSection title={t('getPdfInfo.sections.encryption', 'Encryption')} anchorId="encryption" obj={sections.encryption ?? null} />

            <KeyValueSection title={t('getPdfInfo.sections.permissions', 'Permissions')} anchorId="permissions" obj={sections.permissions ?? null} />

            <TableOfContentsSection anchorId="toc" tocArray={Array.isArray(sections.toc) ? (sections.toc as any[]) : []} />

            <OtherSection anchorId="other" other={sections.other as any} />

            <PerPageSection anchorId="perPage" perPage={sections.perPage as any} />
          </Stack>
        </div>
      </Stack>
    </div>
  );
};

export default GetPdfInfoReportView;


