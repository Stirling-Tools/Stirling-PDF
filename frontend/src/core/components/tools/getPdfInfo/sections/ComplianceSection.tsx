import React from 'react';
import { Badge, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import SectionBlock from '@app/components/tools/getPdfInfo/shared/SectionBlock';
import KeyValueList from '@app/components/tools/getPdfInfo/shared/KeyValueList';
import type { PdfCompliance, PdfComplianceSummary } from '@app/types/getPdfInfo';
import { useTranslation } from 'react-i18next';

interface ComplianceSectionProps {
  anchorId: string;
  complianceSummary?: PdfComplianceSummary[] | null;
  legacyCompliance?: PdfCompliance | null;
}

// Helper to get the display label for a compliance key
const getComplianceLabel = (key: string): string => {
  switch (key) {
    case 'IsPDF/SECCompliant':
      return 'SEC (EDGAR)';
    case 'IsPDF/UACompliant':
      return 'PDF/UA (Accessibility)';
    case 'IsPDF/BCompliant':
      return 'PDF/A Level B';
    default:
      return key.replace('Is', '').replace('Compliant', '');
  }
};

// Helper to determine compliance status, with special logic for PDF/A Level B
const isCompliant = (key: string, legacyCompliance: PdfCompliance): boolean => {
  const isBCompliantKey = key === 'IsPDF/BCompliant';
  const conformanceLevel = legacyCompliance['PDF/AConformanceLevel'] as string | undefined;

  // The backend already sets IsPDF/ACompliant. If that's true, we can trust it.
  // We only need to add logic for the "Level B" virtual flag.
  if (isBCompliantKey && !legacyCompliance[key] && conformanceLevel) {
    // PDF/A-1B, PDF/A-2B, etc., all count as "Level B".
    return conformanceLevel.toUpperCase().endsWith('B');
  }

  return legacyCompliance[key] as boolean;
};


const ComplianceSection: React.FC<ComplianceSectionProps> = ({ anchorId, complianceSummary, legacyCompliance }) => {
  const { t } = useTranslation();

  const getContent = () => {
    // 1. Check for specific boolean flags (Classic/Detailed view)
    const specificKeys = [
      'IsPDF/ACompliant',
      'IsPDF/UACompliant',
      'IsPDF/BCompliant',
      'IsPDF/SECCompliant'
    ];

    const hasSpecificFlags = legacyCompliance && specificKeys.some(k => k in legacyCompliance);

    if (hasSpecificFlags && legacyCompliance) {
         return (
             <Stack gap="md">
                 <Stack gap="xs">
                     {specificKeys.map(key => {
                         if (!(key in legacyCompliance!)) return null;

                         const label = getComplianceLabel(key);
                         const compliant = isCompliant(key, legacyCompliance!);
                         const Icon = compliant ? CheckIcon : CloseIcon;
                         const color = compliant ? 'teal' : 'orange';

                         return (
                             <Group key={key} justify="space-between" p="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                                 <Text size="sm" fw={500}>{label}</Text>
                                 <Badge color={color} variant="light" leftSection={<Icon style={{ width: 14, height: 14, display: 'block' }} />}>
                                     {compliant ? t('getPdfInfo.compliance.passed', 'Passed') : t('getPdfInfo.compliance.failed', 'Failed')}
                                 </Badge>
                             </Group>
                         );
                     })}
                     {legacyCompliance['PDF/AConformanceLevel'] && (
                         <Group justify="space-between" p="xs">
                             <Text size="sm" fw={500}>PDF/A Level</Text>
                             <Badge color="cyan" variant="light">{legacyCompliance['PDF/AConformanceLevel'] as string}</Badge>
                         </Group>
                     )}
                 </Stack>

                 {/* Show detailed VeraPDF summary if available as a sub-section */}
                 {complianceSummary && complianceSummary.length > 0 && (
                     <Stack gap="xs">
                         <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Detailed Verification Reports</Text>
                         {complianceSummary.map((item, index) => (
                             <Group key={index} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
                                 <Stack gap={0}>
                                     <Text size="sm">{item.Standard.toUpperCase()}</Text>
                                     <Text size="xs" c="dimmed">{item.Summary}</Text>
                                 </Stack>
                                 <Badge color={item.Compliant ? 'teal' : (item.Standard === 'not-pdfa' ? 'gray' : 'orange')} variant="light">
                                     {item.Compliant ? t('getPdfInfo.compliance.compliant', 'Compliant') : t('getPdfInfo.compliance.nonCompliant', 'Non-Compliant')}
                                 </Badge>
                             </Group>
                         ))}
                     </Stack>
                 )}
             </Stack>
         )
    }

    if (complianceSummary && complianceSummary.length > 0) {
      return (
        <Stack gap="sm">
          {complianceSummary.map((item, index) => {
            const isCompliant = item.Compliant;
            // "not-pdfa" with false means it's not a PDF/A file, effectively.
            // Or if text is "Not PDF/A", handling that visually.
            const isNotPdfA = item.Standard === 'not-pdfa';

            let color = isCompliant ? 'teal' : 'orange';
            let Icon = isCompliant ? CheckIcon : CloseIcon;
            if (isNotPdfA) {
               color = 'gray';
               Icon = WarningIcon;
            }

            return (
                <Group key={index} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
                  <Group>
                    <ThemeIcon color={color} variant="light" size="md">
                      <Icon style={{ fontSize: '1.1rem' }} />
                    </ThemeIcon>
                    <Stack gap={0}>
                        <Text size="sm" fw={500}>{item.Standard.toUpperCase()}</Text>
                        <Text size="xs" c="dimmed">{item.Summary}</Text>
                    </Stack>
                  </Group>
                  <Badge color={color} variant="light">
                    {isNotPdfA
                        ? t('getPdfInfo.compliance.notDetected', 'Not Detected')
                        : (isCompliant ? t('getPdfInfo.compliance.passed', 'Passed') : t('getPdfInfo.compliance.failed', 'Failed'))
                    }
                  </Badge>
                </Group>
            );
          })}
        </Stack>
      );
    }

    return <KeyValueList obj={legacyCompliance} emptyLabel={t('getPdfInfo.compliance.none', 'No standards detected')} />;
  };

  return (
    <SectionBlock title={t('getPdfInfo.sections.compliance', 'Compliance')} anchorId={anchorId}>
      {getContent()}
    </SectionBlock>
  );
};

export default ComplianceSection;
