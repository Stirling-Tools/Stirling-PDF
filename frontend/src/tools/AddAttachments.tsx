import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "../contexts/FileContext";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useAddAttachmentsParameters } from "../hooks/tools/addAttachments/useAddAttachmentsParameters";
import { useAddAttachmentsOperation } from "../hooks/tools/addAttachments/useAddAttachmentsOperation";
import { Stack, FileInput, Text, Group, ActionIcon, Alert, ScrollArea, Button } from "@mantine/core";
import LocalIcon from "../components/shared/LocalIcon";
import { useAccordionSteps } from "../hooks/tools/shared/useAccordionSteps";
// Removed FitText for two-line wrapping with clamping

const AddAttachments = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const params = useAddAttachmentsParameters();
  const operation = useAddAttachmentsOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-attachments");

  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);

  const handleExecute = async () => {
    try {
      await operation.executeOperation(params.parameters, selectedFiles);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error: any) {
      onError?.(error?.message || t("AddAttachmentsRequest.error.failed", "Add attachments operation failed"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  enum AddAttachmentsStep {
    NONE = 'none',
    ATTACHMENTS = 'attachments'
  }

  const accordion = useAccordionSteps<AddAttachmentsStep>({
    noneValue: AddAttachmentsStep.NONE,
    initialStep: AddAttachmentsStep.ATTACHMENTS,
    stateConditions: {
      hasFiles,
      hasResults: false // Don't collapse when there are results for add attachments
    },
    afterResults: () => {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  });

  const getSteps = () => {
    const steps: any[] = [];

    // Step 1: Attachments Selection
    steps.push({
      title: t("AddAttachmentsRequest.attachments", "Select Attachments"),
      isCollapsed: accordion.getCollapsedState(AddAttachmentsStep.ATTACHMENTS),
      onCollapsedClick: () => accordion.handleStepToggle(AddAttachmentsStep.ATTACHMENTS),
      isVisible: true,
      content: (
        <Stack gap="md">
          <Alert color="blue" variant="light">
            <Text size="sm">
              {t("AddAttachmentsRequest.info", "Select files to attach to your PDF. These files will be embedded and accessible through the PDF's attachment panel.")}
            </Text>
          </Alert>

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("AddAttachmentsRequest.selectFiles", "Select Files to Attach")}
            </Text>
            <input
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                // Append to existing attachments instead of replacing
                const newAttachments = [...params.parameters.attachments, ...files];
                params.updateParameter('attachments', newAttachments);
                // Reset the input so the same file can be selected again
                e.target.value = '';
              }}
              disabled={endpointLoading}
              style={{ display: 'none' }}
              id="attachments-input"
            />
            <Button
              size="xs"
              color="blue"
              component="label"
              htmlFor="attachments-input"
              disabled={endpointLoading}
              leftSection={<LocalIcon icon="plus" width="14" height="14" />}
            >
              {params.parameters.attachments.length > 0 
                ? t("AddAttachmentsRequest.addMoreFiles", "Add more files...")
                : t("AddAttachmentsRequest.placeholder", "Choose files...")
              }
            </Button>
          </Stack>

          {params.parameters.attachments && params.parameters.attachments.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t("AddAttachmentsRequest.selectedFiles", "Selected Files")} ({params.parameters.attachments.length})
              </Text>
              <ScrollArea.Autosize mah={300} type="scroll" offsetScrollbars styles={{ viewport: { overflowX: 'hidden' } }}>
                <Stack gap="xs">
                  {params.parameters.attachments.map((file, index) => (
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
                          const newAttachments = params.parameters.attachments.filter((_, i) => i !== index);
                          params.updateParameter('attachments', newAttachments);
                        }}
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
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
    executeButton: {
      text: t('AddAttachmentsRequest.submit', 'Add Attachments'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('AddAttachmentsRequest.results.title', 'Attachment Results'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
  });
};

AddAttachments.tool = () => useAddAttachmentsOperation;

export default AddAttachments as ToolComponent;
