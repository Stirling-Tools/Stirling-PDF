import { useEffect, type ComponentProps } from "react";
import { Drawer } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { EditorSidebar } from "@app/tools/pdfTextEditor/components/EditorSidebar";
import { FormatGroup } from "@app/tools/pdfTextEditor/components/toolbar/FormatGroup";
import { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";
import "@app/tools/pdfTextEditor/components/MobileEditor.css";

type SidebarProps = ComponentProps<typeof EditorSidebar>;

const SHEET_STYLES = {
  content: {
    borderTopLeftRadius: "1rem",
    borderTopRightRadius: "1rem",
    height: "auto",
    maxHeight: "80dvh",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  header: { paddingBottom: "0.5rem" },
} as const;

export function MobileEditorSheets(props: Omit<SidebarProps, "initialTab">) {
  const { t } = useTranslation();
  const { store, state, selection } = props;
  const controller = useToolbarController(store, state, selection);
  const sheet = state.mobileSheet;
  const hasSelection =
    selection.runIds.length > 0 || selection.imageIds.length > 0;

  useEffect(() => {
    if (sheet === "style" && !controller.hasRunSelection) {
      store.setMobileSheet(null);
    }
  }, [sheet, controller.hasRunSelection, store]);

  const close = () => store.setMobileSheet(null);

  return (
    <>
      <Drawer
        opened={sheet === "style" && controller.hasRunSelection}
        onClose={close}
        position="bottom"
        size="auto"
        title={t("pdfTextEditor.mobile.style", "Style")}
        overlayProps={{ backgroundOpacity: 0.12 }}
        styles={SHEET_STYLES}
        data-testid="pdf-editor-mobile-style-sheet"
      >
        <div className="pdf-editor-msheet__style">
          <FormatGroup controller={controller} touch />
        </div>
      </Drawer>
      <Drawer
        opened={sheet === "details"}
        onClose={close}
        position="bottom"
        size="auto"
        title={
          hasSelection
            ? t("pdfTextEditor.mobile.details", "Details")
            : t("pdfTextEditor.mobile.document", "Document")
        }
        overlayProps={{ backgroundOpacity: 0.3 }}
        styles={SHEET_STYLES}
        data-testid="pdf-editor-mobile-details-sheet"
      >
        <EditorSidebar
          {...props}
          initialTab={hasSelection ? "selected" : "document"}
        />
      </Drawer>
    </>
  );
}
