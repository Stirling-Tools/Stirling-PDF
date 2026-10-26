import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Section,
  SectionLabel,
  StatRow,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

/** What the selected text is tagged as. */
export function TextAccessibilitySection({ tag }: { tag: TextTag }) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-text-accessibility">
      <SectionLabel>
        {t("pdfTextEditor.inspector.accessibility.heading", "Accessibility")}
      </SectionLabel>
      <StatRow
        label={t("pdfTextEditor.inspector.accessibility.tagLabel", "Tag")}
        value={<TagValue tag={tag} />}
      />
    </Section>
  );
}

function TagValue({ tag }: { tag: TextTag }) {
  const { t } = useTranslation();
  const testId = "pdf-editor-text-tag";
  if (tag.kind !== "tagged") {
    return <span data-testid={testId}>{statusText(t, tag)}</span>;
  }
  const { role, type } = tag.block;
  if (type === null) {
    return (
      <span data-testid={testId}>
        {t(
          "pdfTextEditor.inspector.accessibility.customTag",
          "{{role}} (custom tag)",
          { role },
        )}
      </span>
    );
  }
  return <span data-testid={testId}>{typeName(t, type)}</span>;
}

function statusText(
  t: TFunction,
  tag: Exclude<TextTag, { kind: "tagged" }>,
): string {
  switch (tag.kind) {
    case "artifact":
      return t(
        "pdfTextEditor.inspector.accessibility.artifactText",
        "Decorative",
      );
    case "untagged":
      return tag.documentTagged
        ? t("pdfTextEditor.inspector.accessibility.untaggedBadge", "Not tagged")
        : t(
            "pdfTextEditor.inspector.accessibility.untaggedDocument",
            "Document has no tags",
          );
    case "unknown":
      return t(
        "pdfTextEditor.inspector.accessibility.unknownTag",
        "Can't be read here",
      );
  }
}

/** The type's name for a reader; the type itself where it has no plain-language name. */
function typeName(t: TFunction, type: StructureType): string {
  switch (type) {
    case "Document":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.document",
        "Document",
      );
    case "DocumentFragment":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.documentFragment",
        "Document fragment",
      );
    case "Part":
      return t("pdfTextEditor.inspector.accessibility.tagName.part", "Part");
    case "Art":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.article",
        "Article",
      );
    case "Sect":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.section",
        "Section",
      );
    case "Div":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.division",
        "Division",
      );
    case "Aside":
      return t("pdfTextEditor.inspector.accessibility.tagName.aside", "Aside");
    case "BlockQuote":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.blockQuote",
        "Block quote",
      );
    case "Caption":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.caption",
        "Caption",
      );
    case "TOC":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.contents",
        "Table of contents",
      );
    case "TOCI":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.contentsEntry",
        "Contents entry",
      );
    case "Index":
      return t("pdfTextEditor.inspector.accessibility.tagName.index", "Index");
    case "Title":
      return t("pdfTextEditor.inspector.accessibility.tagName.title", "Title");
    case "FENote":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.footnote",
        "Footnote",
      );
    case "P":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.paragraph",
        "Paragraph",
      );
    case "H":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.heading",
        "Heading",
      );
    case "L":
      return t("pdfTextEditor.inspector.accessibility.tagName.list", "List");
    case "LI":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.listItem",
        "List item",
      );
    case "Lbl":
      return t("pdfTextEditor.inspector.accessibility.tagName.label", "Label");
    case "LBody":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.listItemBody",
        "List item body",
      );
    case "Table":
      return t("pdfTextEditor.inspector.accessibility.tagName.table", "Table");
    case "TR":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.tableRow",
        "Table row",
      );
    case "TH":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.tableHeader",
        "Table header",
      );
    case "TD":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.tableCell",
        "Table cell",
      );
    case "THead":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.tableHead",
        "Table head",
      );
    case "TBody":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.tableBody",
        "Table body",
      );
    case "TFoot":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.tableFoot",
        "Table foot",
      );
    case "Span":
      return t("pdfTextEditor.inspector.accessibility.tagName.span", "Span");
    case "Quote":
      return t("pdfTextEditor.inspector.accessibility.tagName.quote", "Quote");
    case "Note":
      return t("pdfTextEditor.inspector.accessibility.tagName.note", "Note");
    case "Reference":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.reference",
        "Reference",
      );
    case "BibEntry":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.bibliographyEntry",
        "Bibliography entry",
      );
    case "Code":
      return t("pdfTextEditor.inspector.accessibility.tagName.code", "Code");
    case "Link":
      return t("pdfTextEditor.inspector.accessibility.tagName.link", "Link");
    case "Annot":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.annotation",
        "Annotation",
      );
    case "Ruby":
      return t("pdfTextEditor.inspector.accessibility.tagName.ruby", "Ruby");
    case "RB":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.rubyBase",
        "Ruby base",
      );
    case "RT":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.rubyText",
        "Ruby text",
      );
    case "RP":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.rubyPunctuation",
        "Ruby punctuation",
      );
    case "Em":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.emphasis",
        "Emphasis",
      );
    case "Strong":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.strong",
        "Strong emphasis",
      );
    case "Figure":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.figure",
        "Figure",
      );
    case "Formula":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.formula",
        "Formula",
      );
    case "Form":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.form",
        "Form field",
      );
    case "Artifact":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.artifact",
        "Artifact",
      );
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return t(
        "pdfTextEditor.inspector.accessibility.tagName.headingLevel",
        "Heading {{level}}",
        { level: type.slice(1) },
      );
    case "NonStruct":
    case "Private":
    case "Sub":
    case "Warichu":
    case "WT":
    case "WP":
      return type;
  }
}
