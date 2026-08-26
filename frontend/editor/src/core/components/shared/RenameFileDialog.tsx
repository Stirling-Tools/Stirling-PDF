import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Modal, Stack, TextInput } from "@mantine/core";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

import { Button } from "@app/ui/Button";
import { splitFileName } from "@app/utils/fileUtils";

/** Characters Windows/macOS reject in a filename, which is also what a download saves as. */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/;

interface RenameFileDialogProps {
  opened: boolean;
  /** Current name, including its extension. */
  fileName: string;
  onClose: () => void;
  /** Gets the new full name. Throwing keeps the dialog open with the message. */
  onSubmit: (name: string) => void | Promise<void>;
}

/**
 * Renames one library file. Only the base name is editable - the extension is
 * shown but fixed, so a rename can't leave the file claiming the wrong type.
 */
export function RenameFileDialog({
  opened,
  fileName,
  onClose,
  onSubmit,
}: RenameFileDialogProps) {
  const { t } = useTranslation();
  const [base, extension] = splitFileName(fileName);
  const [value, setValue] = useState(base);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setValue(base);
      setSubmitting(false);
      setError(null);
    }
  }, [opened, base]);

  const submit = async () => {
    const nextBase = value.trim();
    if (!nextBase) return;
    if (ILLEGAL_NAME_CHARS.test(nextBase)) {
      setError(
        t(
          "fileSidebar.rename.illegalCharacters",
          "A file name can't contain \\ / : * ? \" < > |",
        ),
      );
      return;
    }
    const nextName = `${nextBase}${extension}`;
    if (nextName === fileName) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(nextName);
      onClose();
    } catch (err) {
      // Stay open on failure: closing would look like the rename worked.
      setError(
        err instanceof Error
          ? err.message
          : t("fileSidebar.rename.error", "Could not rename the file."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("fileSidebar.rename.title", "Rename file")}
      centered
      size="sm"
      transitionProps={{ duration: 0 }}
      // Mantine zeroes the body's top padding when a header is present, which
      // would butt the input's border straight against the header rule.
      styles={{ body: { paddingTop: "var(--mantine-spacing-md)" } }}
    >
      <Stack gap="sm">
        <TextInput
          autoFocus
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={200}
          aria-label={t("fileSidebar.rename.label", "File name")}
          rightSection={
            extension ? (
              <span style={{ color: "var(--c-text-subtle)", fontSize: 12 }}>
                {extension}
              </span>
            ) : undefined
          }
          rightSectionWidth={extension ? extension.length * 8 + 12 : undefined}
          rightSectionPointerEvents="none"
        />
        {error && (
          <Alert
            color="red"
            icon={<ErrorOutlineIcon fontSize="small" />}
            variant="light"
            role="alert"
          >
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="secondary" onClick={onClose}>
            {t("fileSidebar.rename.cancel", "Cancel")}
          </Button>
          <Button
            onClick={submit}
            loading={submitting}
            disabled={!value.trim()}
          >
            {t("fileSidebar.rename.save", "Rename")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
