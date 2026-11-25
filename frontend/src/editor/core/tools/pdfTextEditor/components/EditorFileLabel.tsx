import { Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

interface Props {
  fileName: string;
  dirty: boolean;
}

/** The open file's name, with a dot while it has unsaved edits. */
export function EditorFileLabel({ fileName, dirty }: Props) {
  const { t } = useTranslation();
  return (
    <Tooltip label={<PrivateContent>{fileName}</PrivateContent>}>
      <Text
        size="xs"
        c="dimmed"
        px={6}
        data-testid="pdf-editor-filename"
        component="div"
      >
        <span className="pdf-editor-topbar__file">
          <Icon name="file-text" size={20} style={{ flexShrink: 0 }} />
          <span
            className={`pdf-editor-topbar__filename ${privateContentClassName}`}
          >
            {fileName}
          </span>
          {dirty && (
            <span
              className="pdf-editor-topbar__dirty"
              data-testid="pdf-editor-dirty-dot"
              aria-label={t("pdfTextEditor.unsaved", "(unsaved)")}
            />
          )}
        </span>
      </Text>
    </Tooltip>
  );
}
