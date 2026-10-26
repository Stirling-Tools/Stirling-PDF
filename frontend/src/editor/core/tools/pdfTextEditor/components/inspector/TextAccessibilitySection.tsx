import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Select } from "@editor/ui/Select";
import {
  Field,
  Section,
  SectionLabel,
  StatRow,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import { TEXT_BLOCK_TYPES } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type {
  StructureRole,
  StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

/** What the selected text is tagged as, and a picker to retag it where its block allows. */
export function TextAccessibilitySection({
  tag,
  onRetag,
}: {
  tag: TextTag;
  onRetag: (type: StructureType) => void;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.inspector.accessibility.tagLabel", "Tag");
  return (
    <Section testId="pdf-editor-text-accessibility">
      <SectionLabel>
        {t("pdfTextEditor.inspector.accessibility.heading", "Accessibility")}
      </SectionLabel>
      {tag.kind === "tagged" && tag.cannotRetag === null ? (
        <Field label={label}>
          <TagPicker block={tag.block} onRetag={onRetag} label={label} />
        </Field>
      ) : (
        <StatRow
          label={label}
          value={
            <span data-testid="pdf-editor-text-tag">{tagText(t, tag)}</span>
          }
        />
      )}
    </Section>
  );
}

function TagPicker({
  block,
  onRetag,
  label,
}: {
  block: StructureRole;
  onRetag: (type: StructureType) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const offered = TEXT_BLOCK_TYPES.find((type) => type === block.type) ?? null;
  return (
    <div data-testid="pdf-editor-text-tag-picker">
      <Select
        inputSize="sm"
        options={TEXT_BLOCK_TYPES.map((type) => ({
          value: type,
          label: typeName(t, type),
        }))}
        value={offered}
        // A tag the picker does not offer, such as a custom role, still shows.
        placeholder={blockName(t, block)}
        onChange={(value) => {
          const picked = TEXT_BLOCK_TYPES.find((type) => type === value);
          if (picked) onRetag(picked);
        }}
        aria-label={label}
      />
    </div>
  );
}

function tagText(t: TFunction, tag: TextTag): string {
  return tag.kind === "tagged" ? blockName(t, tag.block) : statusText(t, tag);
}

function blockName(t: TFunction, { role, type }: StructureRole): string {
  if (type !== null) return typeName(t, type);
  return t(
    "pdfTextEditor.inspector.accessibility.customTag",
    "{{role}} (custom tag)",
    { role },
  );
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
