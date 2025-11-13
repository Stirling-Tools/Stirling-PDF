import React, { useMemo } from 'react';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import SectionBlock from '../shared/SectionBlock';
import KeyValueList from '../shared/KeyValueList';

type SectionsData = {
  metadata?: Record<string, unknown>;
  formFields?: Record<string, unknown>;
  basicInfo?: Record<string, any>;
  documentInfo?: Record<string, any>;
  compliance?: Record<string, any>;
  encryption?: Record<string, any>;
  permissions?: Record<string, any>;
  toc?: any;
  other?: Record<string, any>;
  perPage?: Record<string, any>;
  summaryData?: Record<string, any>;
};

interface SummarySectionProps {
  sections: SectionsData;
}

const SummarySection: React.FC<SummarySectionProps> = ({ sections }) => {
  const { t } = useTranslation();

  const summaryBlocks = useMemo(() => {
    const basic = (sections.basicInfo as any) || {};
    const docInfo = (sections.documentInfo as any) || {};
    const metadata = (sections.metadata as any) || {};
    const encryption = (sections.encryption as any) || {};
    const permissions = (sections.permissions as any) || {};
    const summary = (sections.summaryData as any) || {};

    const pages = basic['Number of pages'];
    const fileSizeBytes = basic['FileSizeInBytes'];
    const pdfVersion = docInfo['PDF version'];
    const language = basic['Language'];

    const basicInformation: Record<string, unknown> = {
      [t('getPdfInfo.summary.pages', 'Pages')]: pages,
      [t('getPdfInfo.summary.fileSize', 'File Size')]: typeof fileSizeBytes === 'number' ? `${(fileSizeBytes / 1024).toFixed(2)} KB` : fileSizeBytes,
      [t('getPdfInfo.summary.pdfVersion', 'PDF Version')]: pdfVersion,
      [t('getPdfInfo.summary.language', 'Language')]: language,
    };

    const documentInformation: Record<string, unknown> = {
      [t('getPdfInfo.summary.title', 'Title')]: metadata['Title'],
      [t('getPdfInfo.summary.author', 'Author')]: metadata['Author'],
      [t('getPdfInfo.summary.created', 'Created')]: metadata['CreationDate'],
      [t('getPdfInfo.summary.modified', 'Modified')]: metadata['ModificationDate'],
    };

    let securityStatusText = '';
    if (encryption?.IsEncrypted) {
      securityStatusText = t('getPdfInfo.summary.security.encrypted', 'Encrypted PDF - Password protection present');
    } else {
      securityStatusText = t('getPdfInfo.summary.security.unencrypted', 'Unencrypted PDF - No password protection');
    }
    const restrictedCount = typeof summary?.restrictedPermissionsCount === 'number' ? summary.restrictedPermissionsCount : 0;
    const permissionsAllAllowed = Object.values(permissions || {}).every((v) => v === 'Allowed');
    const permSummary = permissionsAllAllowed
      ? t('getPdfInfo.summary.permsAll', 'All Permissions Allowed')
      : restrictedCount > 0
        ? t('getPdfInfo.summary.permsRestricted', '{{count}} restrictions', { count: restrictedCount })
        : t('getPdfInfo.summary.permsMixed', 'Some permissions restricted');

    const complianceText = sections.compliance && Object.values(sections.compliance).some(Boolean)
      ? t('getPdfInfo.summary.hasCompliance', 'Has compliance standards')
      : t('getPdfInfo.summary.noCompliance', 'No Compliance Standards');

    const technical: Record<string, unknown> = {
      [t('getPdfInfo.summary.tech.images', 'Images')]: (() => {
        const total = basic['TotalImages'];
        if (typeof total === 'number') return total === 0 ? 'None' : `${total}`;
        return 'None';
      })(),
      [t('getPdfInfo.summary.tech.fonts', 'Fonts')]: (() => {
        const pages = sections.perPage as any;
        const firstPage = pages ? pages['Page 1'] : undefined;
        const fonts = Array.isArray(firstPage?.Fonts) ? firstPage.Fonts : [];
        if (!fonts || fonts.length === 0) return 'None';
        const embedded = fonts.filter((f: any) => f?.IsEmbedded).length;
        return `${fonts.length} (${embedded} embedded)`;
      })(),
      [t('getPdfInfo.summary.tech.formFields', 'Form Fields')]: sections.formFields && Object.keys(sections.formFields as any).length > 0 ? Object.keys(sections.formFields as any).length : 'None',
      [t('getPdfInfo.summary.tech.embeddedFiles', 'Embedded Files')]: Array.isArray((sections.other as any)?.EmbeddedFiles) ? (sections.other as any).EmbeddedFiles.length : 'None',
      [t('getPdfInfo.summary.tech.javaScript', 'JavaScript')]: Array.isArray((sections.other as any)?.JavaScript) ? (sections.other as any).JavaScript.length : 'None',
      [t('getPdfInfo.summary.tech.layers', 'Layers')]: Array.isArray((sections.other as any)?.Layers) ? (sections.other as any).Layers.length : 'None',
      [t('getPdfInfo.summary.tech.bookmarks', 'Bookmarks')]: Array.isArray(sections.toc as any[]) ? (sections.toc as any[]).length : 'None',
      [t('getPdfInfo.summary.tech.multimedia', 'Multimedia')]: (() => {
        const pages = sections.perPage as any;
        const firstPage = pages ? pages['Page 1'] : undefined;
        const media = Array.isArray(firstPage?.Multimedia) ? firstPage.Multimedia : [];
        return media.length === 0 ? 'None' : `${media.length}`;
      })(),
    };

    const overview = (() => {
      const tTitle = metadata['Title'] ? `"${metadata['Title']}"` : t('getPdfInfo.summary.overview.untitled', 'an untitled document');
      const author = metadata['Author'] || t('getPdfInfo.summary.overview.unknown', 'Unknown Author');
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

  return (
    <SectionBlock title={t('getPdfInfo.summary.title', 'PDF Summary')} anchorId="summary">
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
          <Text fw={600} size="sm">{t('getPdfInfo.summary.security', 'Security Status')}</Text>
          <Text size="sm" c="dimmed">{summaryBlocks.securityStatusText}</Text>
          <Text size="sm" c="dimmed">{summaryBlocks.permSummary}</Text>
          <Text size="sm" c="dimmed">{summaryBlocks.complianceText}</Text>
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.summary.technical', 'Technical')}</Text>
          <KeyValueList obj={summaryBlocks.technical as any} />
        </Stack>
        <Stack gap={6}>
          <Text fw={600} size="sm">{t('getPdfInfo.summary.overview', 'PDF Overview')}</Text>
          <Text size="sm" c="dimmed">{summaryBlocks.overview}</Text>
        </Stack>
      </Stack>
    </SectionBlock>
  );
};

export default SummarySection;


