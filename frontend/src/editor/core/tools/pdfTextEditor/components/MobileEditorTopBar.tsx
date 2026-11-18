import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { Button } from "@editor/ui/Button";
import { EditorFileLabel } from "@editor/tools/pdfTextEditor/components/EditorFileLabel";
import type { Controller } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import { NotificationBell } from "@editor/components/notifications/NotificationBell";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import "@editor/tools/pdfTextEditor/components/EditorTopBar.css";
import "@editor/tools/pdfTextEditor/components/MobileEditor.css";

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
          <EditorFileLabel fileName={session.fileName} dirty={dirty} />
        ) : (
          <Text size="sm" c="dimmed" px={6}>
            {t("pdfTextEditor.sidebar.noFile", "No file loaded")}
          </Text>
        )}
      </div>

      {/* Shown from the first frame, idle until the document is read. */}
      <Button
        variant="tertiary"
        accent="neutral"
        size="xl"
        onClick={controller.onUndo}
        disabled={!hasDocument || !controller.canUndo}
        aria-label={t("pdfTextEditor.toolbar.undo", "Undo")}
        data-testid="pdf-editor-undo"
        leftSection={<Icon name="undo-2" size={22} />}
      />
      <Button
        variant="tertiary"
        accent="neutral"
        size="xl"
        onClick={controller.onRedo}
        disabled={!hasDocument || !controller.canRedo}
        aria-label={t("pdfTextEditor.toolbar.redo", "Redo")}
        data-testid="pdf-editor-redo"
        leftSection={<Icon name="redo-2" size={22} />}
      />
      <Button
        variant="tertiary"
        accent="neutral"
        size="xl"
        onClick={() => session?.download()}
        disabled={!session || !hasDocument}
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
        disabled={!session || !hasDocument}
        data-testid="pdf-editor-mobile-save"
      >
        {t("pdfTextEditor.mobile.save", "Save")}
      </Button>
      {isPhone && <NotificationBell />}
    </div>
  );
}
