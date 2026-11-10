import type { TFunction } from "i18next";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";

/**
 * Turns veraPDF's vocabulary into plain English: what a failing rule means, what it failed on and
 * where. It only rewords the report; nothing here changes what veraPDF found.
 */

/**
 * ISO 14289-1 rules as `<clause>-<test>`, mapped to their translation key. Covers the rules real
 * documents fail most; any other rule falls back to veraPDF's own requirement text.
 */
const UA1_RULE_KEYS: Record<string, string> = {
  "5-1": "noConformanceClaim",
  "6.2-1": "notMarkedTagged",
  "7.1-1": "artifactInsideTagged",
  "7.1-2": "taggedInsideArtifact",
  "7.1-3": "untaggedContent",
  "7.1-8": "noMetadataStream",
  "7.1-9": "noTitle",
  "7.1-10": "titleNotDisplayed",
  "7.1-11": "noTags",
  "7.2-2": "bookmarkLanguage",
  "7.2-24": "annotationLanguage",
  "7.2-30": "replacementTextLanguage",
  "7.2-33": "metadataLanguage",
  "7.2-34": "contentLanguage",
  "7.3-1": "figureNoAlt",
  "7.4.2-1": "headingSkipped",
  "7.18.1-1": "annotationNotTagged",
  "7.18.1-2": "annotationNoDescription",
  "7.18.3-1": "tabOrder",
  "7.18.4-1": "formFieldNotTagged",
  "7.18.5-1": "linkNotTagged",
  "7.18.5-2": "linkNoDescription",
  "7.21.4.1-1": "fontNotEmbedded",
  "7.21.4.1-2": "fontMissingGlyphs",
  "7.21.5-1": "glyphWidths",
  "7.21.6-3": "symbolicEncoding",
  "7.21.7-1": "noUnicode",
  "7.21.8-1": "notdefGlyph",
};

const RULE_DEFAULTS: Record<string, string> = {
  noConformanceClaim:
    "The file doesn't say it follows PDF/UA. Its metadata needs a PDF/UA identification entry.",
  notMarkedTagged:
    "The file isn't flagged as tagged, so assistive technology may ignore the tags it has.",
  artifactInsideTagged:
    "Something marked as decoration sits inside tagged content, so it is both read and skipped.",
  taggedInsideArtifact:
    "Tagged content sits inside something marked as decoration, so screen readers may skip it.",
  untaggedContent:
    "Something on the page is neither tagged as content nor marked as decoration, so screen readers can't tell whether to read it. This is often a background image, header, footer or page number.",
  noMetadataStream:
    "The file has no XMP metadata, where PDF/UA keeps the document's title and conformance details.",
  noTitle: "The document has no title in its metadata.",
  titleNotDisplayed:
    'PDF viewers will show the file name instead of the document\'s title. The file needs its "display document title" setting turned on.',
  noTags:
    "The file has no tags at all, so screen readers can't tell headings, paragraphs, lists or tables apart, or read them in the right order.",
  bookmarkLanguage:
    "The language of the bookmarks can't be worked out. Setting a language for the document fixes this.",
  annotationLanguage:
    "The language of comment or link text can't be worked out. Setting a language for the document fixes this.",
  replacementTextLanguage:
    "The language of some replacement text can't be worked out. Setting a language for the document fixes this.",
  metadataLanguage:
    "The language of the document's metadata, such as its title, can't be worked out. Setting a language for the document fixes this.",
  contentLanguage:
    "The language of the page text can't be worked out, so screen readers may pronounce it wrongly. Setting a language for the document fixes this.",
  figureNoAlt:
    "An image is tagged as a figure but has no description, so screen reader users won't know what it shows.",
  headingSkipped:
    "Heading levels skip a step, for example from Heading 1 straight to Heading 3, which makes navigating by headings confusing.",
  annotationNotTagged:
    "A comment or drawing isn't tagged as an annotation, so screen readers can't reach it in reading order.",
  annotationNoDescription:
    "A comment, link or drawing has no text description, so screen readers have nothing to announce.",
  tabOrder:
    "A page with links or comments doesn't set its tab order to follow the document, so keyboard users may jump around the page.",
  formFieldNotTagged:
    "A form field isn't tagged as part of a form, so screen readers may not find it.",
  linkNotTagged:
    "A link isn't tagged as a link, so screen readers won't announce it as one.",
  linkNoDescription:
    "A link has no description, so screen readers can only read out its address, or nothing.",
  fontNotEmbedded:
    "A font isn't included in the file, so the text may look different, or be read differently, on another computer.",
  fontMissingGlyphs:
    "An included font is missing some of the characters the document uses.",
  glyphWidths:
    "A font's character widths in the file don't match the font itself, so text may be spaced wrongly.",
  symbolicEncoding:
    "A symbol font carries an encoding it shouldn't, so its characters may come out as the wrong letters.",
  noUnicode:
    "Some characters can't be converted to readable text, so screen readers and copy and paste may get them wrong.",
  notdefGlyph:
    'The text uses a "missing character" placeholder, which shows as a blank or a box and can\'t be read aloud.',
};

const RULE_TITLE_DEFAULTS: Record<string, string> = {
  noConformanceClaim: "Doesn't declare PDF/UA",
  notMarkedTagged: "Not flagged as tagged",
  artifactInsideTagged: "Decoration inside tagged content",
  taggedInsideArtifact: "Tagged content hidden as decoration",
  untaggedContent: "Content that isn't tagged",
  noMetadataStream: "No XMP metadata",
  noTitle: "No document title",
  titleNotDisplayed: "Title isn't shown when opened",
  noTags: "No tags",
  bookmarkLanguage: "Bookmark language unknown",
  annotationLanguage: "Comment and link language unknown",
  replacementTextLanguage: "Replacement text language unknown",
  metadataLanguage: "Metadata language unknown",
  contentLanguage: "Text language unknown",
  figureNoAlt: "Image without a description",
  headingSkipped: "Heading level skipped",
  annotationNotTagged: "Comment or drawing not tagged",
  annotationNoDescription: "Comment, link or drawing without a description",
  tabOrder: "Tab order doesn't follow the document",
  formFieldNotTagged: "Form field not tagged",
  linkNotTagged: "Link not tagged",
  linkNoDescription: "Link without a description",
  fontNotEmbedded: "Font not embedded",
  fontMissingGlyphs: "Font missing characters",
  glyphWidths: "Font character widths don't match",
  symbolicEncoding: "Symbol font has the wrong encoding",
  noUnicode: "Characters that can't be read as text",
  notdefGlyph: "Missing-character placeholder used",
};

function knownRuleKey(issue: AccessibilityIssue): string | null {
  // The report names the profile ("PDF/UA-1"), not the ISO part; UA-2 numbers its clauses differently.
  if (issue.specification !== "PDF/UA-1") return null;
  return UA1_RULE_KEYS[`${issue.clause}-${issue.testNumber}`] ?? null;
}

/** A short plain-English name for the failing rule, or null when the rule is not one we know. */
export function ruleTitle(
  t: TFunction,
  issue: AccessibilityIssue,
): string | null {
  const key = knownRuleKey(issue);
  return key
    ? t(`checkAccessibility.ruleTitles.${key}`, RULE_TITLE_DEFAULTS[key])
    : null;
}

/** A plain-English account of what the failing rule means, or null when the rule is not one we know. */
export function explainRule(
  t: TFunction,
  issue: AccessibilityIssue,
): string | null {
  const key = knownRuleKey(issue);
  return key ? t(`checkAccessibility.rules.${key}`, RULE_DEFAULTS[key]) : null;
}

const OBJECT_KEYS: Record<string, string> = {
  CosDocument: "file",
  CosInfo: "properties",
  PDDocument: "document",
  PDPage: "page",
  PDMetadata: "metadata",
  MainXMPPackage: "metadata",
  XMPPackage: "metadata",
  XMPLangAlt: "translatedMetadata",
  PDOutline: "bookmark",
  PDStructTreeRoot: "tagTree",
  PDAcroForm: "form",
  PDFormField: "formField",
  PDWidgetAnnot: "formField",
  PDLinkAnnot: "link",
  PDInkAnnot: "drawing",
  Glyph: "character",
  SEMarkedContent: "markedContent",
  SESimpleContentItem: "contentPiece",
  SETextItem: "textPiece",
  SEFigure: "figure",
};

const OBJECT_DEFAULTS: Record<string, string> = {
  file: "The file itself",
  properties: "The document properties",
  document: "The document",
  page: "A page",
  metadata: "The document metadata",
  translatedMetadata: "A metadata entry with translations",
  bookmark: "A bookmark",
  tagTree: "The tag tree",
  form: "The form",
  formField: "A form field",
  link: "A link",
  drawing: "A drawing",
  annotation: "An annotation",
  font: "A font",
  character: "A character in a font",
  markedContent: "Marked page content",
  contentPiece: "A piece of page content",
  textPiece: "A piece of text",
  figure: "A figure",
  tag: "A {{name}} tag",
};

/** "SEFigure" → "A figure", "PDTrueTypeFont" → "A font"; unknown names are split into words. */
export function describeObject(t: TFunction, object: string): string {
  const key =
    OBJECT_KEYS[object] ??
    (/^PD\w*Font$/.test(object) ? "font" : undefined) ??
    (/^PD\w*Annot$/.test(object) ? "annotation" : undefined);
  if (key) return t(`checkAccessibility.objects.${key}`, OBJECT_DEFAULTS[key]);
  if (/^SE[A-Z]/.test(object)) {
    return t("checkAccessibility.objects.tag", OBJECT_DEFAULTS.tag, {
      name: object.slice(2),
    });
  }
  return splitWords(object.replace(/^(PD|Cos|SE)(?=[A-Z])/, ""));
}

interface Segment {
  name: string;
  index: number | null;
  detail: string | null;
}

/** veraPDF contexts nest object descriptions in parentheses that may themselves contain slashes. */
function splitPath(context: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of context) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "/" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.filter(Boolean);
}

function parseSegment(raw: string): Segment {
  const match = /^([A-Za-z]+)(?:\[(\d+)\])?(?:\((.*)\))?$/.exec(raw);
  if (!match) return { name: raw, index: null, detail: null };
  return {
    name: match[1],
    index: match[2] === undefined ? null : Number(match[2]),
    detail: match[3] ?? null,
  };
}

function splitWords(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const METADATA_PROPERTIES: Record<string, { key: string; fallback: string }> = {
  "dc:title": { key: "title", fallback: "Title" },
  "dc:description": { key: "description", fallback: "Description" },
  "dc:creator": { key: "author", fallback: "Author" },
  "pdfuaid:part": { key: "pdfUaPart", fallback: "PDF/UA part" },
};

function describeSegment(
  t: TFunction,
  segment: Segment,
  previous: Segment | null,
): string | null {
  const position = (segment.index ?? 0) + 1;
  const lastWord = segment.detail?.trim().split(/\s+/).pop() ?? "";
  switch (segment.name) {
    case "root":
    case "document":
    case "contentStream":
    case "XMPPackage":
      return null;
    case "pages":
      return t("checkAccessibility.where.page", "Page {{n}}", { n: position });
    case "content":
      return t("checkAccessibility.where.contentItem", "Content item {{n}}", {
        n: position,
      });
    case "contentItem":
      return previous?.name === "content" && position === 1
        ? null
        : t("checkAccessibility.where.piece", "Piece {{n}}", { n: position });
    case "operators":
      return t("checkAccessibility.where.drawingStep", "Drawing step {{n}}", {
        n: position,
      });
    case "xObject":
      return t("checkAccessibility.where.embeddedGraphic", "Embedded graphic");
    case "font":
      return t("checkAccessibility.where.font", "Font {{name}}", {
        name: segment.detail ?? "",
      });
    case "usedGlyphs":
      return t(
        "checkAccessibility.where.character",
        "A character in {{font}}",
        {
          font: (segment.detail?.split(/\s+/)[0] ?? "").replace(
            /^[A-Z]{6}\+/,
            "",
          ),
        },
      );
    case "annots":
      return t("checkAccessibility.where.annotation", "Annotation {{n}}", {
        n: position,
      });
    case "StructTreeRoot":
      return t("checkAccessibility.where.tagTree", "Tag tree");
    case "K":
      return t("checkAccessibility.where.tag", "{{tag}} tag", {
        tag: lastWord,
      });
    case "metadata":
      return t("checkAccessibility.where.metadata", "Document metadata");
    case "Properties": {
      const property = segment.detail?.split(" - ").pop()?.trim() ?? "";
      const known = METADATA_PROPERTIES[property];
      return known
        ? t(`checkAccessibility.where.properties.${known.key}`, known.fallback)
        : property;
    }
    case "Outlines":
      return t("checkAccessibility.where.bookmarks", "Bookmarks");
    default:
      return splitWords(segment.name);
  }
}

/**
 * The first place a rule failed, as a short trail such as "Page 3 › Annotation 2". Accepts both
 * veraPDF's bare context and its `Location [level=…, context=…]` wrapper.
 */
export function describeLocation(t: TFunction, location: string): string {
  const context = /context=(.*)\]\s*$/.exec(location)?.[1] ?? location;
  const segments = splitPath(context).map(parseSegment);
  const parts = segments
    .map((segment, i) => describeSegment(t, segment, segments[i - 1] ?? null))
    .filter((part): part is string => !!part);
  return parts.length > 0
    ? parts.join(" › ")
    : t("checkAccessibility.where.wholeDocument", "Whole document");
}
