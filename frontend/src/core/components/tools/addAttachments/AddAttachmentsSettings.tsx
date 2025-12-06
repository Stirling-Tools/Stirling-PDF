/**
 * AddAttachmentsSettings - Shared settings component for both tool UI and automation
 *
 * Allows selecting files to attach to PDFs.
 */

import { Stack, Text, Group, ActionIcon, ScrollArea, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddAttachmentsParameters } from "@app/hooks/tools/addAttachments/useAddAttachmentsParameters";
import LocalIcon from "@app/components/shared/LocalIcon";

interface AddAttachmentsSettingsProps {
  parameters: AddAttachmentsParameters;
  onParameterChange: <K extends keyof AddAttachmentsParameters>(key: K, value: AddAttachmentsParameters[K]) => void;
  disabled?: boolean;
}

const AddAttachmentsSettings = ({ parameters, onParameterChange, disabled = false }: AddAttachmentsSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <input
          type="file"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            // Append to existing attachments instead of replacing
            const newAttachments = [...(parameters.attachments || []), ...files];
            onParameterChange('attachments', newAttachments);
            // Reset the input so the same file can be selected again
            e.target.value = '';
          }}
          disabled={disabled}
          style={{ display: 'none' }}
          id="attachments-input"
        />
        <Button
          size="xs"
          color="blue"
          component="label"
          htmlFor="attachments-input"
          disabled={disabled}
          leftSection={<LocalIcon icon="add" width="14" height="14" />}
        >
          {parameters.attachments?.length > 0
            ? t("AddAttachmentsRequest.addMoreFiles", "Add more files...")
            : t("AddAttachmentsRequest.placeholder", "Choose files...")
          }
        </Button>
      </Stack>

      {parameters.attachments?.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            {t("AddAttachmentsRequest.selectedFiles", "Selected Files")} ({parameters.attachments.length})
          </Text>
          <ScrollArea.Autosize mah={300} type="scroll" offsetScrollbars styles={{ viewport: { overflowX: 'hidden' } }}>
            <Stack gap="xs">
              {parameters.attachments.map((file, index) => (
                <Group key={index} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', alignItems: 'flex-start' }}>
                  <Group gap="xs" style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
                    {/* Filename (two-line clamp, wraps, no icon on the left) */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 'var(--mantine-font-size-sm)',
                          fontWeight: 400,
                          lineHeight: 1.2,
                          display: '-webkit-box',
                          WebkitLineClamp: 2 as any,
                          WebkitBoxOrient: 'vertical' as any,
                          overflow: 'hidden',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                        title={file.name}
                      >
                        {file.name}
                      </div>
                    </div>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      ({(file.size / 1024).toFixed(1)} KB)
                    </Text>
                  </Group>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      const newAttachments = (parameters.attachments || []).filter((_, i) => i !== index);
                      onParameterChange('attachments', newAttachments);
                    }}
                    disabled={disabled}
                  >
                    <LocalIcon icon="close-rounded" width="14" height="14" />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      )}
    </Stack>
  );
};

export default AddAttachmentsSettings;
