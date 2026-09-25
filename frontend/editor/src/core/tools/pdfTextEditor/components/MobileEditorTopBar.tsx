import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { EditorFileSwitcher } from "@app/tools/pdfTextEditor/components/EditorFileSwitcher";
import type { Controller } from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import { NotificationBell } from "@app/components/notifications/NotificationBell";
import { useIsPhone } from "@app/hooks/useIsMobile";
import "@app/tools/pdfTextEditor/components/EditorTopBar.css";
import "@app/tools/pdfTextEditor/components/MobileEditor.css";

interface Props {
  controller: Controller;
  hasDocument: boolean;
  dirty: boolean;
}

export function MobileEditorTopBar({ controller, hasDocument, dirty }: Props) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const isPhone = useIsPhone();

  return (
    <div
      className="pdf-editor-mtopbar"
      data-testid="pdf-editor-toolbar"
      data-layout="mobile"
    >
      <div className="pdf-editor-mtopbar__file">
        {session?.fileName ? (
          <EditorFileSwitcher
            currentFileId={session.fileId}
            currentFileName={session.fileName}
            dirty={dirty}
            onPick={session.pickFile}
          />
        ) : (
          <Text size="sm" c="dimmed" px={6}>
            {t("pdfTextEditor.sidebar.noFile", "No file loaded")}
          </Text>
        )}
      </div>

      {hasDocument && (
        <>
          <Button
            variant="tertiary"
            accent="neutral"
            size="xl"
            onClick={controller.onUndo}
            disabled={!controller.canUndo}
            aria-label={t("pdfTextEditor.toolbar.undo", "Undo")}
            data-testid="pdf-editor-undo"
            leftSection={<Icon name="undo-2" size={22} />}
          />
          <Button
            variant="tertiary"
            accent="neutral"
            size="xl"
            onClick={controller.onRedo}
            disabled={!controller.canRedo}
            aria-label={t("pdfTextEditor.toolbar.redo", "Redo")}
            data-testid="pdf-editor-redo"
            leftSection={<Icon name="redo-2" size={22} />}
          />
          <Button
            variant="tertiary"
            accent="neutral"
            size="xl"
            onClick={() => session?.download()}
            disabled={!session}
            aria-label={t("pdfTextEditor.mobile.download", "Save and download")}
            data-testid="pdf-editor-mobile-download"
            leftSection={<Icon name="download" size={22} />}
          />
          <Button
            size="lg"
            px="md"
            variant={dirty ? "primary" : "secondary"}
            accent={dirty ? "default" : "neutral"}
            onClick={() => session?.save()}
            disabled={!session}
            data-testid="pdf-editor-mobile-save"
          >
            {t("pdfTextEditor.mobile.save", "Save")}
          </Button>
        </>
      )}
      {isPhone && <NotificationBell />}
    </div>
  );
}
