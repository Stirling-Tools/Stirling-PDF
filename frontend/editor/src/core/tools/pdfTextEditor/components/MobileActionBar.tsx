import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@app/ui/Icon";
import { ArrangeMenuItems } from "@app/tools/pdfTextEditor/components/toolbar/ObjectGroup";
import type { Controller } from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import "@app/tools/pdfTextEditor/components/MobileEditor.css";

interface Props {
  store: EditorStore;
  controller: Controller;
  addTextArmed: boolean;
  findOpen: boolean;
}

export function MobileActionBar({
  store,
  controller,
  addTextArmed,
  findOpen,
}: Props) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const hasSelection = controller.selectionCount > 0;

  return (
    <>
      {addTextArmed && (
        <div className="pdf-editor-mbar__hint" role="status">
          <span>
            {t(
              "pdfTextEditor.mobile.tapToPlace",
              "Tap the page where the text should go",
            )}
          </span>
          <BarButton
            icon="x"
            label={t("pdfTextEditor.mobile.cancel", "Cancel")}
            onClick={() => store.setMode("select")}
            data-testid="pdf-editor-mobile-cancel-add"
            style={{ flex: "0 0 auto" }}
          />
        </div>
      )}
      <div
        className="pdf-editor-mbar"
        role="toolbar"
        aria-label={t("pdfTextEditor.mobile.actions", "Editor actions")}
        data-testid="pdf-editor-mobile-actionbar"
        data-context={hasSelection ? "selection" : "idle"}
      >
        {hasSelection ? (
          <>
            {controller.hasRunSelection && (
              <BarButton
                icon="case-sensitive"
                label={t("pdfTextEditor.mobile.style", "Style")}
                onClick={() => store.setMobileSheet("style")}
                data-testid="pdf-editor-mobile-style"
              />
            )}
            <BarButton
              icon="sliders-horizontal"
              label={t("pdfTextEditor.mobile.details", "Details")}
              onClick={() => store.setMobileSheet("details")}
              data-testid="pdf-editor-mobile-details"
            />
            <Menu shadow="md" position="top" withinPortal closeOnItemClick>
              <Menu.Target>
                <BarButton
                  icon="layers"
                  label={t("pdfTextEditor.toolbar.arrange", "Arrange")}
                  data-testid="pdf-editor-arrange-menu"
                />
              </Menu.Target>
              <Menu.Dropdown>
                <ArrangeMenuItems controller={controller} />
              </Menu.Dropdown>
            </Menu>
            <BarButton
              icon={controller.selectionAllLocked ? "lock" : "lock-open"}
              label={
                controller.selectionAllLocked
                  ? t("pdfTextEditor.mobile.unlock", "Unlock")
                  : t("pdfTextEditor.mobile.lock", "Lock")
              }
              pressed={controller.selectionAllLocked}
              onClick={controller.onToggleLock}
              data-testid="pdf-editor-toggle-lock"
            />
            <BarButton
              icon="trash"
              label={t("pdfTextEditor.mobile.delete", "Delete")}
              danger
              onClick={controller.onDelete}
              data-testid="pdf-editor-delete"
            />
            <span className="pdf-editor-mbar__divider" aria-hidden />
            <BarButton
              icon="check"
              label={t("pdfTextEditor.mobile.done", "Done")}
              onClick={() => store.selection.clear()}
              data-testid="pdf-editor-mobile-done"
            />
          </>
        ) : (
          <>
            <BarButton
              icon="type"
              label={t("pdfTextEditor.mobile.addText", "Text")}
              pressed={addTextArmed}
              onClick={() => store.setMode(addTextArmed ? "select" : "addText")}
              data-testid="pdf-editor-add-text"
            />
            <BarButton
              icon="image-plus"
              label={t("pdfTextEditor.mobile.addImage", "Image")}
              disabled={!session}
              onClick={() => session?.pickImage()}
              data-testid="pdf-editor-add-image"
            />
            <BarButton
              icon="search"
              label={t("pdfTextEditor.mobile.find", "Find")}
              pressed={findOpen}
              onClick={() => store.setFindOpen(!findOpen)}
              data-testid="pdf-editor-open-find"
            />
            <BarButton
              icon="file-text"
              label={t("pdfTextEditor.mobile.document", "Document")}
              onClick={() => store.setMobileSheet("details")}
              data-testid="pdf-editor-mobile-document"
            />
          </>
        )}
      </div>
    </>
  );
}

interface BarButtonProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children"
> {
  icon: IconName;
  label: string;
  pressed?: boolean;
  danger?: boolean;
}

const BarButton = forwardRef<HTMLButtonElement, BarButtonProps>(
  function BarButton(
    { icon, label, pressed, danger, className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        data-danger={danger ? "true" : undefined}
        {...rest}
        className={["pdf-editor-mbar__btn", className]
          .filter(Boolean)
          .join(" ")}
      >
        <Icon name={icon} size={22} />
        <span className="pdf-editor-mbar__label">{label}</span>
      </button>
    );
  },
);
