/**
 * FormSaveBar — A notification banner for form-filled PDFs.
 *
 * Appears at the top-right of the PDF viewer when the current PDF has
 * fillable form fields. Provides options to apply changes or download
 * the filled PDF.
 *
 * This component is used in normal viewer mode (pdf-lib provider) where
 * the dedicated FormFill tool panel is NOT active. It provides a clean
 * save UX that users expect from browser PDF viewers.
 */
import React, { useCallback, useState } from 'react';
import { Stack, Group, Text, Button, Transition, CloseButton, Paper, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { useFormFill } from '@proprietary/tools/formFill/FormFillContext';

interface FormSaveBarProps {
  /** The current file being viewed */
  file: File | Blob | null;
  /** Whether the formFill tool is active (bar is hidden when tool panel is showing) */
  isFormFillToolActive: boolean;
  /** Callback when form changes are applied (should reload PDF with filled values) */
  onApply?: (filledBlob: Blob) => Promise<void>;
}

export function FormSaveBar({ file, isFormFillToolActive, onApply }: FormSaveBarProps) {
  const { t } = useTranslation();
  const { state, submitForm } = useFormFill();
  const { fields, isDirty, loading } = state;
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when file changes
  const [prevFile, setPrevFile] = useState<File | Blob | null>(null);
  if (file !== prevFile) {
    setPrevFile(file);
    setDismissed(false);
  }

  const handleApply = useCallback(async () => {
    if (!file || applying || saving) return;
    setApplying(true);
    try {
      // Generate the filled PDF
      const filledBlob = await submitForm(file, false);
      
      // Call the onApply callback to reload the PDF in the viewer
      if (onApply) {
        await onApply(filledBlob);
      }
    } catch (err) {
      console.error('[FormSaveBar] Apply failed:', err);
    } finally {
      setApplying(false);
    }
  }, [file, applying, saving, submitForm, onApply]);

  const handleDownload = useCallback(async () => {
    if (!file || saving || applying) return;
    setSaving(true);
    try {
      const blob = await submitForm(file, false);
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file instanceof File ? file.name : 'filled-form.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[FormSaveBar] Download failed:', err);
    } finally {
      setSaving(false);
    }
  }, [file, saving, applying, submitForm]);

  // Don't show when:
  // - formFill tool is active (it has its own save panel)
  // - no form fields found
  // - still loading
  // - user dismissed the bar
  const hasFields = fields.length > 0;
  const visible = !isFormFillToolActive && hasFields && !loading && !dismissed;

  return (
    <Transition mounted={visible} transition="slide-down" duration={300}>
      {(styles) => (
        <div
          style={{
            ...styles,
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          <Paper
            shadow="lg"
            radius="md"
            withBorder
            style={{
              pointerEvents: 'auto',
              minWidth: '320px',
              maxWidth: '420px',
              overflow: 'hidden',
            }}
          >
            <Stack gap="xs" p="md">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                  <EditNoteIcon 
                    sx={{ 
                      fontSize: 24, 
                      color: isDirty ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-6)' 
                    }} 
                  />
                  <div>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        {t('viewer.formBar.title', 'Form Fields')}
                      </Text>
                      {isDirty && (
                        <Badge size="xs" color="blue" variant="light">
                          {t('viewer.formBar.unsavedBadge', 'Unsaved')}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {isDirty
                        ? t('viewer.formBar.unsavedDesc', 'You have unsaved changes')
                        : t('viewer.formBar.hasFieldsDesc', 'This PDF contains fillable fields')}
                    </Text>
                  </div>
                </Group>
                <CloseButton
                  size="sm"
                  variant="subtle"
                  onClick={() => setDismissed(true)}
                  aria-label={t('viewer.formBar.dismiss', 'Dismiss')}
                />
              </Group>

              {isDirty && (
                <Group gap="xs" mt="xs">
                  <Button
                    size="sm"
                    variant="light"
                    color="blue"
                    leftSection={<SaveIcon sx={{ fontSize: 18 }} />}
                    loading={applying}
                    disabled={saving}
                    onClick={handleApply}
                    flex={1}
                  >
                    {t('viewer.formBar.apply', 'Apply Changes')}
                  </Button>
                  <Button
                    size="sm"
                    variant="filled"
                    color="blue"
                    leftSection={<DownloadIcon sx={{ fontSize: 18 }} />}
                    loading={saving}
                    disabled={applying}
                    onClick={handleDownload}
                    flex={1}
                  >
                    {t('viewer.formBar.download', 'Download PDF')}
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
        </div>
      )}
    </Transition>
  );
}

export default FormSaveBar;
