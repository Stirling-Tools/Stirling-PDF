import { useTranslation } from "react-i18next";
import { modShortcut } from "@app/utils/hotkeys";
import { ActionGridPanel } from "@app/tools/pdfTextEditor/components/toolbar/ActionGridPanel";
import type { Controller } from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";

/** Stacking, alignment and spacing for the selection. */
export function ArrangePanel({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const { onChangeZOrder, onAlign, onDistribute, selectionCount } = controller;
  // One multi-line paragraph aligns its own lines left, centre or right.
  const hAlignOff = selectionCount < 2 && !controller.canAlignLines;
  const vAlignOff = selectionCount < 2;
  const distributeOff = selectionCount < 3;
  const needsTwo = t(
    "pdfTextEditor.toolbar.needsTwo",
    "Select 2 or more objects",
  );

  return (
    <ActionGridPanel
      testId="pdf-editor-arrange-panel"
      sections={[
        {
          label: t("pdfTextEditor.toolbar.order", "Order"),
          actions: [
            {
              icon: "bring-to-front",
              label: t("pdfTextEditor.toolbar.bringToFront", "Bring to front"),
              shortcut: modShortcut("Shift+]"),
              onClick: () => onChangeZOrder("to-front"),
              testId: "pdf-editor-z-to-front",
            },
            {
              icon: "arrow-up",
              label: t("pdfTextEditor.toolbar.bringForward", "Bring forward"),
              shortcut: modShortcut("]"),
              onClick: () => onChangeZOrder("forward"),
              testId: "pdf-editor-z-forward",
            },
            {
              icon: "arrow-down",
              label: t("pdfTextEditor.toolbar.sendBackward", "Send backward"),
              shortcut: modShortcut("["),
              onClick: () => onChangeZOrder("backward"),
              testId: "pdf-editor-z-backward",
            },
            {
              icon: "send-to-back",
              label: t("pdfTextEditor.toolbar.sendToBack", "Send to back"),
              shortcut: modShortcut("Shift+["),
              onClick: () => onChangeZOrder("to-back"),
              testId: "pdf-editor-z-to-back",
            },
          ],
        },
        {
          label: t("pdfTextEditor.toolbar.align", "Align"),
          hint: hAlignOff
            ? needsTwo
            : vAlignOff
              ? t(
                  "pdfTextEditor.toolbar.alignLinesHint",
                  "Aligns this paragraph's lines",
                )
              : null,
          actions: [
            {
              icon: "align-start-vertical",
              label: t("pdfTextEditor.toolbar.alignLeft", "Align left"),
              disabled: hAlignOff,
              onClick: () => onAlign("left"),
              testId: "pdf-editor-align-left",
            },
            {
              icon: "align-center-vertical",
              label: t("pdfTextEditor.toolbar.alignCentre", "Align centre"),
              disabled: hAlignOff,
              onClick: () => onAlign("center-h"),
              testId: "pdf-editor-align-center-h",
            },
            {
              icon: "align-end-vertical",
              label: t("pdfTextEditor.toolbar.alignRight", "Align right"),
              disabled: hAlignOff,
              onClick: () => onAlign("right"),
              testId: "pdf-editor-align-right",
            },
            {
              icon: "align-start-horizontal",
              label: t("pdfTextEditor.toolbar.alignTop", "Align top"),
              disabled: vAlignOff,
              onClick: () => onAlign("top"),
              testId: "pdf-editor-align-top",
            },
            {
              icon: "align-center-horizontal",
              label: t("pdfTextEditor.toolbar.alignMiddle", "Align middle"),
              disabled: vAlignOff,
              onClick: () => onAlign("middle-v"),
              testId: "pdf-editor-align-middle-v",
            },
            {
              icon: "align-end-horizontal",
              label: t("pdfTextEditor.toolbar.alignBottom", "Align bottom"),
              disabled: vAlignOff,
              onClick: () => onAlign("bottom"),
              testId: "pdf-editor-align-bottom",
            },
          ],
        },
        {
          label: t("pdfTextEditor.toolbar.distribute", "Distribute"),
          hint: distributeOff
            ? t("pdfTextEditor.toolbar.needsThree", "Select 3 or more objects")
            : null,
          actions: [
            {
              icon: "spline",
              label: t(
                "pdfTextEditor.toolbar.distributeHorizontally",
                "Distribute horizontally",
              ),
              disabled: distributeOff,
              onClick: () => onDistribute("horizontal"),
              testId: "pdf-editor-distribute-h",
            },
            {
              icon: "spline",
              label: t(
                "pdfTextEditor.toolbar.distributeVertically",
                "Distribute vertically",
              ),
              iconStyle: { transform: "rotate(90deg)" },
              disabled: distributeOff,
              onClick: () => onDistribute("vertical"),
              testId: "pdf-editor-distribute-v",
            },
          ],
        },
      ]}
    />
  );
}

/** Quarter turns and mirroring for one selected image. */
export function TransformPanel({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const { onTransformImage } = controller;
  return (
    <ActionGridPanel
      testId="pdf-editor-transform-panel"
      sections={[
        {
          label: t("pdfTextEditor.toolbar.rotate", "Rotate"),
          actions: [
            {
              icon: "rotate-ccw",
              label: t("pdfTextEditor.toolbar.rotateLeft", "Rotate 90° left"),
              onClick: () => onTransformImage("rotate-ccw"),
              testId: "pdf-editor-imgop-rotate-ccw",
            },
            {
              icon: "rotate-cw",
              label: t("pdfTextEditor.toolbar.rotateRight", "Rotate 90° right"),
              onClick: () => onTransformImage("rotate-cw"),
              testId: "pdf-editor-imgop-rotate-cw",
            },
          ],
        },
        {
          label: t("pdfTextEditor.toolbar.flip", "Flip"),
          actions: [
            {
              icon: "flip-horizontal-2",
              label: t(
                "pdfTextEditor.toolbar.flipHorizontal",
                "Flip horizontal",
              ),
              onClick: () => onTransformImage("flip-h"),
              testId: "pdf-editor-imgop-flip-h",
            },
            {
              icon: "flip-horizontal-2",
              label: t("pdfTextEditor.toolbar.flipVertical", "Flip vertical"),
              iconStyle: { transform: "rotate(90deg)" },
              onClick: () => onTransformImage("flip-v"),
              testId: "pdf-editor-imgop-flip-v",
            },
          ],
        },
        ...(controller.externalEditSupported
          ? [
              {
                label: t("pdfTextEditor.toolbar.editSection", "Edit"),
                actions: [
                  {
                    icon: "external-link" as const,
                    label: t(
                      "pdfTextEditor.toolbar.editImageExternally",
                      "Edit in another app",
                    ),
                    onClick: controller.onEditImageExternally,
                    testId: "pdf-editor-imgop-edit-externally",
                  },
                ],
              },
            ]
          : []),
      ]}
    />
  );
}
