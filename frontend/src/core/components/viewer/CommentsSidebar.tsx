import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Box, ScrollArea, Text, Textarea, Stack, ActionIcon, Group, Tooltip, TextInput, Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CommentIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import InsertTextIcon from '@mui/icons-material/AddCommentOutlined';
import ReplaceTextIcon from '@mui/icons-material/FindReplace';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/SendRounded';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import EditIcon from '@mui/icons-material/Edit';
import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import { getSidebarAnnotationsWithRepliesGroupedByPage } from '@embedpdf/plugin-annotation';
import { PdfAnnotationSubtype, PdfAnnotationReplyType } from '@embedpdf/models';
import { useCommentAuthor } from '@app/contexts/CommentAuthorContext';
import { useViewer } from '@app/contexts/ViewerContext';

const SIDEBAR_WIDTH = '18rem';

/** Format annotation date for display (e.g. "Mar 11, 6:05 PM"). */
function formatCommentDate(obj: any): string {
  const raw = obj?.modifiedDate ?? obj?.creationDate ?? obj?.customData?.modifiedDate ?? obj?.M;
  if (raw == null) return '';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface CommentsSidebarProps {
  documentId: string;
  visible: boolean;
  rightOffset: string;
}

function getCommentDisplayContent(entry: { annotation: { object: any }; replies: Array<{ object: any }> }): string {
  const main = entry.annotation?.object?.contents;
  if (main != null && String(main).trim()) return String(main).trim();
  const firstReply = entry.replies?.[0]?.object?.contents;
  if (firstReply != null && String(firstReply).trim()) return String(firstReply).trim();
  return '';
}

/** Placeholder authors we never show; use current user's name from context instead. */
const PLACEHOLDER_AUTHORS = new Set(['Guest', 'Digital Signature', '']);

function getAuthorName(obj: any, currentDisplayName: string): string {
  const stored = (obj?.author ?? 'Guest').trim() || 'Guest';
  if (PLACEHOLDER_AUTHORS.has(stored)) return currentDisplayName || 'Guest';
  return stored;
}

function getAnnotationToolType(ann: any): 'textComment' | 'insertText' | 'replaceText' {
  // Check explicit customData first (manually created annotations)
  const toolId = ann?.customData?.toolId ?? ann?.customData?.annotationToolId;
  if (toolId === 'insertText') return 'insertText';
  if (toolId === 'replaceText') return 'replaceText';
  if (toolId === 'textComment') return 'textComment';
  // Fall back to structural type detection (EmbedPDF internal creation)
  // CARET type = 14, TEXT type = 1
  if (ann?.type === 14 || ann?.type === 'CARET') {
    const intent = ann?.intent;
    if (intent === 'Replace') return 'replaceText';
    return 'insertText';
  }
  return 'textComment';
}

function AnnotationTypeIcon({ ann }: { ann: any }) {
  const type = getAnnotationToolType(ann);
  const sx = { fontSize: '1.25rem', flexShrink: 0, color: 'var(--mantine-color-blue-5)' };
  if (type === 'insertText') return <InsertTextIcon sx={sx} />;
  if (type === 'replaceText') return <ReplaceTextIcon sx={sx} />;
  return <CommentIcon sx={sx} />;
}

export function CommentsSidebar({ documentId, visible, rightOffset }: CommentsSidebarProps) {
  const { t } = useTranslation();
  const { displayName } = useCommentAuthor();
  const { highlightCommentRequest, clearHighlightCommentRequest } = useViewer() ?? {};
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const { state, provides } = useAnnotation(documentId);
  const [draftContents, setDraftContents] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  /** When set, this card's main comment is in edit mode (show textarea for main comment). */
  const [editingMainKey, setEditingMainKey] = useState<string | null>(null);

  // React to request to focus or highlight a comment card (e.g. from "Add comment" / "View comment" in selection menu)
  useEffect(() => {
    if (!visible || !highlightCommentRequest || highlightCommentRequest.documentId !== documentId) return;
    const { pageIndex, annotationId, action } = highlightCommentRequest;
    const cardKey = `${pageIndex}_${annotationId}`;
    const root = scrollViewportRef.current;
    if (!root) return;
    const card = root.querySelector<HTMLElement>(`[data-comment-card="${cardKey}"]`);
    if (!card) {
      clearHighlightCommentRequest?.();
      return;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (action === 'highlight') {
      card.classList.remove('comment-card-flash-highlight');
      void card.offsetWidth;
      card.classList.add('comment-card-flash-highlight');
      const tId = window.setTimeout(() => {
        card.classList.remove('comment-card-flash-highlight');
        clearHighlightCommentRequest?.();
      }, 1500);
      return () => window.clearTimeout(tId);
    }
    // action === 'focus': focus the first textarea or reply input in the card
    const input = card.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input');
    if (input) {
      requestAnimationFrame(() => {
        input.focus();
      });
    }
    clearHighlightCommentRequest?.();
  }, [visible, highlightCommentRequest, documentId, clearHighlightCommentRequest]);

  const byPage = useMemo(() => {
    try {
      return getSidebarAnnotationsWithRepliesGroupedByPage(state) ?? {};
    } catch {
      return {};
    }
  }, [state]);

  const pageNumbers = useMemo(() => Object.keys(byPage).map(Number).sort((a, b) => a - b), [byPage]);
  const totalCount = useMemo(() => pageNumbers.reduce((sum, p) => sum + (byPage[p]?.length ?? 0), 0), [pageNumbers, byPage]);

  const handleContentsChange = useCallback(
    (pageIndex: number, annotationId: string, value: string) => {
      setDraftContents((prev) => ({ ...prev, [pageIndex + '_' + annotationId]: value }));
      if (!provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, annotationId, { contents: value });
    },
    [provides]
  );

  const handleDelete = useCallback(
    (pageIndex: number, annotationId: string) => {
      provides?.deleteAnnotation?.(pageIndex, annotationId);
    },
    [provides]
  );

  const handleSendMainComment = useCallback(
    (pageIndex: number, annotationId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !provides?.updateAnnotation) return;
      provides.updateAnnotation(pageIndex, annotationId, { contents: trimmed, author: displayName });
      setDraftContents((prev) => ({ ...prev, [pageIndex + '_' + annotationId]: trimmed }));
    },
    [provides, displayName]
  );

  const handleSendReply = useCallback(
    (pageIndex: number, parentId: string, parentRect: any) => {
      const key = `${pageIndex}_${parentId}_reply`;
      const text = replyDrafts[key]?.trim();
      if (!text || !provides?.createAnnotation) return;
      const rect = parentRect ?? { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } };
      provides.createAnnotation(pageIndex, {
        type: PdfAnnotationSubtype.TEXT,
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        pageIndex,
        rect,
        contents: text,
        inReplyToId: parentId,
        replyType: PdfAnnotationReplyType.Reply,
        author: displayName,
      } as any);
      setReplyDrafts((prev) => ({ ...prev, [key]: '' }));
    },
    [provides, replyDrafts, displayName]
  );

  if (!visible) return null;

  return (
    <Box
      ref={scrollViewportRef}
      style={{
        position: 'fixed',
        right: rightOffset,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        zIndex: 998,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <CommentIcon sx={{ fontSize: '1.25rem', color: 'var(--mantine-color-dimmed)' }} />
        <Text fw={600} size="sm" tt="uppercase" lts={0.5}>
          {t('viewer.comments.title', 'Comments')}
        </Text>
      </div>
      <ScrollArea style={{ flex: 1 }}>
        <Stack p="sm" gap="md">
          {totalCount === 0 ? (
            <Text size="sm" c="dimmed">
              {t('viewer.comments.hint', 'Place comments with the Comment, Insert Text, or Replace Text tools. They will appear here by page.')}
            </Text>
          ) : (
            pageNumbers.map((pageIndex) => {
              const entries = byPage[pageIndex] ?? [];
              const pageNum = pageIndex + 1;
              return (
                <Box key={pageIndex} mb="md">
                  <Text size="sm" fw={700} mb={2}>
                    {t('viewer.comments.pageLabel', 'Page {{page}}', { page: pageNum })}
                  </Text>
                  <Text size="xs" c="dimmed" mb="sm">
                    {entries.length === 1
                      ? t('viewer.comments.oneComment', '1 comment')
                      : t('viewer.comments.nComments', '{{count}} comments', { count: entries.length })}
                  </Text>
                  <Box
                    mb="xs"
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
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
                      const draft = draftContents[key] !== undefined ? draftContents[key] : displayContent;
                      const replyDraft = replyDrafts[replyKey] ?? '';
                      const authorName = getAuthorName(ann, displayName);
                      /** Only treat as "comment posted" when annotation actually has content (user clicked Send), not on every keystroke. */
                      const hasMainContent = (displayContent ?? '').trim().length > 0;
                      const isEditingMain = editingMainKey === key;

                      const mainTimestamp = formatCommentDate(ann);
                      const annToolType = getAnnotationToolType(ann);
                      const typeLabel =
                        annToolType === 'insertText'
                          ? t('viewer.comments.typeInsertText', 'Insert Text')
                          : annToolType === 'replaceText'
                          ? t('viewer.comments.typeReplaceText', 'Replace Text')
                          : t('viewer.comments.typeComment', 'Comment');

                      return (
                        <Box
                          key={key}
                          data-comment-card={key}
                          p="sm"
                          style={{
                            border: '1px solid var(--mantine-color-blue-3)',
                            borderRadius: 8,
                            backgroundColor: 'var(--bg-raised)',
                          }}
                        >
                          <Group wrap="nowrap" gap="xs" justify="space-between" align="flex-start" mb="xs">
                            <Group wrap="nowrap" gap="xs" style={{ minWidth: 0, flex: 1 }}>
                              <AnnotationTypeIcon ann={ann} />
                              <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600}>
                                  {authorName}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {typeLabel}{mainTimestamp ? ` · ${mainTimestamp}` : ''}
                                </Text>
                              </Box>
                            </Group>
                            <Menu position="bottom-end" withArrow>
                              <Menu.Target>
                                <Tooltip label={t('viewer.comments.moreActions', 'More actions')}>
                                  <ActionIcon variant="subtle" size="sm" color="gray">
                                    <MoreHorizIcon style={{ fontSize: 20 }} />
                                  </ActionIcon>
                                </Tooltip>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  leftSection={<EditIcon style={{ fontSize: 18 }} />}
                                  onClick={() => setEditingMainKey(key)}
                                >
                                  {t('annotation.editText', 'Edit')}
                                </Menu.Item>
                                <Menu.Item
                                  leftSection={<DeleteIcon style={{ fontSize: 18 }} />}
                                  color="red"
                                  onClick={() => handleDelete(pageIndex, id)}
                                >
                                  {t('annotation.delete', 'Delete')}
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>

                          {!hasMainContent || isEditingMain ? (
                            <>
                              <Textarea
                                placeholder={t('viewer.comments.addCommentPlaceholder', 'Add comment...')}
                                minRows={2}
                                autosize
                                value={draft ?? ''}
                                onChange={(e) => {
                                  const v = (e?.currentTarget ?? e?.target)?.value ?? '';
                                  setDraftContents((prev) => ({ ...prev, [key]: v }));
                                  if (isEditingMain) {
                                    handleContentsChange(pageIndex, id, v);
                                  }
                                }}
                                styles={{ root: { width: '100%' } }}
                                mb="xs"
                              />
                              <Group gap={4} wrap="nowrap" justify="flex-end">
                                <Tooltip label={t('viewer.comments.send', 'Send')}>
                                  <ActionIcon
                                    variant="filled"
                                    size="sm"
                                    color="blue"
                                    onClick={() => {
                                      handleSendMainComment(pageIndex, id, draft ?? '');
                                      setEditingMainKey(null);
                                    }}
                                    disabled={!(draft ?? '').trim()}
                                  >
                                    <SendIcon style={{ fontSize: 18 }} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </>
                          ) : (
                            <>
                              <Text size="sm" mb="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                {displayContent}
                              </Text>

                              {entry.replies?.length ? (
                                <Stack gap="sm" mb="sm">
                                  {entry.replies.map((r) => {
                                    const rObj = r?.object;
                                    const rId = rObj?.id;
                                    const rAuthor = getAuthorName(rObj, displayName);
                                    const rTimestamp = formatCommentDate(rObj);
                                    return (
                                      <Box key={rId} pl="xs" style={{ borderLeft: '2px solid var(--mantine-color-blue-3)' }}>
                                        <Box style={{ minWidth: 0 }}>
                                          <Group wrap="nowrap" justify="space-between" gap={4} mb={2}>
                                            <Text size="sm" fw={600}>
                                              {rAuthor}
                                            </Text>
                                            {rTimestamp ? (
                                              <Text size="xs" c="dimmed">
                                                {rTimestamp}
                                              </Text>
                                            ) : null}
                                          </Group>
                                          <Text size="sm">{rObj?.contents ?? ''}</Text>
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              ) : null}

                              <Group gap="xs" wrap="nowrap" align="flex-end">
                                <TextInput
                                  placeholder={t('viewer.comments.addReplyPlaceholder', 'Add reply...')}
                                  size="xs"
                                  value={replyDraft}
                                  onChange={(e) => {
                                    const v = (e?.currentTarget ?? e?.target)?.value ?? '';
                                    setReplyDrafts((p) => ({ ...p, [replyKey]: v }));
                                  }}
                                  style={{ flex: 1, minWidth: 0 }}
                                  styles={{
                                    input: {
                                      borderColor: 'var(--mantine-color-blue-3)',
                                    },
                                  }}
                                />
                                <Tooltip label={t('viewer.comments.send', 'Send')}>
                                  <ActionIcon
                                    variant="filled"
                                    size="md"
                                    color="blue"
                                    style={{ backgroundColor: 'var(--mantine-color-blue-6)' }}
                                    onClick={() => handleSendReply(pageIndex, id, ann?.rect)}
                                    disabled={!replyDraft.trim()}
                                  >
                                    <SendIcon style={{ fontSize: 20 }} />
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
    </Box>
  );
}
