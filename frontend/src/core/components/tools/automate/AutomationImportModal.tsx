import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Z_INDEX_AUTOMATE_MODAL } from "@app/styles/zIndex";
import {
  ParsedAutomationImport,
  parseAutomationFile,
} from "@app/utils/automationConverter";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { ImportableAutomation } from "@app/hooks/tools/automate/useSavedAutomations";

interface AutomationImportModalProps {
  opened: boolean;
  toolRegistry: Partial<ToolRegistry>;
  onCancel: () => void;
  onImport: (
    automation: ImportableAutomation,
    meta: { format: ParsedAutomationImport["format"]; unresolved: string[] },
  ) => void | Promise<void>;
}

/**
 * Single import surface for both supported automation JSON shapes.
 *
 * Accepts a file drop or pasted text, auto-detects whether the JSON is the
 * native Automate config or the backend folder-scanning config, and shows
 * the resolved name + format before the user commits the import.
 */
export default function AutomationImportModal({
  opened,
  toolRegistry,
  onCancel,
  onImport,
}: AutomationImportModalProps) {
  const { t } = useTranslation();

  const [pastedText, setPastedText] = useState("");
  const [parsed, setParsed] = useState<ParsedAutomationImport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset modal state every time it's reopened so a previous import doesn't
  // leak into the next one.
  useEffect(() => {
    if (opened) {
      setPastedText("");
      setParsed(null);
      setParseError(null);
      setSubmitting(false);
    }
  }, [opened]);

  // Re-parse whenever the textarea changes — gives the user immediate feedback
  // without requiring a click.
  useEffect(() => {
    const trimmed = pastedText.trim();
    if (!trimmed) {
      setParsed(null);
      setParseError(null);
      return;
    }
    try {
      const result = parseAutomationFile(trimmed, toolRegistry);
      setParsed(result);
      setParseError(null);
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }, [pastedText, toolRegistry]);

  const handleFileDrop = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const text = await file.text();
      setPastedText(text);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      await onImport(parsed.automation, {
        format: parsed.format,
        unresolved: parsed.unresolvedOperations,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatLabel =
    parsed?.format === "automate"
      ? t("automate.importModal.detectedAutomation", "Automate JSON")
      : parsed?.format === "folderScanning"
        ? t("automate.importModal.detectedFolderScan", "Folder Scanning JSON")
        : null;

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("automate.importModal.title", "Import automation")}
      centered
      size="lg"
      zIndex={Z_INDEX_AUTOMATE_MODAL}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "automate.importModal.intro",
            "Drop a JSON file or paste its contents below. The format (Automate or Folder Scanning) is detected automatically.",
          )}
        </Text>

        <Dropzone
          onDrop={(files) => void handleFileDrop(files)}
          accept={["application/json", "text/plain"]}
          multiple={false}
          maxSize={10 * 1024 * 1024}
          aria-label={t(
            "automate.importModal.dropzoneAriaLabel",
            "Drop an automation JSON file here",
          )}
        >
          <Group
            gap="md"
            align="center"
            wrap="nowrap"
            mih={80}
            justify="center"
          >
            <UploadFileIcon style={{ fontSize: 32, opacity: 0.6 }} />
            <div>
              <Text size="sm" fw={500}>
                {t(
                  "automate.importModal.dropHint",
                  "Drop JSON here or click to choose a file",
                )}
              </Text>
              <Text size="xs" c="dimmed">
                {t(
                  "automate.importModal.dropSubhint",
                  "Both Automate and Folder Scanning configs are accepted",
                )}
              </Text>
            </div>
          </Group>
        </Dropzone>

        <Textarea
          label={t("automate.importModal.pasteLabel", "Or paste JSON")}
          placeholder={t(
            "automate.importModal.pastePlaceholder",
            "Paste your automation JSON here…",
          )}
          value={pastedText}
          onChange={(e) => setPastedText(e.currentTarget.value)}
          autosize
          minRows={6}
          maxRows={12}
          spellCheck={false}
          styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
        />

        {parseError && (
          <Alert color="red" variant="light">
            {t(
              "automate.importModal.parseError",
              "Could not parse: {{message}}",
              {
                message: parseError,
              },
            )}
          </Alert>
        )}

        {parsed && (
          <Alert color="green" variant="light">
            <Stack gap="xs">
              <Group gap="xs" align="center">
                <Badge color="green" variant="light">
                  {formatLabel}
                </Badge>
                <Text size="sm" fw={500}>
                  {parsed.automation.name}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {t("automate.importModal.opCount", "{{count}} operation(s)", {
                  count: parsed.automation.operations.length,
                })}
              </Text>
              {parsed.unresolvedOperations.length > 0 && (
                <Text size="xs" c="orange">
                  {t("automate.importModal.unresolved", "Unmapped: {{ops}}", {
                    ops: parsed.unresolvedOperations.join(", "),
                  })}
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        <Group gap="sm" justify="flex-end">
          <Button variant="subtle" onClick={onCancel} disabled={submitting}>
            {t("automate.importModal.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!parsed || submitting}
            loading={submitting}
          >
            {t("automate.importModal.confirm", "Import")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
