import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  Box,
  Text,
  Textarea,
  Stack,
  Group,
  Tooltip,
  TextInput,
  Menu,
  Modal,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon, type IconName } from "@app/ui/Icon";
import { useAnnotation } from "@embedpdf/plugin-annotation/react";
import {
  getSidebarAnnotationsWithRepliesGroupedByPage,
  type SidebarAnnotationEntry,
} from "@embedpdf/plugin-annotation";
import {
  PdfAnnotationSubtype,
  PdfAnnotationReplyType,
  type PdfAnnotationObject,
  type PdfTextAnnoObject,
  type Rect,
} from "@embedpdf/models";
import { useCommentAuthor } from "@app/contexts/CommentAuthorContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useAnnotation as useAnnotationContext } from "@app/contexts/AnnotationContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { compareEntriesByVisualOrder } from "@app/components/viewer/commentsSidebarOrder";
import { SidebarBase } from "@app/components/viewer/SidebarBase";

/** PDF subtypes that are inherently standalone comment annotations (not linked to other annotations). */
const STANDALONE_COMMENT_SUBTYPES = new Set([
  PdfAnnotationSubtype.TEXT,
  PdfAnnotationSubtype.FREETEXT,
  PdfAnnotationSubtype.CARET,
]);

function isStandaloneCommentType(type: number | undefined): boolean {
  return (
    type !== undefined &&
    STANDALONE_COMMENT_SUBTYPES.has(type as PdfAnnotationSubtype)
  );
}

const ANNOTATE_PANEL_ID = "annotate" as const;
const TEXT_COMMENT_TOOL_ID = "textComment" as const;

type StirlingAnnotationCustomData = Record<string, unknown> & {
  annotationToolId?: string;
  isComment?: boolean;
  modifiedDate?: Date | number | string;
  toolId?: string;
};

type StirlingAnnotationMetadata = {
  creationDate?: Date | number | string;
  customData?: StirlingAnnotationCustomData;
  M?: Date | number | string;
  modifiedDate?: Date | number | string;
};

type StirlingAnnotationPatch = Partial<PdfAnnotationObject> & {
  customData?: Record<string, unknown>;
};

function getStirlingAnnotationMetadata(
  ann: PdfAnnotationObject,
): StirlingAnnotationMetadata {
  return ann as StirlingAnnotationMetadata;
}

/** Format annotation date for display (e.g. "Mar 11, 6:05 PM"). */
function formatCommentDate(obj: PdfAnnotationObject): string {
  const metadata = getStirlingAnnotationMetadata(obj);
  const raw =
    metadata.modifiedDate ??
    metadata.creationDate ??
    metadata.customData?.modifiedDate ??
    metadata.M;
  if (raw == null) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface CommentsSidebarProps {
  documentId: string;
  visible: boolean;
  rightOffset: string;
}

function getCommentDisplayContent(entry: {
  annotation: { object: Pick<PdfAnnotationObject, "contents"> };
  replies: Array<{ object: Pick<PdfAnnotationObject, "contents"> }>;
}): string {
  const main = entry.annotation?.object?.contents;
  if (main != null && String(main).trim()) return String(main).trim();
  const firstReply = entry.replies?.[0]?.object?.contents;
  if (firstReply != null && String(firstReply).trim())
    return String(firstReply).trim();
  return "";
}

/** Placeholder authors we never show; use current user's name from context instead. */
const PLACEHOLDER_AUTHORS = new Set(["Guest", "Digital Signature", ""]);
function getAuthorName(
  obj: Pick<PdfAnnotationObject, "author">,
  currentDisplayName: string,
): string {
  const stored = (obj?.author ?? "Guest").trim() || "Guest";
  if (PLACEHOLDER_AUTHORS.has(stored)) return currentDisplayName || "Guest";
  return stored;
}

/** Replies store an explicit author; only allow edit when it matches the current comment author name. */
function isReplyAuthoredByCurrentUser(
  obj: Pick<PdfAnnotationObject, "author">,
  currentDisplayName: string,
): boolean {
  const stored = (obj?.author ?? "").trim() || "Guest";
  // Resolve current user the same way getAuthorName does
  const resolvedMine = PLACEHOLDER_AUTHORS.has(
    (currentDisplayName ?? "").trim(),
  )
    ? "Guest"
    : (currentDisplayName ?? "").trim();
  const resolvedStored = PLACEHOLDER_AUTHORS.has(stored) ? "Guest" : stored;
  // Both are guest/anonymous → same unauthenticated user, allow editing
  if (resolvedStored === "Guest" && resolvedMine === "Guest") return true;
  if (!resolvedMine) return false;
  return resolvedStored === resolvedMine;
}

// Map toolId → registry icon name (matches AnnotationPanel icon definitions)
const TOOL_ICON_MAP: Record<string, IconName> = {
  highlight: "highlighter",
  underline: "underline",
  strikeout: "strikethrough",
  squiggly: "polyline",
  ink: "pencil",
  inkHighlighter: "brush",
  square: "square",
  circle: "circle",
  line: "polyline",
  lineArrow: "polyline",
  polyline: "polyline",
  polygon: "triangle",
  text: "type",
  note: "sticky-note",
  stamp: "image-plus",
  textComment: "message-square",
  insertText: "message-square-plus",
  replaceText: "replace",
};

// Type-based fallback icon when no toolId is present
function getIconByType(type: number | undefined): IconName {
  if (type === 1) return "message-square";
  if (type === 3) return "sticky-note";
  if (type === 4 || type === 8) return "polyline";
  if (type === 5) return "square";
  if (type === 6) return "circle";
  if (type === 7 || type === 8) return "triangle";
  if (type === 9) return "highlighter";
  if (type === 10) return "underline";
  if (type === 11) return "polyline";
  if (type === 12) return "strikethrough";
  if (type === 13) return "image-plus";
  if (type === 14) return "message-square-plus";
  if (type === 15) return "pencil";
  return "message-square";
}
function isCommentAnnotation(ann: PdfAnnotationObject): boolean {
  const customData = getStirlingAnnotationMetadata(ann).customData;
  const toolId = customData?.toolId ?? customData?.annotationToolId;
  if (
    toolId === "textComment" ||
    toolId === "insertText" ||
    toolId === "replaceText"
  )
    return true;
  // Any annotation explicitly added to comments via the "Add comment" button
  if (customData?.isComment === true) return true;
  const type = ann?.type;
  // Standalone comment types (TEXT, FREETEXT, CARET) without a toolId are always comments
  if (!toolId && isStandaloneCommentType(type)) return true;
  // Non-standalone annotations with non-empty contents: customData (including isComment and
  // toolId) is NOT persisted to PDF, but `contents` is a standard PDF field and survives
  // save/reload. Exclude standalone comment types (TEXT, FREETEXT, CARET) which use
  // `contents` for their own annotation text. Exclude replies.
  if (
    type !== undefined &&
    !isStandaloneCommentType(type) &&
    !ann?.inReplyToId &&
    (ann?.contents ?? "").trim().length > 0
  )
    return true;
  return false;
}

function isLinkedCommentAnnotation(ann: PdfAnnotationObject): boolean {
  const customData = getStirlingAnnotationMetadata(ann).customData;
  const type = ann?.type;
  if (isStandaloneCommentType(type)) return false;
  if (ann?.inReplyToId) return false;
  return (
    customData?.isComment === true ||
    (type !== undefined && (ann?.contents ?? "").trim().length > 0)
  );
}

function getAnnotationPageIndex(
  fallbackPageIndex: number,
  ann: PdfAnnotationObject,
): number {
  return typeof ann?.pageIndex === "number" ? ann.pageIndex : fallbackPageIndex;
}

function getRemoveCommentPatch(
  ann: PdfAnnotationObject,
): StirlingAnnotationPatch {
  const customData = {
    ...(getStirlingAnnotationMetadata(ann).customData ?? {}),
  };
  delete customData.isComment;
  return {
    customData,
    contents: "",
  };
}

function getAnnotationToolId(ann: PdfAnnotationObject): string {
  const customData = getStirlingAnnotationMetadata(ann).customData;
  return customData?.toolId ?? customData?.annotationToolId ?? "";
}
function getAnnotationTypeLabel(
  ann: PdfAnnotationObject,
  t: (key: string, fallback: string) => string,
): string {
  const toolId = getAnnotationToolId(ann);
  const labels: Record<string, string> = {
    highlight: t("annotation.highlight", "Highlight"),
    underline: t("annotation.underline", "Underline"),
    strikeout: t("annotation.strikeout", "Strikeout"),
    squiggly: t("annotation.squiggly", "Squiggly"),
    ink: t("annotation.pen", "Pen"),
    inkHighlighter: t("annotation.freehandHighlighter", "Freehand Highlighter"),
    square: t("annotation.square", "Square"),
    circle: t("annotation.circle", "Circle"),
    line: t("annotation.line", "Line"),
    lineArrow: t("annotation.lineArrow", "Arrow"),
    polyline: t("annotation.polyline", "Polyline"),
    polygon: t("annotation.polygon", "Polygon"),
    text: t("annotation.text", "Text box"),
    note: t("annotation.note", "Note"),
    stamp: t("annotation.stamp", "Stamp"),
    textComment: t("viewer.comments.typeComment", "Comment"),
    insertText: t("viewer.comments.typeInsertText", "Insert Text"),
    replaceText: t("viewer.comments.typeReplaceText", "Replace Text"),
  };
  if (labels[toolId]) return labels[toolId];
  // Type-based fallback (mirrors getIconByType) for annotations without customData.toolId
  const type = ann?.type;
  if (type === 14) return t("viewer.comments.typeInsertText", "Insert Text");
  if (type === 1) return t("viewer.comments.typeComment", "Comment");
  return t("viewer.comments.typeComment", "Comment");
}
function AnnotationTypeIcon({ ann }: { ann: PdfAnnotationObject }) {
  const toolId = getAnnotationToolId(ann);
  const iconName = TOOL_ICON_MAP[toolId] ?? getIconByType(ann?.type);
  return (
    <Icon
      name={iconName}
      size="1.25rem"
      style={{ flexShrink: 0, color: "var(--c-accent-text)" }}
    />
  );
}

function MoreActionsMenu({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Menu position="bottom-end" withArrow>
      <Menu.Target>
        <Tooltip label={t("viewer.comments.moreActions", "More actions")}>
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="sm"
            aria-label={t("viewer.comments.moreActions", "More actions")}
          >
            <Icon name="ellipsis" size={20} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

interface CommentsHeaderActionsProps {
  readerMode: boolean;
  onAdd: () => void;
  onClearAll: () => void;
}

function CommentsHeaderActions({
  readerMode,
  onAdd,
  onClearAll,
}: CommentsHeaderActionsProps) {
  const { t } = useTranslation();
  return (
    <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
      {/* Placing a comment arms the annotate tool, which only exists in the
          editor: offering it here would take the reader there mid-sentence.
          Reading shows the comments that are there and leaves it at that. */}
      {!readerMode && (
        <Tooltip label={t("viewer.comments.addComment", "Add comment")}>
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="sm"
            aria-label={t("viewer.comments.addComment", "Add comment")}
            onClick={onAdd}
          >
            <Icon name="plus" size="1.25rem" />
          </ActionIcon>
        </Tooltip>
      )}
      <MoreActionsMenu>
        <Menu.Item
          leftSection={<Icon name="trash" size={18} />}
          color="red"
          onClick={onClearAll}
        >
          {t("viewer.comments.clearAll", "Clear all comments")}
        </Menu.Item>
      </MoreActionsMenu>
    </Group>
  );
}

interface AddCommentButtonProps {
  isPlacing: boolean;
  readerMode: boolean;
  onAdd: () => void;
  onCancel: () => void;
  /** Full width and left-aligned, for the top of the comment list. */
  block?: boolean;
}

function AddCommentButton({
  isPlacing,
  readerMode,
  onAdd,
  onCancel,
  block = false,
}: AddCommentButtonProps) {
  const { t } = useTranslation();
  const iconSize = block ? "0.9rem" : "1rem";
  const layout = block ? ({ fullWidth: true, justify: "start" } as const) : {};

  if (isPlacing) {
    return (
      <Button
        variant="tertiary"
        accent="warning"
        size="sm"
        {...layout}
        onClick={onCancel}
        leftSection={<Icon name="pointer" size={iconSize} />}
        style={block ? { paddingInline: 6 } : undefined}
      >
        {t("viewer.comments.placingHint", "Click a page to place… (cancel)")}
      </Button>
    );
  }
  if (readerMode) return null;
  return (
    <Button
      variant="tertiary"
      size="sm"
      {...layout}
      onClick={onAdd}
      leftSection={<Icon name="plus" size={iconSize} />}
      style={
        block
          ? { paddingInline: 6, marginBottom: "var(--space-xs)" }
          : undefined
      }
    >
      {t("viewer.comments.addComment", "Add comment")}
    </Button>
  );
}

function CommentsEmptyState({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Stack align="center" gap="sm" py="lg">
      <Icon
        name="message-square"
        size="2rem"
        style={{ color: "var(--mantine-color-dimmed)" }}
      />
      <Text size="sm" c="dimmed" ta="center">
        {t(
          "viewer.comments.hint",
          "Place comments with the Comment, Insert Text, or Replace Text tools. They will appear here by page.",
        )}
      </Text>
      {children}
    </Stack>
  );
}

interface CommentPageGroupProps {
  pageIndex: number;
  count: number;
  children: ReactNode;
}

function CommentPageGroup({
  pageIndex,
  count,
  children,
}: CommentPageGroupProps) {
  const { t } = useTranslation();
  return (
    <Box mb="md">
      <Text size="sm" fw={700} mb={2}>
        {t("viewer.comments.pageLabel", "Page {{page}}", {
          page: pageIndex + 1,
        })}
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        {t("viewer.comments.nComments", "{{count}} comments", { count })}
      </Text>
      <Box
        mb="xs"
        style={{ borderBottom: "1px solid var(--c-border-subtle)" }}
      />
      <Stack gap="sm">{children}</Stack>
    </Box>
  );
}

interface CommentCardHeaderProps {
  ann: PdfAnnotationObject;
  authorName: string;
  typeLabel: string;
  timestamp: string;
  onLocate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function CommentCardHeader({
  ann,
  authorName,
  typeLabel,
  timestamp,
  onLocate,
  onEdit,
  onDelete,
}: CommentCardHeaderProps) {
  const { t } = useTranslation();
  return (
    <Group
      wrap="nowrap"
      gap="xs"
      justify="space-between"
      align="flex-start"
      mb="xs"
    >
      <Group wrap="nowrap" gap="xs" style={{ minWidth: 0, flex: 1 }}>
        <AnnotationTypeIcon ann={ann} />
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600}>
            {authorName}
          </Text>
          <Text size="xs" c="dimmed">
            {typeLabel}
            {timestamp ? ` · ${timestamp}` : ""}
          </Text>
        </Box>
      </Group>
      <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
        <Tooltip
          label={t("viewer.comments.locateAnnotation", "Locate in document")}
        >
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="sm"
            aria-label={t(
              "viewer.comments.locateAnnotation",
              "Locate in document",
            )}
            onClick={onLocate}
          >
            <Icon name="eye" size={16} />
          </ActionIcon>
        </Tooltip>
        <MoreActionsMenu>
          <Menu.Item
            leftSection={<Icon name="pencil" size={18} />}
            onClick={onEdit}
          >
            {t("annotation.editText", "Edit")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" size={18} />}
            color="red"
            onClick={onDelete}
          >
            {t("annotation.delete", "Delete")}
          </Menu.Item>
        </MoreActionsMenu>
      </Group>
    </Group>
  );
}

interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function CommentComposer({ value, onChange, onSubmit }: CommentComposerProps) {
  const { t } = useTranslation();
  const canSubmit = value.trim().length > 0;
  return (
    <Group gap="xs" wrap="nowrap" align="flex-end">
      <Textarea
        placeholder={t(
          "viewer.comments.addCommentPlaceholder",
          "Add comment...",
        )}
        size="sm"
        autosize
        minRows={1}
        maxRows={6}
        value={value}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onChange={(e) => onChange((e?.currentTarget ?? e?.target)?.value ?? "")}
        style={{ flex: 1, minWidth: 0 }}
        styles={{ input: { borderColor: "var(--mantine-color-blue-3)" } }}
        autoFocus
      />
      <Tooltip label={t("viewer.comments.addComment", "Add comment")}>
        <ActionIcon
          variant="primary"
          size="md"
          aria-label={t("viewer.comments.addComment", "Add comment")}
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ height: "36px", width: "36px", flexShrink: 0 }}
        >
          <Icon name="check" size={18} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

interface ReplyEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function ReplyEditor({ value, onChange, onSave }: ReplyEditorProps) {
  const { t } = useTranslation();
  return (
    <>
      <Textarea
        minRows={2}
        autosize
        value={value}
        onChange={(e) => onChange((e?.currentTarget ?? e?.target)?.value ?? "")}
        styles={{ root: { width: "100%" } }}
        mb="xs"
      />
      <Group gap={4} wrap="nowrap" justify="flex-end">
        <Tooltip label={t("viewer.comments.saveReply", "Save reply")}>
          <ActionIcon
            variant="primary"
            size="sm"
            aria-label={t("viewer.comments.saveReply", "Save reply")}
            onClick={onSave}
            disabled={!value.trim()}
          >
            <Icon name="check" size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </>
  );
}

interface CommentReplyProps {
  reply: SidebarAnnotationEntry["replies"][number];
  displayName: string;
  /** The text being edited, or null when the reply is not being edited. */
  editDraft: string | null;
  onStartEditing: () => void;
  onEditChange: (value: string) => void;
  onSave: (text: string) => void;
}

function CommentReply({
  reply,
  displayName,
  editDraft,
  onStartEditing,
  onEditChange,
  onSave,
}: CommentReplyProps) {
  const { t } = useTranslation();
  const rObj = reply.object;
  const author = getAuthorName(rObj, displayName);
  const timestamp = formatCommentDate(rObj);
  const canEdit = isReplyAuthoredByCurrentUser(rObj, displayName);

  return (
    <Box
      pl="xs"
      style={{ borderLeft: "2px solid var(--mantine-color-blue-3)" }}
    >
      <Box style={{ minWidth: 0 }}>
        <Group
          wrap="nowrap"
          justify="space-between"
          align="flex-start"
          gap={4}
          mb={2}
        >
          <Text size="sm" fw={600}>
            {author}
          </Text>
          <Group wrap="nowrap" gap="xs" align="center">
            {canEdit && editDraft === null ? (
              <Button
                variant="tertiary"
                hover={false}
                type="button"
                onClick={onStartEditing}
              >
                <Text size="xs" c="var(--c-accent-text)">
                  {t("annotation.editText", "Edit")}
                </Text>
              </Button>
            ) : null}
            {timestamp ? (
              <Text size="xs" c="dimmed">
                {timestamp}
              </Text>
            ) : null}
          </Group>
        </Group>
        {editDraft !== null ? (
          <ReplyEditor
            value={editDraft}
            onChange={onEditChange}
            onSave={() => onSave(editDraft)}
          />
        ) : (
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {rObj?.contents ?? ""}
          </Text>
        )}
      </Box>
    </Box>
  );
}

interface ReplyComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function ReplyComposer({ value, onChange, onSubmit }: ReplyComposerProps) {
  const { t } = useTranslation();
  const canSubmit = value.trim().length > 0;
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <TextInput
        placeholder={t("viewer.comments.addReplyPlaceholder", "Add reply...")}
        size="sm"
        value={value}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onChange={(e) => onChange((e?.currentTarget ?? e?.target)?.value ?? "")}
        style={{ flex: 1, minWidth: 0 }}
        styles={{
          input: {
            borderColor: "var(--mantine-color-blue-3)",
            height: "36px",
            minHeight: "36px",
          },
        }}
      />
      <Tooltip label={t("viewer.comments.addComment", "Add comment")}>
        <ActionIcon
          variant="primary"
          size="md"
          aria-label={t("viewer.comments.addComment", "Add comment")}
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ height: "36px", width: "36px", flexShrink: 0 }}
        >
          <Icon name="check" size={20} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/** A reply being edited. Only one reply in the sidebar is edited at a time. */
interface EditingReply {
  /** `${pageIndex}_${annotationId}` of the card the reply belongs to. */
  cardKey: string;
  replyId: string;
  draft: string;
}

interface CommentActions {
  locate: (pageIndex: number, ann: PdfAnnotationObject) => void;
  requestDelete: (
    pageIndex: number,
    annotationId: string,
    ann: PdfAnnotationObject,
  ) => void;
  startEditing: (pageIndex: number, annotationId: string) => void;
  changeDraft: (pageIndex: number, annotationId: string, value: string) => void;
  submit: (pageIndex: number, annotationId: string, value: string) => void;
  changeReplyDraft: (
    pageIndex: number,
    parentId: string,
    value: string,
  ) => void;
  sendReply: (
    pageIndex: number,
    parentId: string,
    parentRect: Rect | undefined,
  ) => void;
  startEditingReply: (
    pageIndex: number,
    parentId: string,
    replyId: string,
    contents: string,
  ) => void;
  changeReplyEdit: (value: string) => void;
  saveReplyEdit: (pageIndex: number, replyId: string, value: string) => void;
}

interface CommentRepliesProps {
  pageIndex: number;
  parentId: string;
  replies: SidebarAnnotationEntry["replies"];
  displayName: string;
  editingReply: EditingReply | null;
  actions: CommentActions;
}

function CommentReplies({
  pageIndex,
  parentId,
  replies,
  displayName,
  editingReply,
  actions,
}: CommentRepliesProps) {
  if (replies.length === 0) return null;
  return (
    <Stack gap="sm" mb="sm">
      {replies
        .filter((reply) => reply?.object?.id)
        .map((reply) => (
          <CommentReply
            key={reply.object.id}
            reply={reply}
            displayName={displayName}
            editDraft={
              editingReply?.replyId === reply.object.id
                ? editingReply.draft
                : null
            }
            onStartEditing={() =>
              actions.startEditingReply(
                pageIndex,
                parentId,
                reply.object.id,
                String(reply.object.contents ?? ""),
              )
            }
            onEditChange={actions.changeReplyEdit}
            onSave={(value) =>
              actions.saveReplyEdit(pageIndex, reply.object.id, value)
            }
          />
        ))}
    </Stack>
  );
}

interface CommentThreadProps {
  pageIndex: number;
  entry: SidebarAnnotationEntry;
  content: string;
  displayName: string;
  replyDraft: string;
  editingReply: EditingReply | null;
  actions: CommentActions;
}

function CommentThread({
  pageIndex,
  entry,
  content,
  displayName,
  replyDraft,
  editingReply,
  actions,
}: CommentThreadProps) {
  const ann = entry.annotation.object;
  return (
    <>
      <Text size="sm" mb="sm" style={{ whiteSpace: "pre-wrap" }}>
        {content}
      </Text>
      <CommentReplies
        pageIndex={pageIndex}
        parentId={ann.id}
        replies={entry.replies}
        displayName={displayName}
        editingReply={editingReply}
        actions={actions}
      />
      <ReplyComposer
        value={replyDraft}
        onChange={(value) => actions.changeReplyDraft(pageIndex, ann.id, value)}
        onSubmit={() => actions.sendReply(pageIndex, ann.id, ann.rect)}
      />
    </>
  );
}

interface CommentCardProps {
  pageIndex: number;
  entry: SidebarAnnotationEntry;
  selected: boolean;
  displayName: string;
  /** Text typed but not yet sent; undefined shows the posted content. */
  draft: string | undefined;
  isEditing: boolean;
  replyDraft: string;
  /** Set only when the reply being edited belongs to this card. */
  editingReply: EditingReply | null;
  actions: CommentActions;
}

function CommentCard({
  pageIndex,
  entry,
  selected,
  displayName,
  draft,
  isEditing,
  replyDraft,
  editingReply,
  actions,
}: CommentCardProps) {
  const { t } = useTranslation();
  const ann = entry.annotation.object;
  const id = ann.id;
  const displayContent = getCommentDisplayContent(entry);
  const text = draft !== undefined ? draft : displayContent;
  /** Only treat as "comment posted" when annotation actually has content (user clicked Send), not on every keystroke. */
  const hasMainContent = displayContent.trim().length > 0;

  return (
    <Box
      data-comment-card={`${pageIndex}_${id}`}
      p="sm"
      style={{
        border: selected
          ? "1px solid var(--mantine-color-blue-3)"
          : "1px solid var(--c-border-subtle)",
        borderRadius: 8,
        backgroundColor: "var(--c-surface-raised)",
      }}
    >
      <CommentCardHeader
        ann={ann}
        authorName={getAuthorName(ann, displayName)}
        typeLabel={getAnnotationTypeLabel(ann, t)}
        timestamp={formatCommentDate(ann)}
        onLocate={() => actions.locate(pageIndex, ann)}
        onEdit={() => actions.startEditing(pageIndex, id)}
        onDelete={() => actions.requestDelete(pageIndex, id, ann)}
      />

      {!hasMainContent || isEditing ? (
        <CommentComposer
          value={text}
          onChange={(value) => actions.changeDraft(pageIndex, id, value)}
          onSubmit={() => actions.submit(pageIndex, id, text)}
        />
      ) : (
        <CommentThread
          pageIndex={pageIndex}
          entry={entry}
          content={displayContent}
          displayName={displayName}
          replyDraft={replyDraft}
          editingReply={editingReply}
          actions={actions}
        />
      )}
    </Box>
  );
}

interface DeleteLinkedCommentModalProps {
  opened: boolean;
  onClose: () => void;
  onRemoveComment: () => void;
  onDeleteAnnotation: () => void;
}

function DeleteLinkedCommentModal({
  opened,
  onClose,
  onRemoveComment,
  onDeleteAnnotation,
}: DeleteLinkedCommentModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t(
        "viewer.comments.deleteTitle",
        "Remove annotation from comments?",
      )}
      centered
      size="sm"
    >
      <Text size="sm" c="dimmed" mb="lg">
        {t(
          "viewer.comments.deleteDescription",
          "This annotation has a comment attached. You can remove just the comment from the sidebar while keeping the annotation, or delete everything.",
        )}
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="secondary" onClick={onRemoveComment}>
          {t("viewer.comments.removeCommentOnly", "Remove comment only")}
        </Button>
        <Button accent="danger" onClick={onDeleteAnnotation}>
          {t(
            "viewer.comments.deleteAnnotationAndComment",
            "Delete annotation & comment",
          )}
        </Button>
      </Group>
    </Modal>
  );
}

interface ClearAllCommentsModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function ClearAllCommentsModal({
  opened,
  onClose,
  onConfirm,
}: ClearAllCommentsModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("viewer.comments.clearAllTitle", "Clear all comments?")}
      centered
      size="sm"
    >
      <Text size="sm" c="dimmed" mb="lg">
        {t(
          "viewer.comments.clearAllDescription",
          "This removes comments and replies from the sidebar while keeping any attached annotations in the document.",
        )}
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="secondary" onClick={onClose}>
          {t("viewer.comments.cancelClearAll", "Cancel")}
        </Button>
        <Button accent="danger" onClick={onConfirm}>
          {t("viewer.comments.clearAll", "Clear all comments")}
        </Button>
      </Group>
    </Modal>
  );
}

export function CommentsSidebar({
  documentId,
  visible,
  rightOffset,
}: CommentsSidebarProps) {
  const { t } = useTranslation();
  const { displayName } = useCommentAuthor();
  const {
    highlightCommentRequest,
    clearHighlightCommentRequest,
    scrollActions,
    getZoomState,
    toggleCommentsSidebar,
  } = useViewer() ?? {};
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const { state, provides } = useAnnotation(documentId);
  const { handleToolSelectForced, readerMode } = useToolWorkflow();
  const { actions: navActions } = useNavigationActions();
  const {
    activateAnnotationToolRef,
    activeAnnotationToolId,
    setActiveAnnotationToolId,
  } = useAnnotationContext();
  const isPlacingComment = activeAnnotationToolId === TEXT_COMMENT_TOOL_ID;
  const [draftContents, setDraftContents] = useState<Record<string, string>>(
    {},
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  /** When set, this card's main comment is in edit mode (show textarea for main comment). */
  const [editingMainKey, setEditingMainKey] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<EditingReply | null>(null);

  // React to request to focus or highlight a comment card (e.g. from "Add comment" / "View comment" in selection menu)
  useEffect(() => {
    if (
      !visible ||
      !highlightCommentRequest ||
      highlightCommentRequest.documentId !== documentId
    )
      return;
    const { pageIndex, annotationId, action } = highlightCommentRequest;
    const cardKey = `${pageIndex}_${annotationId}`;
    const root = scrollViewportRef.current;
    if (!root) return;
    const card = root.querySelector<HTMLElement>(
      `[data-comment-card="${cardKey}"]`,
    );
    if (!card) {
      clearHighlightCommentRequest?.();
      return;
    }
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    if (action === "highlight") {
      card.classList.remove("comment-card-flash-highlight");
      void card.offsetWidth;
      card.classList.add("comment-card-flash-highlight");
      const tId = window.setTimeout(() => {
        card.classList.remove("comment-card-flash-highlight");
        clearHighlightCommentRequest?.();
      }, 1500);
      return () => window.clearTimeout(tId);
    }
    // action === 'focus': focus the first textarea or reply input in the card
    const input = card.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      "textarea, input",
    );
    if (input) {
      requestAnimationFrame(() => {
        input.focus();
      });
    }
    clearHighlightCommentRequest?.();
  }, [
    visible,
    highlightCommentRequest,
    documentId,
    clearHighlightCommentRequest,
  ]);

  const handleLocateAnnotation = useCallback(
    (pageIndex: number, ann: PdfAnnotationObject) => {
      scrollActions?.scrollToPage(pageIndex + 1, "smooth");
      setTimeout(() => {
        const pageEl = document.querySelector<HTMLElement>(
          `[data-page-index="${pageIndex}"]`,
        );
        if (!pageEl || !ann?.rect) return;
        const zoom = getZoomState?.()?.currentZoom ?? 1;
        const { origin, size } = ann.rect as {
          origin: { x: number; y: number };
          size: { width: number; height: number };
        };
        const flashEl = document.createElement("div");
        // Append to page element so it scrolls with the page (position: absolute relative to page)
        flashEl.style.cssText = `
        position: absolute;
        left: ${origin.x * zoom}px;
        top: ${origin.y * zoom}px;
        width: ${size.width * zoom}px;
        height: ${size.height * zoom}px;
        background: rgba(255, 213, 0, 0.55);
        border: 2px solid rgba(255, 170, 0, 0.8);
        border-radius: 3px;
        pointer-events: none;
        z-index: 9998;
        animation: annotation-locate-flash 1.6s ease-out forwards;
      `;
        if (!document.getElementById("annotation-locate-flash-style")) {
          const style = document.createElement("style");
          style.id = "annotation-locate-flash-style";
          style.textContent = `@keyframes annotation-locate-flash {
          0%   { opacity: 0; transform: scale(1.08); }
          15%  { opacity: 1; transform: scale(1); }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }`;
          document.head.appendChild(style);
        }
        pageEl.appendChild(flashEl);
        setTimeout(() => flashEl.remove(), 1700);
      }, 550);
    },
    [scrollActions, getZoomState],
  );

  const byPage = useMemo<Record<number, SidebarAnnotationEntry[]>>(() => {
    try {
      const all = getSidebarAnnotationsWithRepliesGroupedByPage(state) ?? {};
      const filtered: Record<number, SidebarAnnotationEntry[]> = {};
      for (const [page, entries] of Object.entries(all)) {
        const commentEntries = entries
          .filter((e) => isCommentAnnotation(e.annotation.object))
          .sort(compareEntriesByVisualOrder);
        if (commentEntries.length > 0) {
          filtered[Number(page)] = commentEntries;
        }
      }
      return filtered;
    } catch {
      return {};
    }
  }, [state]);

  // Derive the set of selected annotation IDs from EmbedPDF's selection state.
  // state is AnnotationDocumentState — selectedUids are keys in byUid, and may equal id.
  const selectedAnnotationIds = useMemo(() => {
    const selectedUids: string[] = state?.selectedUids ?? [];
    const ids = new Set<string>();
    for (const uid of selectedUids) {
      // uid itself may be the annotation id
      ids.add(uid);
      const annId = state.byUid[uid]?.object.id;
      if (annId) ids.add(annId);
    }
    return ids;
  }, [state]);

  const [searchTerm, setSearchTerm] = useState("");

  const filteredByPage = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return byPage;
    }
    const result: Record<number, SidebarAnnotationEntry[]> = {};
    for (const [pageStr, entries] of Object.entries(byPage)) {
      const matching = entries.filter((entry) => {
        const ann = entry.annotation.object;
        const contents = (ann.contents || "").toLowerCase();
        const author = (ann.author || "").toLowerCase();
        const replies = entry.replies || [];
        const replyMatch = replies.some(
          (r) =>
            (r.object.contents || "").toLowerCase().includes(query) ||
            (r.object.author || "").toLowerCase().includes(query),
        );
        return contents.includes(query) || author.includes(query) || replyMatch;
      });
      if (matching.length > 0) {
        result[Number(pageStr)] = matching;
      }
    }
    return result;
  }, [byPage, searchTerm]);

  const pageNumbers = useMemo(
    () =>
      Object.keys(filteredByPage)
        .map(Number)
        .sort((a, b) => a - b),
    [filteredByPage],
  );

  const totalCount = useMemo(
    () =>
      Object.keys(byPage)
        .map(Number)
        .reduce((sum, p) => sum + (byPage[p]?.length ?? 0), 0),
    [byPage],
  );

  const totalFilteredCount = useMemo(
    () =>
      pageNumbers.reduce((sum, p) => sum + (filteredByPage[p]?.length ?? 0), 0),
    [pageNumbers, filteredByPage],
  );

  const isSearchActive = searchTerm.trim().length > 0;
  const showSearchEmpty =
    isSearchActive && totalCount > 0 && totalFilteredCount === 0;

  const handleContentsChange = useCallback(
    (pageIndex: number, annotationId: string, value: string) => {
      setDraftContents((prev) => ({
        ...prev,
        [pageIndex + "_" + annotationId]: value,
      }));
      if (!provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, annotationId, { contents: value });
    },
    [provides],
  );

  const handleDraftChange = useCallback(
    (pageIndex: number, annotationId: string, value: string) => {
      const key = `${pageIndex}_${annotationId}`;
      setDraftContents((prev) => ({ ...prev, [key]: value }));
      if (editingMainKey === key) {
        handleContentsChange(pageIndex, annotationId, value);
      }
    },
    [editingMainKey, handleContentsChange],
  );

  const [deleteModal, setDeleteModal] = useState<{
    pageIndex: number;
    id: string;
    ann: PdfAnnotationObject;
  } | null>(null);
  const [clearAllModalOpen, setClearAllModalOpen] = useState(false);

  const handleDeleteClick = useCallback(
    (pageIndex: number, annotationId: string, ann: PdfAnnotationObject) => {
      if (isLinkedCommentAnnotation(ann)) {
        setDeleteModal({ pageIndex, id: annotationId, ann });
      } else {
        provides?.deleteAnnotation?.(pageIndex, annotationId);
      }
    },
    [provides],
  );

  const handleRemoveFromSidebar = useCallback(() => {
    if (!deleteModal || !provides?.updateAnnotation) return;
    const { pageIndex, id, ann } = deleteModal;
    // Also clear contents: the contents field is the persisted signal for
    // post-reload linked annotations, so clearing it removes the annotation
    // from the sidebar (contents is not visually rendered on ink/shape/markup types).
    provides.updateAnnotation(pageIndex, id, getRemoveCommentPatch(ann));
    navActions?.setHasUnsavedChanges(true);
    setDeleteModal(null);
  }, [deleteModal, provides, navActions]);

  const handleDeleteAnnotation = useCallback(() => {
    if (!deleteModal) return;
    provides?.deleteAnnotation?.(deleteModal.pageIndex, deleteModal.id);
    navActions?.setHasUnsavedChanges(true);
    setDeleteModal(null);
  }, [deleteModal, provides, navActions]);

  const handleClearAllComments = useCallback(() => {
    const annotationsToDelete: Array<{ pageIndex: number; id: string }> = [];
    const commentPatches: Array<{
      pageIndex: number;
      id: string;
      patch: StirlingAnnotationPatch;
    }> = [];

    for (const [page, entries] of Object.entries(byPage)) {
      const fallbackPageIndex = Number(page);
      for (const entry of entries) {
        const ann = entry.annotation?.object;
        const id = ann?.id;
        if (!id) continue;

        const pageIndex = getAnnotationPageIndex(fallbackPageIndex, ann);
        if (isLinkedCommentAnnotation(ann)) {
          commentPatches.push({
            pageIndex,
            id,
            patch: getRemoveCommentPatch(ann),
          });
        } else {
          annotationsToDelete.push({ pageIndex, id });
        }

        for (const reply of entry.replies ?? []) {
          const replyObj = reply?.object;
          const replyId = replyObj?.id;
          if (!replyId) continue;
          annotationsToDelete.push({
            pageIndex: getAnnotationPageIndex(pageIndex, replyObj),
            id: replyId,
          });
        }
      }
    }

    if (commentPatches.length > 0) {
      if (provides?.updateAnnotations) {
        provides.updateAnnotations(commentPatches);
      } else {
        for (const { pageIndex, id, patch } of commentPatches) {
          provides?.updateAnnotation?.(pageIndex, id, patch);
        }
      }
    }

    if (annotationsToDelete.length > 0) {
      if (provides?.deleteAnnotations) {
        provides.deleteAnnotations(annotationsToDelete);
      } else {
        for (const { pageIndex, id } of annotationsToDelete) {
          provides?.deleteAnnotation?.(pageIndex, id);
        }
      }
    }

    setDraftContents({});
    setReplyDrafts({});
    setEditingMainKey(null);
    setEditingReply(null);
    setDeleteModal(null);
    setClearAllModalOpen(false);
    navActions?.setHasUnsavedChanges(true);
  }, [byPage, provides, navActions]);

  const handleSendMainComment = useCallback(
    (pageIndex: number, annotationId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, annotationId, {
        contents: trimmed,
        author: displayName,
      });
      navActions?.setHasUnsavedChanges(true);
      setDraftContents((prev) => ({
        ...prev,
        [pageIndex + "_" + annotationId]: trimmed,
      }));
    },
    [provides, displayName, navActions],
  );

  const handleSendReply = useCallback(
    (pageIndex: number, parentId: string, parentRect: Rect | undefined) => {
      const key = `${pageIndex}_${parentId}_reply`;
      const text = replyDrafts[key]?.trim();
      if (!text || !provides?.createAnnotation) return;
      const rect = parentRect ?? {
        origin: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
      };
      const reply: PdfTextAnnoObject = {
        type: PdfAnnotationSubtype.TEXT,
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        pageIndex,
        rect,
        contents: text,
        inReplyToId: parentId,
        replyType: PdfAnnotationReplyType.Reply,
        author: displayName,
      };
      provides.createAnnotation(pageIndex, reply);
      navActions?.setHasUnsavedChanges(true);
      setReplyDrafts((prev) => ({ ...prev, [key]: "" }));
    },
    [provides, replyDrafts, displayName, navActions],
  );

  const handleSaveReplyEdit = useCallback(
    (pageIndex: number, replyId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, replyId, {
        contents: trimmed,
        author: displayName,
      });
      navActions?.setHasUnsavedChanges(true);
      setEditingReply(null);
    },
    [provides, displayName, navActions],
  );

  const handleAddComment = useCallback(() => {
    // Keep the sidebar open this time - the button morphs into a
    // "Click on a page... cancel" hint so the user can see exactly
    // what state the viewer is in.
    handleToolSelectForced(ANNOTATE_PANEL_ID);
    requestAnimationFrame(() => {
      activateAnnotationToolRef.current?.(TEXT_COMMENT_TOOL_ID);
    });
  }, [handleToolSelectForced, activateAnnotationToolRef]);

  const handleCancelPlacingComment = useCallback(() => {
    // De-arm the textComment tool. The panel's activateAnnotationTool
    // takes the AnnotationToolId "select" to reset to no-tool state.
    activateAnnotationToolRef.current?.("select" as never);
    setActiveAnnotationToolId(null);
  }, [activateAnnotationToolRef, setActiveAnnotationToolId]);

  // ESC cancels placement mode while the sidebar is open.
  useEffect(() => {
    if (!visible || !isPlacingComment) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancelPlacingComment();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, isPlacingComment, handleCancelPlacingComment]);

  if (!visible) return null;

  const commentActions: CommentActions = {
    locate: handleLocateAnnotation,
    requestDelete: handleDeleteClick,
    startEditing: (pageIndex, annotationId) =>
      setEditingMainKey(`${pageIndex}_${annotationId}`),
    changeDraft: handleDraftChange,
    submit: (pageIndex, annotationId, value) => {
      handleSendMainComment(pageIndex, annotationId, value);
      setEditingMainKey(null);
    },
    changeReplyDraft: (pageIndex, parentId, value) =>
      setReplyDrafts((prev) => ({
        ...prev,
        [`${pageIndex}_${parentId}_reply`]: value,
      })),
    sendReply: handleSendReply,
    startEditingReply: (pageIndex, parentId, replyId, contents) =>
      setEditingReply({
        cardKey: `${pageIndex}_${parentId}`,
        replyId,
        draft: contents,
      }),
    changeReplyEdit: (draft) =>
      setEditingReply((prev) => prev && { ...prev, draft }),
    saveReplyEdit: handleSaveReplyEdit,
  };

  return (
    <>
      <SidebarBase
        className="comments-sidebar"
        title={t("viewer.comments.title", "Comments")}
        icon={<Icon name="message-square" size="1.1rem" />}
        rightOffset={rightOffset}
        visible={visible}
        onClose={toggleCommentsSidebar}
        closeLabel={t("viewer.comments.closeSidebar", "Close comments sidebar")}
        headerActions={
          totalCount > 0 ? (
            <CommentsHeaderActions
              readerMode={readerMode}
              onAdd={handleAddComment}
              onClearAll={() => setClearAllModalOpen(true)}
            />
          ) : null
        }
        searchTerm={searchTerm}
        searchPlaceholder={t(
          "viewer.comments.searchPlaceholder",
          "Search comments",
        )}
        onSearchChange={setSearchTerm}
        viewportRef={scrollViewportRef}
      >
        {totalCount === 0 ? (
          <CommentsEmptyState>
            <AddCommentButton
              isPlacing={isPlacingComment}
              readerMode={readerMode}
              onAdd={handleAddComment}
              onCancel={handleCancelPlacingComment}
            />
          </CommentsEmptyState>
        ) : (
          <>
            <AddCommentButton
              block
              isPlacing={isPlacingComment}
              readerMode={readerMode}
              onAdd={handleAddComment}
              onCancel={handleCancelPlacingComment}
            />
            {showSearchEmpty ? (
              <div className="sidebar-base__empty-state">
                <Text size="sm" c="dimmed" ta="center">
                  {t(
                    "viewer.comments.noMatch",
                    "No comments match your search",
                  )}
                </Text>
              </div>
            ) : (
              pageNumbers.map((pageIndex) => {
                const entries = filteredByPage[pageIndex] ?? [];
                return (
                  <CommentPageGroup
                    key={pageIndex}
                    pageIndex={pageIndex}
                    count={entries.length}
                  >
                    {entries.map((entry) => {
                      const id = entry.annotation?.object?.id;
                      if (!id) return null;
                      const cardKey = `${pageIndex}_${id}`;
                      return (
                        <CommentCard
                          key={cardKey}
                          pageIndex={pageIndex}
                          entry={entry}
                          selected={selectedAnnotationIds.has(id)}
                          displayName={displayName}
                          draft={draftContents[cardKey]}
                          isEditing={editingMainKey === cardKey}
                          replyDraft={replyDrafts[`${cardKey}_reply`] ?? ""}
                          editingReply={
                            editingReply?.cardKey === cardKey
                              ? editingReply
                              : null
                          }
                          actions={commentActions}
                        />
                      );
                    })}
                  </CommentPageGroup>
                );
              })
            )}
          </>
        )}
      </SidebarBase>

      <DeleteLinkedCommentModal
        opened={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onRemoveComment={handleRemoveFromSidebar}
        onDeleteAnnotation={handleDeleteAnnotation}
      />

      <ClearAllCommentsModal
        opened={clearAllModalOpen}
        onClose={() => setClearAllModalOpen(false)}
        onConfirm={handleClearAllComments}
      />
    </>
  );
}
