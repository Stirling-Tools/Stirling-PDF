import type { ReactNode } from "react";
import { Group, Tooltip } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import {
  NO_SHRINK,
  type Controller,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";

export interface ImageTransform {
  mode: "rotate-ccw" | "rotate-cw" | "flip-h" | "flip-v";
  testId: string;
  icon: ReactNode;
  label: string;
}

export function imageTransforms(t: TFunction): ImageTransform[] {
  return [
    {
      mode: "rotate-ccw",
      testId: "pdf-editor-imgop-rotate-ccw",
      icon: <Icon name="rotate-ccw" size={20} />,
      label: t("pdfTextEditor.toolbar.rotateLeft", "Rotate 90° left"),
    },
    {
      mode: "rotate-cw",
      testId: "pdf-editor-imgop-rotate-cw",
      icon: <Icon name="rotate-cw" size={20} />,
      label: t("pdfTextEditor.toolbar.rotateRight", "Rotate 90° right"),
    },
    {
      mode: "flip-h",
      testId: "pdf-editor-imgop-flip-h",
      icon: <Icon name="flip-horizontal-2" size={20} />,
      label: t("pdfTextEditor.toolbar.flipHorizontal", "Flip horizontal"),
    },
    {
      mode: "flip-v",
      testId: "pdf-editor-imgop-flip-v",
      icon: (
        <Icon
          name="flip-horizontal-2"
          size={20}
          style={{ transform: "rotate(90deg)" }}
        />
      ),
      label: t("pdfTextEditor.toolbar.flipVertical", "Flip vertical"),
    },
  ];
}

/** Rotate, flip and the two ways to swap an image's pixels, as icon buttons. */
export function ImageGroup({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const {
    onTransformImage,
    onReplaceImage,
    onEditImageExternally,
    externalEditSupported,
  } = controller;
  const replaceLabel = t(
    "pdfTextEditor.toolbar.replaceImage",
    "Replace, keeping placement",
  );
  const externalLabel = t(
    "pdfTextEditor.toolbar.editImageExternally",
    "Edit in another app",
  );

  return (
    <Group gap={4} wrap="nowrap" data-testid="pdf-editor-imgop-menu">
      {imageTransforms(t).map((tr) => (
        <Tooltip key={tr.mode} label={tr.label}>
          <Button
            size="sm"
            variant="tertiary"
            accent="neutral"
            aria-label={tr.label}
            data-testid={tr.testId}
            onClick={() => onTransformImage(tr.mode)}
            style={NO_SHRINK}
            leftSection={tr.icon}
          />
        </Tooltip>
      ))}
      <Tooltip label={replaceLabel}>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          aria-label={replaceLabel}
          onClick={onReplaceImage}
          data-testid="pdf-editor-imgop-replace"
          style={NO_SHRINK}
          leftSection={<Icon name="image" size={20} />}
        />
      </Tooltip>
      <Tooltip label={externalLabel}>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          aria-label={externalLabel}
          onClick={onEditImageExternally}
          disabled={!externalEditSupported}
          data-testid="pdf-editor-imgop-edit-externally"
          style={NO_SHRINK}
          leftSection={<Icon name="external-link" size={20} />}
        />
      </Tooltip>
    </Group>
  );
}
