import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Textarea, TextInput, Select, Button, Text, Divider, Accordion, Code, Group, Badge, Box, Paper } from "@mantine/core";
import { AddStampParameters } from "@app/components/tools/addStamp/useAddStampParameters";
import ButtonSelector from "@app/components/shared/ButtonSelector";
import styles from "@app/components/tools/addStamp/StampPreview.module.css";
import { getDefaultFontSizeForAlphabet } from "@app/components/tools/addStamp/StampPreviewUtils";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

const STAMP_TEMPLATES = [
  {
    id: 'page-numbers',
    name: 'Page Numbers',
    text: 'Page @page_number of @total_pages',
    position: 2, // bottom center
  },
  {
    id: 'draft',
    name: 'Draft Watermark',
    text: 'DRAFT - @date',
    position: 5, // center
  },
  {
    id: 'doc-info',
    name: 'Document Info',
    text: '@filename\nCreated: @date{dd MMM yyyy}',
    position: 7, // top left
  },
  {
    id: 'legal-footer',
    name: 'Legal Footer',
    text: '© @year - All Rights Reserved\n@filename - Page @page_number',
    position: 2, // bottom center
  },
  {
    id: 'european-date',
    name: 'European Date (DD/MM/YYYY)',
    text: '@date{dd/MM/yyyy}',
    position: 9, // top right
  },
  {
    id: 'timestamp',
    name: 'Timestamp',
    text: '@date{dd/MM/yyyy HH:mm}',
    position: 9, // top right
  },
];

const resolveVariablesForPreview = (text: string, filename?: string): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const ESCAPED_AT_PLACEHOLDER = '\uE000ESCAPED_AT\uE000';
  let result = text.replace(/@@/g, ESCAPED_AT_PLACEHOLDER);

  const actualFilename = filename || 'sample-document.pdf';
  const filenameWithoutExt = actualFilename.includes('.')
    ? actualFilename.substring(0, actualFilename.lastIndexOf('.'))
    : actualFilename;

  const sampleData: Record<string, string> = {
    '@datetime': `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    '@date': `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    '@time': `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    '@year': String(now.getFullYear()),
    '@month': pad(now.getMonth() + 1),
    '@day': pad(now.getDate()),
    // Page info - cannot be previewed, show placeholder
    '@page_number': '?',
    '@page': '?',
    '@total_pages': '?',
    '@page_count': '?',
    // Filename - use actual file if provided
    '@filename': filenameWithoutExt,
    '@filename_full': actualFilename,
    // Metadata - cannot be read from PDF in frontend, show placeholder
    '@author': '?',
    '@title': '?',
    '@subject': '?',
    // UUID - will be random each time
    '@uuid': '????????',
  };

  result = result.replace(/@date\{([^}]+)\}/g, (match, format) => {
    try {
      return format
        .replace(/yyyy/g, String(now.getFullYear()))
        .replace(/yy/g, String(now.getFullYear()).slice(-2))
        .replace(/MMMM/g, now.toLocaleString('default', { month: 'long' }))
        .replace(/MMM/g, now.toLocaleString('default', { month: 'short' }))
        .replace(/MM/g, pad(now.getMonth() + 1))
        .replace(/dd/g, pad(now.getDate()))
        .replace(/HH/g, pad(now.getHours()))
        .replace(/hh/g, pad(now.getHours() % 12 || 12))
        .replace(/mm/g, pad(now.getMinutes()))
        .replace(/ss/g, pad(now.getSeconds()));
    } catch {
      return match;
    }
  });

  Object.entries(sampleData).forEach(([key, value]) => {
    result = result.split(key).join(value);
  });

  result = result.replace(new RegExp(ESCAPED_AT_PLACEHOLDER, 'g'), '@');

  result = result.replace(/\\n/g, '\n');

  return result;
};

interface ClickableCodeProps {
  children: React.ReactNode;
  onClick: () => void;
  block?: boolean;
}

const ClickableCode = ({ children, onClick, block = false }: ClickableCodeProps) => (
  <Code
    tabIndex={0}
    role="button"
    style={{
      cursor: 'pointer',
      display: block ? 'block' : undefined,
    }}
    onClick={onClick}
    onKeyDown={(e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
  >
    {children}
  </Code>
);

const StampTextPreview = ({ stampText, filename }: { stampText: string; filename?: string }) => {
  const { t } = useTranslation();

  const resolvedText = useMemo(() => {
    if (!stampText.trim()) return '';
    return resolveVariablesForPreview(stampText, filename);
  }, [stampText, filename]);

  if (!stampText.trim()) return null;

  return (
    <Paper p="xs" withBorder bg="var(--mantine-color-default)">
      <Text size="xs" c="dimmed" mb={4}>{t('AddStampRequest.preview', 'Preview:')}</Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', wordBreak: 'break-word' }}>
        {resolvedText}
      </Text>
    </Paper>
  );
};

interface StampSetupSettingsProps {
  parameters: AddStampParameters;
  onParameterChange: <K extends keyof AddStampParameters>(key: K, value: AddStampParameters[K]) => void;
  disabled?: boolean;
  filename?: string;
}

const StampSetupSettings = ({ parameters, onParameterChange, disabled = false, filename }: StampSetupSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <TextInput
        label={t('pageSelectionPrompt', 'Page Selection (e.g. 1,3,2 or 4-8,2,10-12 or 2n-1)')}
        value={parameters.pageNumbers}
        onChange={(e) => onParameterChange('pageNumbers', e.currentTarget.value)}
        disabled={disabled}
      />
      <Divider/>
      <div>
        <Text size="sm" fw={500} mb="xs">{t('AddStampRequest.stampType', 'Stamp Type')}</Text>
        <ButtonSelector
          value={parameters.stampType}
          onChange={(v: 'text' | 'image') => onParameterChange('stampType', v)}
          options={[
            { value: 'text', label: t('watermark.type.1', 'Text') },
            { value: 'image', label: t('watermark.type.2', 'Image') },
          ]}
          disabled={disabled}
          buttonClassName={styles.modeToggleButton}
          textClassName={styles.modeToggleButtonText}
        />
      </div>

      {parameters.stampType === 'text' && (
        <>
          {/* Template Selector - always shows placeholder, doesn't persist selection */}
          <Select
            label={t('AddStampRequest.useTemplate', 'Use Template')}
            placeholder={t('AddStampRequest.selectTemplate', 'Select a template...')}
            value={null}
            data={STAMP_TEMPLATES.map(template => ({
              value: template.id,
              label: t(`AddStampRequest.template.${template.id}`, template.name)
            }))}
            onChange={(value) => {
              const template = STAMP_TEMPLATES.find(t => t.id === value);
              if (template) {
                onParameterChange('stampText', template.text);
                onParameterChange('position', template.position as any);
              }
            }}
            clearable
            disabled={disabled}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
          />

          <Textarea
            label={t('AddStampRequest.stampText', 'Stamp Text')}
            description={t('AddStampRequest.stampTextDescription', 'Use dynamic variables below. Use @@ for literal @. Use \\n for new lines.')}
            value={parameters.stampText}
            onChange={(e) => onParameterChange('stampText', e.currentTarget.value)}
            autosize
            minRows={2}
            disabled={disabled}
          />

          {/* Live Preview */}
          <StampTextPreview stampText={parameters.stampText} filename={filename} />

          <Accordion variant="contained" radius="sm">
            <Accordion.Item value="variables">
              <Accordion.Control>
                <Group gap="xs">
                  <Text size="sm" fw={500}>{t('AddStampRequest.dynamicVariables', 'Dynamic Variables')}</Text>
                  <Badge size="xs" variant="light" color="blue">{t('AddStampRequest.clickToExpand', 'Click to expand')}</Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" mb="xs">
                    {t('AddStampRequest.variablesHelp', 'Click on any variable to insert it into your stamp text. Use @@ for literal @.')}
                  </Text>
                  <Box>
                    <Text size="xs" fw={600} mb={4}>{t('AddStampRequest.dateTimeVars', 'Date & Time')}</Text>
                    <Group gap="xs">
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@date')}>
                        @date
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.dateDesc', 'Current date')} (YYYY-MM-DD)</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@time')}>
                        @time
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.timeDesc', 'Current time')} (HH:mm:ss)</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@datetime')}>
                        @datetime
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.datetimeDesc', 'Date and time combined')}</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@date{dd/MM/yyyy}')}>
                        @date&#123;format&#125;
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.customDateDesc', 'Custom format')}</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@year')}>
                        @year
                      </ClickableCode>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@month')}>
                        @month
                      </ClickableCode>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@day')}>
                        @day
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.yearMonthDayDesc', 'Individual date parts')}</Text>
                    </Group>
                  </Box>
                  <Divider my="xs" />
                  <Box>
                    <Text size="xs" fw={600} mb={4}>{t('AddStampRequest.pageVars', 'Page Information')}</Text>
                    <Group gap="xs">
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@page_number')}>
                        @page_number
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.pageNumberDesc', 'Current page number')}</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@total_pages')}>
                        @total_pages
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.totalPagesDesc', 'Total number of pages')}</Text>
                    </Group>
                  </Box>
                  <Divider my="xs" />
                  <Box>
                    <Text size="xs" fw={600} mb={4}>{t('AddStampRequest.fileVars', 'File Information')}</Text>
                    <Group gap="xs">
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@filename')}>
                        @filename
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.filenameDesc', 'Filename without extension')}</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@filename_full')}>
                        @filename_full
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.filenameFullDesc', 'Filename with extension')}</Text>
                    </Group>
                  </Box>
                  <Divider my="xs" />
                  <Box>
                    <Text size="xs" fw={600} mb={4}>{t('AddStampRequest.metadataVars', 'Document Metadata')}</Text>
                    <Group gap="xs">
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@author')}>
                        @author
                      </ClickableCode>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@title')}>
                        @title
                      </ClickableCode>
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@subject')}>
                        @subject
                      </ClickableCode>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>— {t('AddStampRequest.metadataDesc', 'From PDF document properties')}</Text>
                  </Box>
                  <Divider my="xs" />
                  <Box>
                    <Text size="xs" fw={600} mb={4}>{t('AddStampRequest.otherVars', 'Other')}</Text>
                    <Group gap="xs">
                      <ClickableCode onClick={() => onParameterChange('stampText', parameters.stampText + '@uuid')}>
                        @uuid
                      </ClickableCode>
                      <Text size="xs" c="dimmed">— {t('AddStampRequest.uuidDesc', 'Short unique identifier (8 chars)')}</Text>
                    </Group>
                  </Box>
                  <Divider my="xs" />
                  <Box>
                    <Text size="xs" fw={600} mb={4}>{t('AddStampRequest.examples', 'Examples')}</Text>
                    <Stack gap={4}>
                      <ClickableCode block onClick={() => onParameterChange('stampText', 'Page @page_number of @total_pages')}>
                        Page @page_number of @total_pages
                      </ClickableCode>
                      <ClickableCode block onClick={() => onParameterChange('stampText', 'Created: @date{dd/MM/yyyy HH:mm}')}>
                        Created: @date&#123;dd/MM/yyyy HH:mm&#125;
                      </ClickableCode>
                      <ClickableCode block onClick={() => onParameterChange('stampText', '© @year @author')}>
                        © @year @author
                      </ClickableCode>
                      <ClickableCode block onClick={() => onParameterChange('stampText', '@filename\\n@date')}>
                        @filename\n@date ({t('AddStampRequest.multiLine', 'multi-line')})
                      </ClickableCode>
                    </Stack>
                  </Box>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <Select
            label={t('AddStampRequest.alphabet', 'Alphabet')}
            value={parameters.alphabet}
            onChange={(v) => {
              const nextAlphabet = (v as any) || 'roman';
              onParameterChange('alphabet', nextAlphabet);
              const nextDefault = getDefaultFontSizeForAlphabet(nextAlphabet);
              onParameterChange('fontSize', nextDefault);
            }}
            data={[
              { value: 'roman', label: 'Roman' },
              { value: 'arabic', label: 'العربية' },
              { value: 'japanese', label: '日本語' },
              { value: 'korean', label: '한국어' },
              { value: 'chinese', label: '简体中文' },
              { value: 'thai', label: 'ไทย' },
            ]}
            disabled={disabled}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
          />
        </>
      )}

      {parameters.stampType === 'image' && (
        <Stack gap="xs">
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onParameterChange('stampImage', file);
            }}
            disabled={disabled}
            style={{ display: 'none' }}
            id="stamp-image-input"
          />
          <Button
            size="xs"
            component="label"
            htmlFor="stamp-image-input"
            disabled={disabled}
          >
            {t('chooseFile', 'Choose File')}
          </Button>
          {parameters.stampImage && (
            <Stack gap="xs">
              <img
                src={URL.createObjectURL(parameters.stampImage)}
                alt="Selected stamp image"
                className="max-h-24 w-full object-contain border border-gray-200 rounded bg-gray-50"
              />
              <Text size="xs" c="dimmed">
                {parameters.stampImage.name}
              </Text>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default StampSetupSettings;
