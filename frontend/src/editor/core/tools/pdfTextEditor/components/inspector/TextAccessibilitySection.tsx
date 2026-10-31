import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Box, Group, Stack } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
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
import type {
  InnerTag,
  TextTag,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";
import type { InnerTagsControl } from "@editor/tools/pdfTextEditor/hooks/useTextAccessibility";
import "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection.css";

/**
 * What the selected text is tagged as, and a picker to change it: retagging
 * its block, or giving untagged text an element of its own. Beneath it, the
 * tags marking parts of the text, and a picker for characters selected in it.
 */
export function TextAccessibilitySection({
  tag,
  onSetTag,
  inner,
}: {
  tag: TextTag;
  onSetTag: (type: StructureType) => void;
  inner: InnerTagsControl;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.inspector.accessibility.tagLabel", "Tag");
  return (
    <Section testId="pdf-editor-text-accessibility">
      <SectionLabel>
        {t("pdfTextEditor.inspector.accessibility.heading", "Accessibility")}
      </SectionLabel>
      <Stack gap="xs">
        {pickable(tag) ? (
          <Field label={label}>
            <TagPicker
              types={TEXT_BLOCK_TYPES}
              current={tag.kind === "tagged" ? tag.block : null}
              placeholder={tagText(t, tag)}
              onSetTag={onSetTag}
              label={label}
              testId="pdf-editor-text-tag-picker"
            />
          </Field>
        ) : (
          <StatRow
            label={label}
            value={
              <span data-testid="pdf-editor-text-tag">{tagText(t, tag)}</span>
            }
          />
        )}
        <InnerTagList inner={inner} />
        <NewTagPicker inner={inner} />
      </Stack>
    </Section>
  );
}

/** The tags marking parts of the text, numbered in reading order; the one picked opens its controls. */
function InnerTagList({ inner }: { inner: InnerTagsControl }) {
  const { t } = useTranslation();
  if (inner.tags.length === 0) return null;
  return (
    <Field
      label={t(
        "pdfTextEditor.inspector.accessibility.innerTags",
        "Tags in this text",
      )}
    >
      <Stack gap={2} data-testid="pdf-editor-inner-tags">
        {inner.tags.map((innerTag, index) => (
          <InnerTagRow
            key={innerTag.key}
            number={index + 1}
            innerTag={innerTag}
            active={inner.active === index}
            onSelect={() => inner.onSelect(index)}
            onSet={(type) => inner.onSet(index, type)}
          />
        ))}
      </Stack>
    </Field>
  );
}

function InnerTagRow({
  number,
  innerTag,
  active,
  onSelect,
  onSet,
}: {
  number: number;
  innerTag: InnerTag;
  active: boolean;
  onSelect: () => void;
  onSet: (type: StructureType | null) => void;
}) {
  const text = innerTag.text.replace(/\s+/g, " ").trim();
  return (
    <div data-testid="pdf-editor-inner-tag">
      <button
        type="button"
        className="pdf-editor-inner-tag__entry"
        aria-pressed={active}
        onClick={onSelect}
      >
        <span className="pdf-editor-inner-tag__number">{number}</span>
        <span className="pdf-editor-inner-tag__text" title={text}>
          {text}
        </span>
      </button>
      {active && (
        <InnerTagControls number={number} innerTag={innerTag} onSet={onSet} />
      )}
    </div>
  );
}

function InnerTagControls({
  number,
  innerTag,
  onSet,
}: {
  number: number;
  innerTag: InnerTag;
  onSet: (type: StructureType | null) => void;
}) {
  const { t } = useTranslation();
  const removeLabel = t(
    "pdfTextEditor.inspector.accessibility.removeTag",
    "Remove tag",
  );
  return (
    <Group gap={4} wrap="nowrap" mt={4}>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <TagPicker
          types={innerTag.types}
          current={innerTag.role}
          placeholder={blockName(t, innerTag.role)}
          onSetTag={onSet}
          label={t(
            "pdfTextEditor.inspector.accessibility.innerTagLabel",
            "Tag {{number}}",
            { number },
          )}
          testId="pdf-editor-inner-tag-picker"
        />
      </Box>
      {innerTag.removable && (
        <ActionIcon
          variant="tertiary"
          size="sm"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={() => onSet(null)}
          data-testid="pdf-editor-inner-tag-remove"
        >
          <Icon name="trash" size={14} />
        </ActionIcon>
      )}
    </Group>
  );
}

/** A picker tagging the characters selected in the text, shown while some are. */
function NewTagPicker({ inner }: { inner: InnerTagsControl }) {
  const { t } = useTranslation();
  if (!inner.newTagTypes) return null;
  const label = t(
    "pdfTextEditor.inspector.accessibility.selectedText",
    "Selected text",
  );
  return (
    <Field label={label}>
      <TagPicker
        types={inner.newTagTypes}
        current={null}
        placeholder={t(
          "pdfTextEditor.inspector.accessibility.addTag",
          "Add tag",
        )}
        onSetTag={inner.onTagSelection}
        label={label}
        testId="pdf-editor-new-tag-picker"
      />
    </Field>
  );
}

function pickable(tag: TextTag): boolean {
  if (tag.kind === "tagged") return tag.cannotRetag === null;
  return tag.kind === "untagged" && tag.taggable;
}

function TagPicker({
  types,
  current,
  placeholder,
  onSetTag,
  label,
  testId,
}: {
  types: readonly StructureType[];
  /** Null for untagged text. */
  current: StructureRole | null;
  /** Shown when the current tag is not one the picker offers, such as a custom role. */
  placeholder: string;
  onSetTag: (type: StructureType) => void;
  label: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const offered = types.find((type) => type === current?.type) ?? null;
  return (
    <div data-testid={testId}>
      <Select
        disabled={types.length === 0}
        inputSize="sm"
        options={types.map((type) => ({
          value: type,
          label: typeName(t, type),
        }))}
        value={offered}
        placeholder={placeholder}
        onChange={(value) => {
          const picked = types.find((type) => type === value);
          if (picked) onSetTag(picked);
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
