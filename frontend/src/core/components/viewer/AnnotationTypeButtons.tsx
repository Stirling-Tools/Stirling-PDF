import { useTranslation } from "react-i18next";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import type { PdfAnnotationObject } from "@embedpdf/models";
import { OpacityControl } from "@app/components/annotation/shared/OpacityControl";
import { WidthControl } from "@app/components/annotation/shared/WidthControl";
import {
  PropertiesPopover,
  type PropertiesAnnotationType,
} from "@app/components/annotation/shared/PropertiesPopover";
import { ColorControl } from "@app/components/annotation/shared/ColorControl";
import {
  DeleteButton,
  EditTextButton,
  AttachCommentButton,
  CommentButton,
  LinkButton,
} from "@app/components/viewer/AnnotationMenuButtons";
import type {
  AnnotationType,
  AnnotationMenuState,
  AnnotationMenuHandlers,
} from "@app/components/viewer/useAnnotationMenuHandlers";

export interface AnnotationTypeButtonsProps
  extends AnnotationMenuState, AnnotationMenuHandlers {
  annotation: TrackedAnnotation<PdfAnnotationObject> | undefined;
  documentId: string;
  pageIndex: number | undefined;
  annotationId: string | undefined;
}

export function AnnotationTypeButtons(props: AnnotationTypeButtonsProps) {
  const { t } = useTranslation();
  const {
    annotationType,
    currentColor,
    strokeColor,
    fillColor,
    backgroundColor,
    textColor,
    currentOpacity,
    currentWidth,
    hasCommentContent,
    isInSidebar,
    firstLinkTarget,
    obj,
    annotation,
    onDelete,
    onEdit,
    onColorChange,
    onOpacityChange,
    onWidthChange,
    onPropertiesUpdate,
    onGoToLink,
    onAddLink,
    onAddToSidebar,
    onViewComment,
    onCommentColorChange,
  } = props;

  // When a comment is attached, show the same chat-bubble "View comment" button used by
  // standalone comment annotations. When no comment, show the "Add comment" attach button.
  const attachCommentButton = isInSidebar ? (
    <CommentButton hasContent={hasCommentContent} onClick={onViewComment} />
  ) : (
    <AttachCommentButton
      isInSidebar={false}
      onView={onViewComment}
      onAdd={onAddToSidebar}
    />
  );

  switch (annotationType as AnnotationType) {
    case "textMarkup":
      return (
        <>
          {attachCommentButton}
          <ColorControl
            value={currentColor}
            onChange={(color) => onColorChange(color, "main")}
            label={t("annotation.changeColor", "Change Colour")}
          />
          <OpacityControl value={currentOpacity} onChange={onOpacityChange} />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "ink":
      return (
        <>
          {attachCommentButton}
          <ColorControl
            value={currentColor}
            onChange={(color) => onColorChange(color, "main")}
            label={t("annotation.changeColor", "Change Colour")}
          />
          <WidthControl
            value={currentWidth}
            onChange={onWidthChange}
            min={1}
            max={12}
          />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "inkHighlighter":
      return (
        <>
          {attachCommentButton}
          <ColorControl
            value={currentColor}
            onChange={(color) => onColorChange(color, "main")}
            label={t("annotation.changeColor", "Change Colour")}
          />
          <WidthControl
            value={currentWidth}
            onChange={onWidthChange}
            min={1}
            max={20}
          />
          <OpacityControl value={currentOpacity} onChange={onOpacityChange} />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "text":
    case "note":
      return (
        <>
          {attachCommentButton}
          <ColorControl
            value={textColor}
            onChange={(color) => onColorChange(color, "text")}
            label={t("annotation.color", "Color")}
          />
          <ColorControl
            value={backgroundColor}
            onChange={(color) => onColorChange(color, "background")}
            label={t("annotation.backgroundColor", "Background color")}
          />
          <EditTextButton onEdit={onEdit} />
          <PropertiesPopover
            annotationType={annotationType as PropertiesAnnotationType}
            annotation={annotation}
            onUpdate={onPropertiesUpdate}
          />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "comment":
      return (
        <>
          <CommentButton
            hasContent={hasCommentContent}
            onClick={onViewComment}
          />
          <EditTextButton onEdit={onEdit} />
          <ColorControl
            value={obj?.strokeColor || obj?.color || "#ffa000"}
            onChange={onCommentColorChange}
            label={t("annotation.annotationStyle", "Annotation style")}
          />
          <LinkButton
            firstLinkTarget={firstLinkTarget}
            onGoToLink={onGoToLink}
            onAddLink={onAddLink}
          />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "shape":
      return (
        <>
          {attachCommentButton}
          <ColorControl
            value={strokeColor}
            onChange={(color) => onColorChange(color, "stroke")}
            label={t("annotation.strokeColor", "Stroke Colour")}
          />
          <ColorControl
            value={fillColor}
            onChange={(color) => onColorChange(color, "fill")}
            label={t("annotation.fillColor", "Fill Colour")}
          />
          <PropertiesPopover
            annotationType="shape"
            annotation={annotation}
            onUpdate={onPropertiesUpdate}
          />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "line":
      return (
        <>
          {attachCommentButton}
          <ColorControl
            value={currentColor}
            onChange={(color) => onColorChange(color, "main")}
            label={t("annotation.changeColor", "Change Colour")}
          />
          <WidthControl
            value={currentWidth}
            onChange={onWidthChange}
            min={1}
            max={12}
          />
          <DeleteButton onDelete={onDelete} />
        </>
      );

    case "stamp":
      return (
        <>
          {attachCommentButton}
          <DeleteButton onDelete={onDelete} />
        </>
      );

    default:
      return (
        <>
          {attachCommentButton}
          <LinkButton
            firstLinkTarget={firstLinkTarget}
            onGoToLink={onGoToLink}
            onAddLink={onAddLink}
          />
          <ColorControl
            value={currentColor}
            onChange={(color) => onColorChange(color, "main")}
            label={t("annotation.changeColor", "Change Colour")}
          />
          <DeleteButton onDelete={onDelete} />
        </>
      );
  }
}
