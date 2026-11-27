import { Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { useFileSources } from "@editor/components/shared/useFileSources";
import { StirlingFile, StirlingFileStub } from "@editor/types/fileContext";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { ProtectedPdfToolNotice } from "@editor/components/tools/shared/ProtectedPdfToolNotice";
import styles from "@editor/components/tools/shared/FileStatusIndicator.module.css";

export interface FileStatusIndicatorProps {
  selectedFiles?: StirlingFile[];
  minFiles?: number;
  unavailableFiles?: readonly StirlingFileStub[];
}

export function needsMoreFiles(selectedCount: number, minFiles = 1): boolean {
  return selectedCount < minFiles;
}

// Long enough to keep the extension and the last few characters, where names
// such as "report-v2.pdf" and "report-v3.pdf" differ.
const NAME_TAIL = 8;

/** Elides the middle of a file name so both its start and its end stay visible. */
function MiddleTruncatedName({ name }: { name: string }) {
  if (name.length <= NAME_TAIL + 4) {
    return <span className={styles.nameHead}>{name}</span>;
  }
  return (
    <span className={styles.name} title={name}>
      <span className={styles.nameHead}>{name.slice(0, -NAME_TAIL)}</span>
      <span className={styles.nameTail}>{name.slice(-NAME_TAIL)}</span>
    </span>
  );
}

function FileSourceTiles() {
  const { sources, pickers } = useFileSources();
  return (
    <>
      <div className={styles.tiles}>
        {sources.map((source) => (
          <button
            key={source.key}
            type="button"
            className={styles.tile}
            onClick={source.onClick}
          >
            <Icon name={source.icon} size="1.25rem" />
            <span className={styles.label}>{source.tileLabel}</span>
          </button>
        ))}
      </div>
      {pickers}
    </>
  );
}

const FileStatusIndicator = ({
  selectedFiles = [],
  minFiles = 1,
  unavailableFiles = [],
}: FileStatusIndicatorProps) => {
  const { t } = useTranslation();
  const needsFiles = needsMoreFiles(selectedFiles.length, minFiles);

  return (
    <Stack gap="xs" data-testid="tool-file-list">
      {selectedFiles.length > 0 && (
        <Text size="sm" c="dimmed" className={styles.summary}>
          {selectedFiles.length === 1 ? (
            <PrivateContent className={styles.name}>
              <MiddleTruncatedName name={selectedFiles[0]?.name ?? ""} />
            </PrivateContent>
          ) : (
            t("filesSelected", "{{count}} files", {
              count: selectedFiles.length,
            })
          )}
        </Text>
      )}
      {needsFiles && minFiles > 1 && (
        <Text size="sm" c="dimmed">
          {t("files.addAtLeast", "Add at least {{count}} files", {
            count: minFiles,
          })}
        </Text>
      )}
      <ProtectedPdfToolNotice files={unavailableFiles} />
      {needsFiles && <FileSourceTiles />}
    </Stack>
  );
};

export default FileStatusIndicator;
