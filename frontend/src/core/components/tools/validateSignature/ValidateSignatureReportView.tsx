import React, { useMemo } from 'react';
import { Badge, Group, Stack, Text, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SignatureValidationReportData } from '@app/types/validateSignature';
import '@app/components/tools/validateSignature/reportView/styles.css';
import ThumbnailPreview from '@app/components/tools/validateSignature/reportView/ThumbnailPreview';
import FileSummaryHeader from '@app/components/tools/validateSignature/reportView/FileSummaryHeader';
import SignatureSection from '@app/components/tools/validateSignature/reportView/SignatureSection';

interface ValidateSignatureReportViewProps {
  data: SignatureValidationReportData;
}

const NoSignatureSection = ({ message, label }: { message: string; label: string }) => (
  <Stack align="center" justify="center" gap="xs" style={{ minHeight: 360, width: '100%' }}>
    <Badge color="gray" variant="light" size="lg" style={{ textTransform: 'uppercase' }}>
      {label}
    </Badge>
    <Text size="sm" c="dimmed" style={{ textAlign: 'center' }}>
      {message}
    </Text>
  </Stack>
);

const ValidateSignatureReportView: React.FC<ValidateSignatureReportViewProps> = ({ data }) => {
  const { t } = useTranslation();
  const noSignaturesLabel = t('validateSignature.noSignaturesShort', 'No signatures');

  const pages = useMemo(() => {
    const result: Array<{
      entry: SignatureValidationReportData['entries'][number];
      signatureIndex: number | null;
      includeSummary: boolean;
    }> = [];

    for (const entry of data.entries) {
      if (entry.signatures.length === 0 || entry.error) {
        result.push({ entry, signatureIndex: null, includeSummary: true });
        continue;
      }

      // First page includes summary and the first signature
      result.push({ entry, signatureIndex: 0, includeSummary: true });

      // Subsequent signatures each get their own page
      for (let i = 1; i < entry.signatures.length; i += 1) {
        result.push({ entry, signatureIndex: i, includeSummary: false });
      }
    }

    return result;
  }, [data.entries]);

  return (
    <div className="report-container">
      <Stack gap="xl" align="center">
        <Stack gap="xs" align="center">
          <Badge size="lg" color="blue" variant="light">
            {t('validateSignature.report.title', 'Signature Validation Report')}
          </Badge>
          <Text size="sm" c="dimmed">
            {t('validateSignature.report.generatedAt', 'Generated')}{' '}
            {new Date(data.generatedAt).toLocaleString()}
          </Text>
        </Stack>

        {pages.map((pageDef, index) => (
          <div className="simulated-page" key={`${pageDef.entry.fileId}-${index}`}>
            <Stack gap="lg" style={{ flex: 1 }}>
              {pageDef.includeSummary && (
                <>
                  <Group align="flex-start" gap="lg">
                    <ThumbnailPreview
                      thumbnailUrl={pageDef.entry.thumbnailUrl}
                      fileName={pageDef.entry.fileName}
                    />
                    <Stack gap="sm" style={{ flex: 1 }}>
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={700} size="xl" style={{ lineHeight: 1.1 }}>
                            {pageDef.entry.fileName}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {t('validateSignature.report.entryLabel', 'Signature Summary')}
                          </Text>
                        </div>
                        <Badge color="gray" variant="light">
                          {t('validateSignature.report.page', 'Page')} {index + 1}
                        </Badge>
                      </Group>

                      <FileSummaryHeader
                        fileSize={pageDef.entry.fileSize}
                        createdAt={pageDef.entry.createdAtLabel ?? null}
                        totalSignatures={pageDef.entry.signatures.length}
                        lastSignatureDate={pageDef.entry.signatures[0]?.signatureDate}
                      />
                    </Stack>
                  </Group>

                  <Divider />
                </>
              )}

              {pageDef.entry.error ? (
                <NoSignatureSection
                  message={pageDef.entry.error}
                  label={t('validateSignature.status.invalid', 'Invalid')}
                />
              ) : pageDef.entry.signatures.length === 0 ? (
                <NoSignatureSection
                  message={t(
                    'validateSignature.noSignatures',
                    'No digital signatures found in this document'
                  )}
                  label={noSignaturesLabel}
                />
              ) : (
                <Stack gap="xl">
                  {pageDef.signatureIndex === null ? null : (
                    <SignatureSection
                      signature={pageDef.entry.signatures[pageDef.signatureIndex]}
                      index={pageDef.signatureIndex}
                    />
                  )}
                </Stack>
              )}
            </Stack>

            <Group justify="space-between" align="center" mt="auto" pt="md">
              <Text size="xs" c="dimmed">
                {t('validateSignature.report.footer', 'Validated via Stirling PDF')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('validateSignature.report.page', 'Page')} {index + 1} / {pages.length}
              </Text>
            </Group>
          </div>
        ))}
      </Stack>
    </div>
  );
};

export default ValidateSignatureReportView;
