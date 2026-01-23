import React, { useMemo } from 'react';
import { Badge, Group, Stack, Text, ThemeIcon, Paper, Tooltip, Divider } from '@mantine/core';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import SectionBlock from '@app/components/tools/getPdfInfo/shared/SectionBlock';
import type { PdfCompliance, PdfComplianceSummary } from '@app/types/getPdfInfo';
import { useTranslation } from 'react-i18next';

interface ComplianceSectionProps {
  anchorId: string;
  complianceSummary?: PdfComplianceSummary[] | null;
  legacyCompliance?: PdfCompliance | null;
}

interface ComplianceCheckResult {
  /** Display name for the standard (e.g., "PDF/A-3B", "PDF/UA-1", "SEC (EDGAR)") */
  displayName: string;
  /** Category for grouping (e.g., "PDF/A", "PDF/UA", "SEC") */
  category: string;
  /** Whether the PDF is compliant with this standard */
  isCompliant: boolean;
  /** Human-readable summary from the verification */
  summary: string;
  /** Original standard identifier from backend */
  standardId: string;
  /** Sort order for display */
  sortOrder: number;
}

const parseStandardDisplayName = (standardId: string): { displayName: string; category: string; sortOrder: number } => {
  const id = standardId.toLowerCase().trim();

  // PDF/A variants: pdfa-1a, pdfa-1b, pdfa-2a, pdfa-2b, pdfa-2u, pdfa-3a, pdfa-3b, pdfa-3u, pdfa-4, etc.
  const pdfaMatch = id.match(/^pdf[_-]?a[_-]?(\d+)([abuf])?$/i);
  if (pdfaMatch) {
    const version = pdfaMatch[1];
    const level = pdfaMatch[2]?.toUpperCase() || '';
    return {
      displayName: `PDF/A-${version}${level}`,
      category: 'PDF/A',
      sortOrder: 10 + parseInt(version) * 10 + (level === 'A' ? 1 : level === 'B' ? 2 : level === 'U' ? 3 : 0),
    };
  }

  // PDF/UA variants: pdfua-1, pdfua-2, etc.
  const pdfuaMatch = id.match(/^pdf[_-]?ua[_-]?(\d+)?$/i);
  if (pdfuaMatch) {
    const version = pdfuaMatch[1] || '1';
    return {
      displayName: `PDF/UA-${version}`,
      category: 'PDF/UA',
      sortOrder: 200 + parseInt(version),
    };
  }

  // PDF/X variants
  const pdfxMatch = id.match(/^pdf[_-]?x[_-]?(.+)?$/i);
  if (pdfxMatch) {
    const version = pdfxMatch[1]?.toUpperCase() || '';
    return {
      displayName: `PDF/X${version ? `-${version}` : ''}`,
      category: 'PDF/X',
      sortOrder: 300,
    };
  }

  // PDF/E variants
  const pdfeMatch = id.match(/^pdf[_-]?e[_-]?(.+)?$/i);
  if (pdfeMatch) {
    const version = pdfeMatch[1]?.toUpperCase() || '';
    return {
      displayName: `PDF/E${version ? `-${version}` : ''}`,
      category: 'PDF/E',
      sortOrder: 400,
    };
  }

  // PDF/VT
  if (id.includes('pdfvt') || id.includes('pdf-vt') || id.includes('pdf_vt')) {
    return { displayName: 'PDF/VT', category: 'PDF/VT', sortOrder: 500 };
  }

  // SEC (EDGAR) compliance
  if (id.includes('sec') || id.includes('edgar')) {
    return { displayName: 'SEC (EDGAR)', category: 'SEC', sortOrder: 600 };
  }

  // Not PDF/A indicator
  if (id === 'not-pdfa' || id === 'not_pdfa') {
    return { displayName: 'PDF/A Detection', category: 'Detection', sortOrder: 1 };
  }

  // Fallback: capitalize and format
  return {
    displayName: standardId.toUpperCase().replace(/[-_]/g, '/'),
    category: 'Other',
    sortOrder: 999,
  };
};

const buildComplianceResults = (
  complianceSummary?: PdfComplianceSummary[] | null,
  legacyCompliance?: PdfCompliance | null
): ComplianceCheckResult[] => {
  const results: ComplianceCheckResult[] = [];
  const processedCategories = new Set<string>();

  if (complianceSummary && complianceSummary.length > 0) {
    for (const item of complianceSummary) {
      // Skip the "not-pdfa" detection marker - it's informational, not a compliance check
      if (item.Standard.toLowerCase() === 'not-pdfa') {
        continue;
      }

      const { displayName, category, sortOrder } = parseStandardDisplayName(item.Standard);
      processedCategories.add(category);

      results.push({
        displayName,
        category,
        isCompliant: item.Compliant,
        summary: item.Summary,
        standardId: item.Standard,
        sortOrder,
      });
    }
  }

  // Then, add SEC compliance from legacy data if not already present
  // SEC compliance is checked separately by PDFBox, not VeraPDF
  if (legacyCompliance && 'IsPDF/SECCompliant' in legacyCompliance && !processedCategories.has('SEC')) {
    const isSecCompliant = legacyCompliance['IsPDF/SECCompliant'] as boolean;
    results.push({
      displayName: 'SEC (EDGAR)',
      category: 'SEC',
      isCompliant: isSecCompliant,
      summary: isSecCompliant
        ? 'Document meets SEC EDGAR filing requirements'
        : 'Document does not meet SEC EDGAR filing requirements',
      standardId: 'sec-edgar',
      sortOrder: 600,
    });
  }

  // Sort by sortOrder for consistent display
  results.sort((a, b) => a.sortOrder - b.sortOrder);

  return results;
};

const getConformanceLevel = (results: ComplianceCheckResult[]): string | null => {
  const passingPdfA = results
    .filter(r => r.category === 'PDF/A' && r.isCompliant)
    .sort((a, b) => b.sortOrder - a.sortOrder);

  if (passingPdfA.length > 0) {
    return passingPdfA[0].displayName;
  }

  return null;
};

const ComplianceRow: React.FC<{
  result: ComplianceCheckResult;
}> = ({ result }) => {
  const { t } = useTranslation();
  const Icon = result.isCompliant ? CheckIcon : CloseIcon;
  const color = result.isCompliant ? 'teal' : 'red';
  const statusText = result.isCompliant
    ? t('getPdfInfo.compliance.passed', 'Passed')
    : t('getPdfInfo.compliance.failed', 'Failed');

  return (
    <Paper
      p="sm"
      radius="sm"
      withBorder
      style={{
        borderColor: `var(--mantine-color-${color}-6)`,
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon color={color} variant="light" size="lg" radius="xl">
            <Icon style={{ fontSize: '1.2rem' }} />
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {result.displayName}
            </Text>
            <Tooltip label={result.summary} multiline maw={400} withArrow>
              <Text size="xs" c="dimmed" lineClamp={1} style={{ cursor: 'help' }}>
                {result.summary}
              </Text>
            </Tooltip>
          </Stack>
        </Group>
        <Badge
          color={color}
          variant="light"
          size="md"
          leftSection={<Icon style={{ width: 12, height: 12 }} />}
        >
          {statusText}
        </Badge>
      </Group>
    </Paper>
  );
};

const EmptyComplianceState: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Paper p="md" radius="sm" withBorder>
      <Group gap="sm">
        <ThemeIcon color="gray" variant="light" size="lg" radius="xl">
          <InfoIcon style={{ fontSize: '1.2rem' }} />
        </ThemeIcon>
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            {t('getPdfInfo.compliance.noVerification', 'No Verification Performed')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('getPdfInfo.compliance.noVerificationDesc', 'PDF standards compliance was not verified for this document.')}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
};

const ComplianceSection: React.FC<ComplianceSectionProps> = ({
  anchorId,
  complianceSummary,
  legacyCompliance,
}) => {
  const { t } = useTranslation();

  const complianceResults = useMemo(
    () => buildComplianceResults(complianceSummary, legacyCompliance),
    [complianceSummary, legacyCompliance]
  );

  const conformanceLevel = useMemo(
    () => getConformanceLevel(complianceResults),
    [complianceResults]
  );

  const passedCount = complianceResults.filter(r => r.isCompliant).length;
  const failedCount = complianceResults.filter(r => !r.isCompliant).length;

  const hasResults = complianceResults.length > 0;

  return (
    <SectionBlock title={t('getPdfInfo.sections.compliance', 'Compliance')} anchorId={anchorId}>
      <Stack gap="md">
        {/* Summary header when there are results */}
        {hasResults && (
          <>
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Group gap="xs">
                {conformanceLevel && (
                  <Badge color="cyan" variant="light" size="lg">
                    {conformanceLevel}
                  </Badge>
                )}
                {passedCount > 0 && (
                  <Badge color="teal" variant="outline" size="sm">
                    {passedCount} {t('getPdfInfo.compliance.passedCount', 'passed')}
                  </Badge>
                )}
                {failedCount > 0 && (
                  <Badge color="red" variant="outline" size="sm">
                    {failedCount} {t('getPdfInfo.compliance.failedCount', 'failed')}
                  </Badge>
                )}
              </Group>
            </Group>
            <Divider />
          </>
        )}

        {/* Compliance results list */}
        {hasResults ? (
          <Stack gap="xs">
            {complianceResults.map((result, index) => (
              <ComplianceRow key={`${result.standardId}-${index}`} result={result} />
            ))}
          </Stack>
        ) : (
          <EmptyComplianceState />
        )}
      </Stack>
    </SectionBlock>
  );
};

export default ComplianceSection;
