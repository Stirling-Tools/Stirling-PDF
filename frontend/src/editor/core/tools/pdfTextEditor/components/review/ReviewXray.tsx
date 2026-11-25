import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import { imageAccessibility } from "@editor/tools/pdfTextEditor/util/imageAccessibility";
import { cssString } from "@editor/tools/pdfTextEditor/util/cssString";
import {
  artifactName,
  typeName,
} from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";

interface Props {
  doc: EditorDocument;
  pages: readonly PageSnapshot[];
  items: readonly ReviewItem[];
  /** Mark every item; otherwise only the selected one. */
  showAll: boolean;
  selectedId: string | null;
}

/**
 * Outlines each reviewed item in its status colour, with its tag in the gutter. A
 * stylesheet keyed on test ids, since the viewer mounts pages as it scrolls.
 */
export function ReviewXray({ doc, pages, items, showAll, selectedId }: Props) {
  const { t } = useTranslation();
  const css = useMemo(
    () =>
      items
        .filter((item) => showAll || item.id === selectedId)
        .map((item) => itemRule(item, badgeText(t, doc, pages, item)))
        .join("\n"),
    [t, doc, pages, items, showAll, selectedId],
  );
  return <style data-testid="pdf-editor-review-xray">{css}</style>;
}

function itemRule(item: ReviewItem, badge: string): string {
  const prefix = item.kind === "text" ? "run" : "image";
  const selector = `[data-testid="pdf-editor-${prefix}-${CSS.escape(item.id)}"]`;
  const todo = item.status === "todo";
  const tone = todo ? "warning" : "success";
  return [
    // The overlays set their own outline inline and clip their box; the badge
    // sits outside it, in the page's left gutter.
    `${selector}{outline:${todo ? "2px dashed" : "1px solid"} var(--c-${tone}) !important;outline-offset:2px;overflow:visible !important;}`,
    `${selector}::after{content:${cssString(badge)};position:absolute;right:calc(100% + 6px);top:0;` +
      `white-space:nowrap;font:600 10px/16px var(--mantine-font-family, system-ui);padding:0 5px;border-radius:4px;` +
      `background:var(--c-${tone}-subtle);color:var(--c-${tone}-solid, var(--c-${tone}));` +
      // The overlay paints its own text transparent, over the rendered page.
      `-webkit-text-fill-color:currentColor;pointer-events:none;z-index:5;}`,
  ].join("\n");
}

function badgeText(
  t: TFunction,
  doc: EditorDocument,
  pages: readonly PageSnapshot[],
  item: ReviewItem,
): string {
  const page = pages[item.pageIndex];
  if (item.kind === "text") {
    const run = page?.runs.find((r) => r.id === item.id);
    if (!run) return "";
    const tag = textTag(doc, run);
    if (tag.kind === "tagged") {
      const type = tag.block.type;
      if (type === "P" || /^H[1-6]$/.test(type ?? "")) return type ?? "";
      return type ? typeName(t, type) : tag.block.role;
    }
    if (tag.kind === "artifact") return artifactName(t, tag.furniture);
    return t("pdfTextEditor.review.badge.untagged", "Needs a tag");
  }
  const image = page?.images.find((i) => i.id === item.id);
  if (!image) return "";
  const accessibility = imageAccessibility(doc, image);
  if (accessibility.kind === "decorative") return artifactName(t, null);
  return item.status === "done"
    ? t("pdfTextEditor.review.badge.described", "Described")
    : t("pdfTextEditor.review.badge.noDescription", "Needs a description");
}
