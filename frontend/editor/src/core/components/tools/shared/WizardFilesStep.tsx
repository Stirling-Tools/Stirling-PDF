import { Button, Group, Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { StirlingFile } from "@app/types/fileContext";
import "@app/components/tools/shared/WizardFilesStep.css";

export interface WizardFilesStepProps {
  selectedFiles: StirlingFile[];
  minFiles?: number;
}

/**
 * The Files slide of the tool step wizard: a large drag-and-drop upload CTA.
 * Adding enough files auto-advances the wizard (the slide drops out), so this
 * slide owns the upload action and has no Continue button of its own.
 */
export function WizardFilesStep({
  selectedFiles,
  minFiles = 1,
}: WizardFilesStepProps) {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const { openFilesModal } = useFilesModalContext();
  const terminology = useFileActionTerminology();

  const handleDrop = (files: File[]) => {
    if (files.length > 0) void addFiles(files);
  };

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,application/pdf";
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) void addFiles(files);
    };
    input.click();
  };

  const needsMore = minFiles > 1;
  const count = selectedFiles.length;

  return (
    <Dropzone
      onDrop={handleDrop}
      multiple
      activateOnClick={false}
      enablePointerEvents
      className="wizard-files-dropzone"
      aria-label={terminology.dropFilesHere}
    >
      <Stack align="center" gap="xs">
        <div className="wizard-files-dropzone__icon">
          <LocalIcon icon="upload" width="1.6rem" height="1.6rem" />
        </div>
        <Text fw={600} size="lg" ta="center">
          {t("fileUpload.dropTitle", "Drop your file here")}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {needsMore
            ? t("fileUpload.addAtLeast", "Add at least {{count}} files", {
                count: minFiles,
              })
            : t("fileUpload.dropSubtitle", "or pick one from your computer")}
        </Text>
        {count > 0 && (
          <Text size="xs" c="dimmed" ta="center">
            {t("filesSelected", "{{count}} files", { count })}
          </Text>
        )}
        <Group gap="sm" justify="center" mt="sm">
          <Button
            onClick={handleUpload}
            leftSection={
              <LocalIcon
                icon="upload"
                width="1rem"
                height="1rem"
                style={{ color: "white" }}
              />
            }
          >
            {terminology.uploadFromComputer}
          </Button>
          <Button
            variant="default"
            onClick={() => openFilesModal()}
            leftSection={<LocalIcon icon="add" width="1rem" height="1rem" />}
          >
            {terminology.addFiles}
          </Button>
        </Group>
      </Stack>
    </Dropzone>
  );
}

export default WizardFilesStep;
