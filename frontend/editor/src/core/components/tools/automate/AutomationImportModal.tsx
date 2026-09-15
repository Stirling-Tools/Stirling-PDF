import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
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
    meta: {
      format: ParsedAutomationImport["format"];
      unresolved: string[];
      warnings: string[];
    },
  ) => void | Promise<void>;
}

/**
 * Single import surface for every supported automation file.
 *
 * Accepts a file drop or pasted text, auto-detects the format (native
 * Automate JSON, backend folder-scanning JSON, Acrobat Action or Distiller
 * job options), and shows the resolved name, format and any migration
 * warnings before the user commits the import.
 */
export default function AutomationImportModal({
  opened,
  toolRegistry,
  onCancel,
  onImport,
}: AutomationImportModalProps) {
  const { t } = useTranslation();

  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [parsed, setParsed] = useState<ParsedAutomationImport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset modal state every time it's reopened so a previous import doesn't
  // leak into the next one.
  useEffect(() => {
    if (opened) {
      setPastedText("");
      setFileName(undefined);
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
      const result = parseAutomationFile(
        trimmed,
        toolRegistry,
        undefined,
        fileName,
      );
      setParsed(result);
      setParseError(null);
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }, [pastedText, toolRegistry, fileName]);

  const handleFileDrop = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const text = await file.text();
      // Distiller job options carry no name of their own, so the file name is
      // the only thing that can name the imported automation.
      setFileName(file.name);
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
        warnings: parsed.warnings,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const dropzoneLabel = t(
    "automate.importModal.dropzoneAriaLabel",
    "Drop an automation file here",
  );

  const formatLabel = !parsed
    ? null
    : parsed.format === "automate"
      ? t("automate.importModal.detectedAutomation", "Automate JSON")
      : parsed.format === "folderScanning"
        ? t("automate.importModal.detectedFolderScan", "Folder Scanning JSON")
        : parsed.format === "acrobatSequence"
          ? t("automate.importModal.detectedAcrobat", "Acrobat Action")
          : t(
              "automate.importModal.detectedJobOptions",
              "Distiller job options",
            );

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("automate.importModal.title", "Import automation")}
      centered
      size="lg"
      zIndex={Z_INDEX_AUTOMATE_MODAL}
    >
      {/* An Acrobat Action with several unmappable steps makes this content
          taller than a short viewport. Scroll the content, not the whole body,
          so Cancel/Import stay pinned and reachable. */}
      <ScrollArea.Autosize mah="calc(100vh - 16rem)" offsetScrollbars>
        <Stack gap="md" pr="xs">
          <Text size="sm" c="dimmed">
            {t(
              "automate.importModal.intro",
              "Drop a file or paste its contents below. Automate JSON, Folder Scanning JSON, Acrobat Actions (.sequ) and Distiller job options (.joboptions) are detected automatically.",
            )}
          </Text>

          <Dropzone
            onDrop={(files) => void handleFileDrop(files)}
            // .sequ and .joboptions have no registered MIME type, so the
            // extensions have to be listed explicitly for the file picker.
            accept={[
              "application/json",
              "application/xml",
              "text/xml",
              "text/plain",
              ".json",
              ".sequ",
              ".joboptions",
            ]}
            multiple={false}
            maxSize={10 * 1024 * 1024}
            aria-label={dropzoneLabel}
            // Dropzone's own aria-label lands on the wrapper; the hidden file
            // input it renders needs naming separately.
            inputProps={{ "aria-label": dropzoneLabel }}
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
                  {fileName ??
                    t(
                      "automate.importModal.dropHint",
                      "Drop a file here or click to choose one",
                    )}
                </Text>
                <Text size="xs" c="dimmed">
                  {fileName
                    ? t(
                        "automate.importModal.dropReplace",
                        "Drop another to replace it",
                      )
                    : t(
                        "automate.importModal.dropSubhint",
                        "Accepts .json, .sequ (Acrobat Action) and .joboptions",
                      )}
                </Text>
              </div>
            </Group>
          </Dropzone>

          <Textarea
            label={t(
              "automate.importModal.pasteLabel",
              "Or paste file contents",
            )}
            placeholder={t(
              "automate.importModal.pastePlaceholder",
              "Paste your automation file contents here…",
            )}
            value={pastedText}
            onChange={(e) => {
              setFileName(undefined);
              setPastedText(e.currentTarget.value);
            }}
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
                {/* Only when nothing richer follows: the warnings panel lists the
                  same commands with a reason, and amber-on-green reads as a
                  colour clash. */}
                {parsed.unresolvedOperations.length > 0 &&
                  parsed.warnings.length === 0 && (
                    <Text size="xs" c="var(--color-amber-dark)">
                      {t(
                        "automate.importModal.unresolved",
                        "Unmapped: {{ops}}",
                        {
                          ops: parsed.unresolvedOperations.join(", "),
                        },
                      )}
                    </Text>
                  )}
              </Stack>
            </Alert>
          )}

          {parsed && parsed.warnings.length > 0 && (
            <Alert color="yellow" variant="light">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  {t(
                    "automate.importModal.warningsTitle",
                    "Check these steps after importing",
                  )}
                </Text>
                {/* No inner scroller: the modal itself scrolls, and nesting a
                  second scroll surface hides warnings behind a scrollbar the
                  user has no reason to look for. */}
                <Stack gap={4}>
                  {parsed.warnings.map((warning) => (
                    <Text key={warning} size="xs">
                      • {warning}
                    </Text>
                  ))}
                </Stack>
              </Stack>
            </Alert>
          )}

          {parsed?.format === "acrobatSequence" &&
            parsed.instructions.length > 0 && (
              <Alert color="blue" variant="light">
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    {t(
                      "automate.importModal.acrobatInstructionsTitle",
                      "Operator notes from the Acrobat Action",
                    )}
                  </Text>
                  {parsed.instructions.map((instruction) => (
                    <Text
                      key={instruction}
                      size="xs"
                      style={{ whiteSpace: "pre-wrap" }}
                    >
                      {instruction}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
        </Stack>
      </ScrollArea.Autosize>

      <Group gap="sm" justify="flex-end" pt="md">
        <Button variant="tertiary" onClick={onCancel} disabled={submitting}>
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
    </Modal>
  );
}
