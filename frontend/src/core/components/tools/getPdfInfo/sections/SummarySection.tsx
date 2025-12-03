import React, { useMemo } from 'react';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { ParsedPdfSections, PdfFontInfo } from '@app/types/getPdfInfo';
import SectionBlock from '@app/components/tools/getPdfInfo/shared/SectionBlock';
import KeyValueList from '@app/components/tools/getPdfInfo/shared/KeyValueList';

interface SummarySectionProps {
  sections: ParsedPdfSections;
  hideSectionTitle?: boolean;
}

const SummarySection: React.FC<SummarySectionProps> = ({ sections, hideSectionTitle = false }) => {
  const { t } = useTranslation();

  const summaryBlocks = useMemo(() => {
    const basic = sections.basicInfo ?? {};
    const docInfo = sections.documentInfo ?? {};
    const metadata = sections.metadata ?? {};
    const encryption = sections.encryption ?? {};
    const permissions = sections.permissions ?? {};
    const summary = sections.summaryData ?? {};
    const other = sections.other ?? {};
    const perPage = sections.perPage ?? {};

    const pages = basic['Number of pages'];
    const fileSizeBytes = basic.FileSizeInBytes;
    const pdfVersion = docInfo['PDF version'];
    const language = basic.Language;

    const basicInformation: Record<string, unknown> = {
      [t('getPdfInfo.summary.pages', 'Pages')]: pages,
      [t('getPdfInfo.summary.fileSize', 'File Size')]: typeof fileSizeBytes === 'number' ? `${(fileSizeBytes / 1024).toFixed(2)} KB` : fileSizeBytes,
      [t('getPdfInfo.summary.pdfVersion', 'PDF Version')]: pdfVersion,
      [t('getPdfInfo.summary.language', 'Language')]: language,
    };

    const documentInformation: Record<string, unknown> = {
      [t('getPdfInfo.summary.title', 'Title')]: metadata.Title,
      [t('getPdfInfo.summary.author', 'Author')]: metadata.Author,
      [t('getPdfInfo.summary.created', 'Created')]: metadata.CreationDate,
      [t('getPdfInfo.summary.modified', 'Modified')]: metadata.ModificationDate,
    };

    const securityStatusText = encryption.IsEncrypted
      ? t('getPdfInfo.summary.security.encrypted', 'Encrypted PDF - Password protection present')
      : t('getPdfInfo.summary.security.unencrypted', 'Unencrypted PDF - No password protection');

    const restrictedCount = summary.restrictedPermissionsCount ?? 0;
    const permissionsAllAllowed = Object.values(permissions).every((v) => v === 'Allowed');
    const permSummary = permissionsAllAllowed
      ? t('getPdfInfo.summary.permsAll', 'All Permissions Allowed')
      : restrictedCount > 0
        ? t('getPdfInfo.summary.permsRestricted', '{{count}} restrictions', { count: restrictedCount })
        : t('getPdfInfo.summary.permsMixed', 'Some permissions restricted');

    const complianceText = sections.compliance && Object.values(sections.compliance).some(Boolean)
      ? t('getPdfInfo.summary.hasCompliance', 'Has compliance standards')
      : t('getPdfInfo.summary.noCompliance', 'No Compliance Standards');

    // Helper to get first page data
    const firstPage = perPage['Page 1'];
    const firstPageFonts: PdfFontInfo[] = firstPage?.Fonts ?? [];

    const technical: Record<string, unknown> = {
      [t('getPdfInfo.summary.tech.images', 'Images')]: (() => {
        const total = basic.TotalImages;
        if (typeof total === 'number') return total === 0 ? 'None' : `${total}`;
        return 'None';
      })(),
      [t('getPdfInfo.summary.tech.fonts', 'Fonts')]: (() => {
        if (firstPageFonts.length === 0) return 'None';
        const embedded = firstPageFonts.filter((f) => f.IsEmbedded).length;
        return `${firstPageFonts.length} (${embedded} embedded)`;
      })(),
      [t('getPdfInfo.summary.tech.formFields', 'Form Fields')]: sections.formFields && Object.keys(sections.formFields).length > 0 ? Object.keys(sections.formFields).length : 'None',
      [t('getPdfInfo.summary.tech.embeddedFiles', 'Embedded Files')]: other.EmbeddedFiles?.length ?? 'None',
      [t('getPdfInfo.summary.tech.javaScript', 'JavaScript')]: other.JavaScript?.length ?? 'None',
      [t('getPdfInfo.summary.tech.layers', 'Layers')]: other.Layers?.length ?? 'None',
      [t('getPdfInfo.summary.tech.bookmarks', 'Bookmarks')]: sections.toc?.length ?? 'None',
      [t('getPdfInfo.summary.tech.multimedia', 'Multimedia')]: firstPage?.Multimedia?.length ?? 'None',
    };

    const overview = (() => {
      const tTitle = metadata.Title ? `"${metadata.Title}"` : t('getPdfInfo.summary.overview.untitled', 'an untitled document');
      const author = metadata.Author || t('getPdfInfo.summary.overview.unknown', 'Unknown Author');
      const pagesCount = typeof pages === 'number' ? pages : '?';
      const version = pdfVersion ?? '?';
      return t('getPdfInfo.summary.overview.text', 'This is a {{pages}}-page PDF titled {{title}} created by {{author}} (PDF version {{version}}).', {
        pages: pagesCount,
        title: tTitle,
        author,
        version,
      });
    })();

    return {
      basicInformation,
      documentInformation,
      securityStatusText,
      permSummary,
      complianceText,
      technical,
      overview,
    };
  }, [sections, t]);

  const content = (
    <Stack gap="md">
      <Stack gap={6}>
        <Text fw={600} size="sm">{t('getPdfInfo.summary.basic', 'Basic Information')}</Text>
        <KeyValueList obj={summaryBlocks.basicInformation} />
      </Stack>
      <Stack gap={6}>
        <Text fw={600} size="sm">{t('getPdfInfo.summary.documentInfo', 'Document Information')}</Text>
        <KeyValueList obj={summaryBlocks.documentInformation} />
      </Stack>
      <Stack gap={6}>
        <Text fw={600} size="sm">{t('getPdfInfo.summary.securityTitle', 'Security Status')}</Text>
        <Text size="sm" c="dimmed">{summaryBlocks.securityStatusText}</Text>
        <Text size="sm" c="dimmed">{summaryBlocks.permSummary}</Text>
        <Text size="sm" c="dimmed">{summaryBlocks.complianceText}</Text>
      </Stack>
      <Stack gap={6}>
        <Text fw={600} size="sm">{t('getPdfInfo.summary.technical', 'Technical')}</Text>
        <KeyValueList obj={summaryBlocks.technical} />
      </Stack>
      <Stack gap={6}>
        <Text fw={600} size="sm">{t('getPdfInfo.summary.overviewTitle', 'PDF Overview')}</Text>
        <Text size="sm" c="dimmed">{summaryBlocks.overview}</Text>
      </Stack>
    </Stack>
  );

  if (hideSectionTitle) {
    return <div id="summary">{content}</div>;
  }

  return (
    <SectionBlock title={t('getPdfInfo.summary.title', 'PDF Summary')} anchorId="summary">
      {content}
    </SectionBlock>
  );
};

export default SummarySection;


