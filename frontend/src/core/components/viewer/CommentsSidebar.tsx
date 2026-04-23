import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  Box,
  ScrollArea,
  Text,
  Textarea,
  Stack,
  ActionIcon,
  Group,
  Tooltip,
  TextInput,
  Menu,
  Modal,
  Button,
  UnstyledButton,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/CheckRounded";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useAnnotation } from "@embedpdf/plugin-annotation/react";
import { getSidebarAnnotationsWithRepliesGroupedByPage } from "@embedpdf/plugin-annotation";
import {
  PdfAnnotationSubtype,
  PdfAnnotationReplyType,
  type PdfAnnotationObject,
  type PdfTextAnnoObject,
} from "@embedpdf/models";
import { useCommentAuthor } from "@app/contexts/CommentAuthorContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useAnnotation as useAnnotationContext } from "@app/contexts/AnnotationContext";
import LocalIcon from "@app/components/shared/LocalIcon";

const SIDEBAR_WIDTH = "18rem";

/** Format annotation date for display (e.g. "Mar 11, 6:05 PM"). */
function formatCommentDate(obj: any): string {
  const raw =
    obj?.modifiedDate ??
    obj?.creationDate ??
    obj?.customData?.modifiedDate ??
    obj?.M;
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
  annotation: { object: any };
  replies: Array<{ object: any }>;
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

function getAuthorName(obj: any, currentDisplayName: string): string {
  const stored = (obj?.author ?? "Guest").trim() || "Guest";
  if (PLACEHOLDER_AUTHORS.has(stored)) return currentDisplayName || "Guest";
  return stored;
}

/** Replies store an explicit author; only allow edit when it matches the current comment author name. */
function isReplyAuthoredByCurrentUser(
  obj: any,
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

// Map toolId → LocalIcon icon name (matches AnnotationPanel icon definitions)
const TOOL_ICON_MAP: Record<string, string> = {
  highlight: "highlight",
  underline: "format-underlined",
  strikeout: "strikethrough-s",
  squiggly: "show-chart",
  ink: "edit",
  inkHighlighter: "brush",
  square: "crop-square",
  circle: "radio-button-unchecked",
  line: "show-chart",
  lineArrow: "show-chart",
  polyline: "show-chart",
  polygon: "change-history",
  text: "text-fields",
  note: "sticky-note-2",
  stamp: "add-photo-alternate",
  textComment: "comment",
  insertText: "add-comment",
  replaceText: "find-replace",
};

// Type-based fallback icon when no toolId is present
function getIconByType(type: number | undefined): string {
  if (type === 1) return "comment";
  if (type === 3) return "sticky-note-2";
  if (type === 4 || type === 8) return "show-chart";
  if (type === 5) return "crop-square";
  if (type === 6) return "radio-button-unchecked";
  if (type === 7 || type === 8) return "change-history";
  if (type === 9) return "highlight";
  if (type === 10) return "format-underlined";
  if (type === 11) return "show-chart";
  if (type === 12) return "strikethrough-s";
  if (type === 13) return "add-photo-alternate";
  if (type === 14) return "add-comment";
  if (type === 15) return "edit";
  return "comment";
}

function isCommentAnnotation(ann: any): boolean {
  const toolId = ann?.customData?.toolId ?? ann?.customData?.annotationToolId;
  if (
    toolId === "textComment" ||
    toolId === "insertText" ||
    toolId === "replaceText"
  )
    return true;
  // Any annotation explicitly added to comments via the "Add comment" button
  if (ann?.customData?.isComment === true) return true;
  // CARET (type 14) = insertText/replaceText; TEXT (type 1) = textComment
  if (!toolId && (ann?.type === 14 || ann?.type === 1)) return true;
  // Non-comment-type annotations (ink, shapes, markup, stamp…) whose contents field is
  // non-empty: customData (including isComment and toolId) is NOT persisted to PDF, but
  // `contents` is a standard PDF field and survives save/reload. Exclude TEXT (1),
  // FreeText (3), and CARET (14) which use `contents` for their own annotation text.
  // Exclude replies. Do NOT require toolId — it is absent after reload.
  const type = ann?.type;
  if (
    type !== undefined &&
    type !== 1 &&
    type !== 3 &&
    type !== 14 &&
    !ann?.inReplyToId &&
    (ann?.contents ?? "").trim().length > 0
  )
    return true;
  return false;
}

function getAnnotationToolId(ann: any): string {
  return ann?.customData?.toolId ?? ann?.customData?.annotationToolId ?? "";
}

function getAnnotationTypeLabel(
  ann: any,
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

function AnnotationTypeIcon({ ann }: { ann: any }) {
  const toolId = getAnnotationToolId(ann);
  const iconName = TOOL_ICON_MAP[toolId] ?? getIconByType(ann?.type);
  return (
    <LocalIcon
      icon={iconName}
      width="1.25rem"
      height="1.25rem"
      style={{ flexShrink: 0, color: "var(--mantine-color-blue-5)" }}
    />
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
  } = useViewer() ?? {};
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const { state, provides } = useAnnotation(documentId);
  const { handleToolSelectForced } = useToolWorkflow();
  const { activateAnnotationToolRef } = useAnnotationContext();
  const [draftContents, setDraftContents] = useState<Record<string, string>>(
    {},
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  /** Draft text while editing an existing reply (`${pageIndex}_${parentId}_${replyId}`). */
  const [replyEditDrafts, setReplyEditDrafts] = useState<
    Record<string, string>
  >({});
  /** When set, this card's main comment is in edit mode (show textarea for main comment). */
  const [editingMainKey, setEditingMainKey] = useState<string | null>(null);
  /** Which reply is in edit mode (same key shape as replyEditDrafts). */
  const [editingReplyKey, setEditingReplyKey] = useState<string | null>(null);

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
    (pageIndex: number, ann: any) => {
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

  const byPage = useMemo(() => {
    try {
      const all = getSidebarAnnotationsWithRepliesGroupedByPage(state) ?? {};
      const filtered: typeof all = {};
      for (const [page, entries] of Object.entries(all)) {
        const commentEntries = entries.filter((e) =>
          isCommentAnnotation(e.annotation.object),
        );
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

  const pageNumbers = useMemo(
    () =>
      Object.keys(byPage)
        .map(Number)
        .sort((a, b) => a - b),
    [byPage],
  );
  const totalCount = useMemo(
    () => pageNumbers.reduce((sum, p) => sum + (byPage[p]?.length ?? 0), 0),
    [pageNumbers, byPage],
  );

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

  const [deleteModal, setDeleteModal] = useState<{
    pageIndex: number;
    id: string;
    ann: any;
  } | null>(null);

  const isLinkedAnnotation = (ann: any) => {
    const type = ann?.type;
    // TEXT (1), FreeText (3), and CARET (14) are standalone comment annotations, not linked ones
    if (type === 1 || type === 3 || type === 14) return false;
    if (ann?.inReplyToId) return false;
    return (
      ann?.customData?.isComment === true ||
      (type !== undefined && (ann?.contents ?? "").trim().length > 0)
    );
  };

  const handleDeleteClick = useCallback(
    (pageIndex: number, annotationId: string, ann: any) => {
      if (isLinkedAnnotation(ann)) {
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
    const existing = (ann?.customData ?? {}) as Record<string, unknown>;
    const { isComment: _removed, ...rest } = existing;
    // Also clear contents: the contents field is the persisted signal for
    // post-reload linked annotations, so clearing it removes the annotation
    // from the sidebar (contents is not visually rendered on ink/shape/markup types).
    provides.updateAnnotation(pageIndex, id, {
      customData: rest,
      contents: "",
    } as unknown as Partial<PdfAnnotationObject>);
    setDeleteModal(null);
  }, [deleteModal, provides]);

  const handleDeleteAnnotation = useCallback(() => {
    if (!deleteModal) return;
    provides?.deleteAnnotation?.(deleteModal.pageIndex, deleteModal.id);
    setDeleteModal(null);
  }, [deleteModal, provides]);

  const handleSendMainComment = useCallback(
    (pageIndex: number, annotationId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, annotationId, {
        contents: trimmed,
        author: displayName,
      });
      setDraftContents((prev) => ({
        ...prev,
        [pageIndex + "_" + annotationId]: trimmed,
      }));
    },
    [provides, displayName],
  );

  const handleSendReply = useCallback(
    (pageIndex: number, parentId: string, parentRect: any) => {
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
      setReplyDrafts((prev) => ({ ...prev, [key]: "" }));
    },
    [provides, replyDrafts, displayName],
  );

  const handleSaveReplyEdit = useCallback(
    (editKey: string, pageIndex: number, replyId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, replyId, {
        contents: trimmed,
        author: displayName,
      });
      setReplyEditDrafts((prev) => {
        const next = { ...prev };
        delete next[editKey];
        return next;
      });
      setEditingReplyKey(null);
    },
    [provides, displayName],
  );

  const handleAddComment = useCallback(() => {
    handleToolSelectForced("annotate");
    requestAnimationFrame(() => {
      activateAnnotationToolRef.current?.("textComment");
    });
  }, [handleToolSelectForced, activateAnnotationToolRef]);

  if (!visible) return null;

  return (
    <Box
      ref={scrollViewportRef}
      style={{
        position: "fixed",
        right: rightOffset,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        backgroundColor: "var(--right-rail-bg)",
        borderLeft: "1px solid var(--border-subtle)",
        zIndex: 998,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-2px 0 8px rgba(0, 0, 0, 0.1)",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <LocalIcon
          icon="comment"
          width="1.25rem"
          height="1.25rem"
          style={{ color: "var(--mantine-color-dimmed)", flexShrink: 0 }}
        />
        <Text fw={600} size="sm" tt="uppercase" lts={0.5} style={{ flex: 1 }}>
          {t("viewer.comments.title", "Comments")}
        </Text>
        {totalCount > 0 && (
          <Tooltip label={t("viewer.comments.addComment", "Add comment")}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={handleAddComment}
            >
              <LocalIcon icon="add" width="1.25rem" height="1.25rem" />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <ScrollArea style={{ flex: 1 }}>
        <Stack p="sm" gap="md">
          {totalCount === 0 ? (
            <Stack align="center" gap="sm" py="lg">
              <LocalIcon
                icon="comment"
                width="2rem"
                height="2rem"
                style={{ color: "var(--mantine-color-dimmed)" }}
              />
              <Text size="sm" c="dimmed" ta="center">
                {t(
                  "viewer.comments.hint",
                  "Place comments with the Comment, Insert Text, or Replace Text tools. They will appear here by page.",
                )}
              </Text>
              <Button
                variant="light"
                size="xs"
                onClick={handleAddComment}
                leftSection={
                  <LocalIcon icon="add" width="1rem" height="1rem" />
                }
              >
                {t("viewer.comments.addComment", "Add comment")}
              </Button>
            </Stack>
          ) : (
            pageNumbers.map((pageIndex) => {
              const entries = byPage[pageIndex] ?? [];
              const pageNum = pageIndex + 1;
              return (
                <Box key={pageIndex} mb="md">
                  <Text size="sm" fw={700} mb={2}>
                    {t("viewer.comments.pageLabel", "Page {{page}}", {
                      page: pageNum,
                    })}
                  </Text>
                  <Text size="xs" c="dimmed" mb="sm">
                    {entries.length === 1
                      ? t("viewer.comments.oneComment", "1 comment")
                      : t("viewer.comments.nComments", "{{count}} comments", {
                          count: entries.length,
                        })}
                  </Text>
                  <Box
                    mb="xs"
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  />
                  <Stack gap="sm">
                    {entries.map((entry) => {
                      const ann = entry.annotation?.object;
                      const id = ann?.id;
                      if (!id) return null;
                      const key = `${pageIndex}_${id}`;
                      const replyKey = `${pageIndex}_${id}_reply`;
                      const displayContent = getCommentDisplayContent(entry);
                      const draft =
                        draftContents[key] !== undefined
                          ? draftContents[key]
                          : displayContent;
                      const replyDraft = replyDrafts[replyKey] ?? "";
                      const authorName = getAuthorName(ann, displayName);
                      /** Only treat as "comment posted" when annotation actually has content (user clicked Send), not on every keystroke. */
                      const hasMainContent =
                        (displayContent ?? "").trim().length > 0;
                      const isEditingMain = editingMainKey === key;

                      const mainTimestamp = formatCommentDate(ann);
                      const typeLabel = getAnnotationTypeLabel(ann, t);

                      return (
                        <Box
                          key={key}
                          data-comment-card={key}
                          p="sm"
                          style={{
                            border: selectedAnnotationIds.has(id)
                              ? "1px solid var(--mantine-color-blue-3)"
                              : "1px solid var(--border-subtle)",
                            borderRadius: 8,
                            backgroundColor: "var(--bg-raised)",
                          }}
                        >
                          <Group
                            wrap="nowrap"
                            gap="xs"
                            justify="space-between"
                            align="flex-start"
                            mb="xs"
                          >
                            <Group
                              wrap="nowrap"
                              gap="xs"
                              style={{ minWidth: 0, flex: 1 }}
                            >
                              <AnnotationTypeIcon ann={ann} />
                              <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600}>
                                  {authorName}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {typeLabel}
                                  {mainTimestamp ? ` · ${mainTimestamp}` : ""}
                                </Text>
                              </Box>
                            </Group>
                            <Group
                              gap={2}
                              wrap="nowrap"
                              style={{ flexShrink: 0 }}
                            >
                              <Tooltip
                                label={t(
                                  "viewer.comments.locateAnnotation",
                                  "Locate in document",
                                )}
                              >
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  color="gray"
                                  onClick={() =>
                                    handleLocateAnnotation(pageIndex, ann)
                                  }
                                >
                                  <VisibilityIcon style={{ fontSize: 16 }} />
                                </ActionIcon>
                              </Tooltip>
                              <Menu position="bottom-end" withArrow>
                                <Menu.Target>
                                  <Tooltip
                                    label={t(
                                      "viewer.comments.moreActions",
                                      "More actions",
                                    )}
                                  >
                                    <ActionIcon
                                      variant="subtle"
                                      size="sm"
                                      color="gray"
                                    >
                                      <MoreHorizIcon style={{ fontSize: 20 }} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item
                                    leftSection={
                                      <EditIcon style={{ fontSize: 18 }} />
                                    }
                                    onClick={() => setEditingMainKey(key)}
                                  >
                                    {t("annotation.editText", "Edit")}
                                  </Menu.Item>
                                  <Menu.Item
                                    leftSection={
                                      <DeleteIcon style={{ fontSize: 18 }} />
                                    }
                                    color="red"
                                    onClick={() =>
                                      handleDeleteClick(pageIndex, id, ann)
                                    }
                                  >
                                    {t("annotation.delete", "Delete")}
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            </Group>
                          </Group>

                          {!hasMainContent || isEditingMain ? (
                            <>
                              <Textarea
                                placeholder={t(
                                  "viewer.comments.addCommentPlaceholder",
                                  "Add comment...",
                                )}
                                minRows={2}
                                autosize
                                value={draft ?? ""}
                                onChange={(e) => {
                                  const v =
                                    (e?.currentTarget ?? e?.target)?.value ??
                                    "";
                                  setDraftContents((prev) => ({
                                    ...prev,
                                    [key]: v,
                                  }));
                                  if (isEditingMain) {
                                    handleContentsChange(pageIndex, id, v);
                                  }
                                }}
                                styles={{ root: { width: "100%" } }}
                                mb="xs"
                              />
                              <Group gap={4} wrap="nowrap" justify="flex-end">
                                <Tooltip
                                  label={t(
                                    "viewer.comments.addComment",
                                    "Add comment",
                                  )}
                                >
                                  <ActionIcon
                                    variant="filled"
                                    size="sm"
                                    color="blue"
                                    onClick={() => {
                                      handleSendMainComment(
                                        pageIndex,
                                        id,
                                        draft ?? "",
                                      );
                                      setEditingMainKey(null);
                                    }}
                                    disabled={!(draft ?? "").trim()}
                                  >
                                    <CheckIcon
                                      style={{ fontSize: 18, color: "white" }}
                                    />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </>
                          ) : (
                            <>
                              <Text
                                size="sm"
                                mb="sm"
                                style={{ whiteSpace: "pre-wrap" }}
                              >
                                {displayContent}
                              </Text>

                              {entry.replies?.length ? (
                                <Stack gap="sm" mb="sm">
                                  {entry.replies.map((r) => {
                                    const rObj = r?.object;
                                    const rId = rObj?.id;
                                    if (!rId) return null;
                                    const rAuthor = getAuthorName(
                                      rObj,
                                      displayName,
                                    );
                                    const rTimestamp = formatCommentDate(rObj);
                                    const replyEditKey = `${pageIndex}_${id}_${rId}`;
                                    const isEditingReply =
                                      editingReplyKey === replyEditKey;
                                    const canEditReply =
                                      isReplyAuthoredByCurrentUser(
                                        rObj,
                                        displayName,
                                      );
                                    const replyBody =
                                      replyEditDrafts[replyEditKey] !==
                                      undefined
                                        ? replyEditDrafts[replyEditKey]
                                        : (rObj?.contents ?? "");
                                    return (
                                      <Box
                                        key={rId}
                                        pl="xs"
                                        style={{
                                          borderLeft:
                                            "2px solid var(--mantine-color-blue-3)",
                                        }}
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
                                              {rAuthor}
                                            </Text>
                                            <Group
                                              wrap="nowrap"
                                              gap="xs"
                                              align="center"
                                            >
                                              {canEditReply &&
                                              !isEditingReply ? (
                                                <UnstyledButton
                                                  type="button"
                                                  onClick={() => {
                                                    setEditingReplyKey(
                                                      replyEditKey,
                                                    );
                                                    setReplyEditDrafts(() => ({
                                                      [replyEditKey]: String(
                                                        rObj?.contents ?? "",
                                                      ),
                                                    }));
                                                  }}
                                                >
                                                  <Text size="xs" c="blue">
                                                    {t(
                                                      "annotation.editText",
                                                      "Edit",
                                                    )}
                                                  </Text>
                                                </UnstyledButton>
                                              ) : null}
                                              {rTimestamp ? (
                                                <Text size="xs" c="dimmed">
                                                  {rTimestamp}
                                                </Text>
                                              ) : null}
                                            </Group>
                                          </Group>
                                          {isEditingReply ? (
                                            <>
                                              <Textarea
                                                minRows={2}
                                                autosize
                                                value={replyBody}
                                                onChange={(e) => {
                                                  const v =
                                                    (
                                                      e?.currentTarget ??
                                                      e?.target
                                                    )?.value ?? "";
                                                  setReplyEditDrafts((p) => ({
                                                    ...p,
                                                    [replyEditKey]: v,
                                                  }));
                                                }}
                                                styles={{
                                                  root: { width: "100%" },
                                                }}
                                                mb="xs"
                                              />
                                              <Group
                                                gap={4}
                                                wrap="nowrap"
                                                justify="flex-end"
                                              >
                                                <Tooltip
                                                  label={t(
                                                    "viewer.comments.saveReply",
                                                    "Save reply",
                                                  )}
                                                >
                                                  <ActionIcon
                                                    variant="filled"
                                                    size="sm"
                                                    color="blue"
                                                    onClick={() =>
                                                      handleSaveReplyEdit(
                                                        replyEditKey,
                                                        pageIndex,
                                                        rId,
                                                        replyBody,
                                                      )
                                                    }
                                                    disabled={!replyBody.trim()}
                                                  >
                                                    <CheckIcon
                                                      style={{
                                                        fontSize: 18,
                                                        color: "white",
                                                      }}
                                                    />
                                                  </ActionIcon>
                                                </Tooltip>
                                              </Group>
                                            </>
                                          ) : (
                                            <Text
                                              size="sm"
                                              style={{ whiteSpace: "pre-wrap" }}
                                            >
                                              {rObj?.contents ?? ""}
                                            </Text>
                                          )}
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              ) : null}

                              <Group gap="xs" wrap="nowrap" align="flex-end">
                                <TextInput
                                  placeholder={t(
                                    "viewer.comments.addReplyPlaceholder",
                                    "Add reply...",
                                  )}
                                  size="xs"
                                  value={replyDraft}
                                  onChange={(e) => {
                                    const v =
                                      (e?.currentTarget ?? e?.target)?.value ??
                                      "";
                                    setReplyDrafts((p) => ({
                                      ...p,
                                      [replyKey]: v,
                                    }));
                                  }}
                                  style={{ flex: 1, minWidth: 0 }}
                                  styles={{
                                    input: {
                                      borderColor:
                                        "var(--mantine-color-blue-3)",
                                    },
                                  }}
                                />
                                <Tooltip
                                  label={t(
                                    "viewer.comments.addComment",
                                    "Add comment",
                                  )}
                                >
                                  <ActionIcon
                                    variant="filled"
                                    size="md"
                                    color="blue"
                                    style={{
                                      backgroundColor:
                                        "var(--mantine-color-blue-6)",
                                    }}
                                    onClick={() =>
                                      handleSendReply(pageIndex, id, ann?.rect)
                                    }
                                    disabled={!replyDraft.trim()}
                                  >
                                    <CheckIcon
                                      style={{ fontSize: 20, color: "white" }}
                                    />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })
          )}
        </Stack>
      </ScrollArea>

      <Modal
        opened={!!deleteModal}
        onClose={() => setDeleteModal(null)}
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
          <Button variant="default" onClick={handleRemoveFromSidebar}>
            {t("viewer.comments.removeCommentOnly", "Remove comment only")}
          </Button>
          <Button color="red" onClick={handleDeleteAnnotation}>
            {t(
              "viewer.comments.deleteAnnotationAndComment",
              "Delete annotation & comment",
            )}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
