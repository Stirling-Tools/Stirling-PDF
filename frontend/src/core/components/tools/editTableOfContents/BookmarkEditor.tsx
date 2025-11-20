import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Badge,
  Button,
  Flex,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { BookmarkNode, createBookmarkNode } from '@app/utils/editTableOfContents';

interface BookmarkEditorProps {
  bookmarks: BookmarkNode[];
  onChange: (bookmarks: BookmarkNode[]) => void;
  disabled?: boolean;
}

const updateTree = (
  nodes: BookmarkNode[],
  targetId: string,
  updater: (bookmark: BookmarkNode) => BookmarkNode,
): BookmarkNode[] => {
  return nodes.map(node => {
    if (node.id === targetId) {
      return updater(node);
    }

    if (node.children.length === 0) {
      return node;
    }

    const updatedChildren = updateTree(node.children, targetId, updater);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }

    return node;
  });
};

const removeFromTree = (nodes: BookmarkNode[], targetId: string): BookmarkNode[] => {
  return nodes
    .filter(node => node.id !== targetId)
    .map(node => ({
      ...node,
      children: removeFromTree(node.children, targetId),
    }));
};

const addChildToTree = (
  nodes: BookmarkNode[],
  parentId: string,
  child: BookmarkNode,
): { nodes: BookmarkNode[]; added: boolean } => {
  let added = false;
  const next = nodes.map(node => {
    if (node.id === parentId) {
      added = true;
      return { ...node, expanded: true, children: [...node.children, child] };
    }

    if (node.children.length === 0) {
      return node;
    }

    const result = addChildToTree(node.children, parentId, child);
    if (result.added) {
      added = true;
      return { ...node, children: result.nodes };
    }

    return node;
  });

  return { nodes: added ? next : nodes, added };
};

const addSiblingInTree = (
  nodes: BookmarkNode[],
  targetId: string,
  sibling: BookmarkNode,
): { nodes: BookmarkNode[]; added: boolean } => {
  let added = false;
  const result: BookmarkNode[] = [];

  nodes.forEach(node => {
    let currentNode = node;

    if (!added && node.children.length > 0) {
      const childResult = addSiblingInTree(node.children, targetId, sibling);
      if (childResult.added) {
        added = true;
        currentNode = { ...node, children: childResult.nodes };
      }
    }

    result.push(currentNode);

    if (!added && node.id === targetId) {
      result.push(sibling);
      added = true;
    }
  });

  return { nodes: added ? result : nodes, added };
};

export default function BookmarkEditor({ bookmarks, onChange, disabled }: BookmarkEditorProps) {
  const { t } = useTranslation();

  const handleAddTopLevel = () => {
    const newBookmark = createBookmarkNode({ title: t('editTableOfContents.editor.defaultTitle', 'New bookmark') });
    onChange([...bookmarks, newBookmark]);
  };

  const handleTitleChange = (id: string, value: string) => {
    onChange(updateTree(bookmarks, id, bookmark => ({ ...bookmark, title: value })));
  };

  const handlePageChange = (id: string, value: number | string) => {
    const page = typeof value === 'number' ? value : parseInt(value, 10);
    onChange(updateTree(bookmarks, id, bookmark => ({ ...bookmark, pageNumber: Number.isFinite(page) && page > 0 ? page : 1 })));
  };

  const handleToggle = (id: string) => {
    onChange(updateTree(bookmarks, id, bookmark => ({ ...bookmark, expanded: !bookmark.expanded })));
  };

  const handleRemove = (id: string) => {
    const confirmation = t(
      'editTableOfContents.editor.confirmRemove',
      'Remove this bookmark and all of its children?'
    );
    if (window.confirm(confirmation)) {
      onChange(removeFromTree(bookmarks, id));
    }
  };

  const handleAddChild = (parentId: string) => {
    const child = createBookmarkNode({ title: t('editTableOfContents.editor.defaultChildTitle', 'Child bookmark') });
    const { nodes, added } = addChildToTree(bookmarks, parentId, child);
    onChange(added ? nodes : [...bookmarks, child]);
  };

  const handleAddSibling = (targetId: string) => {
    const sibling = createBookmarkNode({ title: t('editTableOfContents.editor.defaultSiblingTitle', 'New bookmark') });
    const { nodes, added } = addSiblingInTree(bookmarks, targetId, sibling);
    onChange(added ? nodes : [...bookmarks, sibling]);
  };

  const renderBookmark = (bookmark: BookmarkNode, level = 0) => {
    const hasChildren = bookmark.children.length > 0;
    const chevronIcon = bookmark.expanded ? 'expand-more-rounded' : 'chevron-right-rounded';

    return (
      <Paper
        key={bookmark.id}
        radius="md"
        withBorder
        p="md"
        style={{
          borderColor: 'var(--border-default)',
          background: level === 0 ? 'var(--bg-surface)' : 'var(--bg-muted)',
        }}
      >
        <Stack gap="sm">
          <Flex align="flex-start" justify="space-between" gap="md">
            <Group gap="sm" align="flex-start">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => hasChildren && handleToggle(bookmark.id)}
                disabled={disabled || !hasChildren}
                aria-label={t('editTableOfContents.editor.actions.toggle', 'Toggle children')}
                style={{ marginTop: 4 }}
              >
                <LocalIcon icon={chevronIcon} />
              </ActionIcon>
              <Stack gap={2}>
                <Group gap="xs" align="center">
                  <Text fw={600}>{bookmark.title || t('editTableOfContents.editor.untitled', 'Untitled bookmark')}</Text>
                  {level > 0 && (
                    <Badge size="xs" variant="light" color="blue">
                      {t('editTableOfContents.editor.childBadge', 'Child')}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {t('editTableOfContents.editor.pagePreview', { page: bookmark.pageNumber })}
                </Text>
              </Stack>
            </Group>
            <Group gap="xs">
              <Tooltip label={t('editTableOfContents.editor.actions.addChild', 'Add child bookmark')}>
                <ActionIcon
                  variant="subtle"
                  color="green"
                  onClick={() => handleAddChild(bookmark.id)}
                  disabled={disabled}
                >
                  <LocalIcon icon="subdirectory-arrow-right-rounded" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t('editTableOfContents.editor.actions.addSibling', 'Add sibling bookmark')}>
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  onClick={() => handleAddSibling(bookmark.id)}
                  disabled={disabled}
                >
                  <LocalIcon icon="add-rounded" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t('editTableOfContents.editor.actions.remove', 'Remove bookmark')}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => handleRemove(bookmark.id)}
                  disabled={disabled}
                >
                  <LocalIcon icon="delete-rounded" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Flex>

          {bookmark.expanded && (
            <Stack gap="sm">
              <TextInput
                size="sm"
                label={t('editTableOfContents.editor.field.title', 'Bookmark title')}
                value={bookmark.title}
                onChange={event => handleTitleChange(bookmark.id, event.currentTarget.value)}
                disabled={disabled}
              />
              <NumberInput
                size="sm"
                label={t('editTableOfContents.editor.field.page', 'Target page number')}
                min={1}
                clampBehavior="strict"
                value={bookmark.pageNumber}
                onChange={value => handlePageChange(bookmark.id, value ?? 1)}
                disabled={disabled}
              />
            </Stack>
          )}

          {bookmark.expanded && hasChildren && (
            <Stack gap="sm" pl="lg" style={{ borderLeft: '1px solid var(--border-default)' }}>
              {bookmark.children.map(child => (
                <Fragment key={child.id}>{renderBookmark(child, level + 1)}</Fragment>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600}>{t('editTableOfContents.editor.heading', 'Bookmark editor')}</Text>
          <Text size="sm" c="dimmed">
            {t('editTableOfContents.editor.description', 'Add, nest, and reorder bookmarks to craft your PDF outline.')}
          </Text>
        </div>
        <Button
          variant="default"
          color="blue"
          leftSection={<LocalIcon icon="bookmark-add-rounded" />}
          onClick={handleAddTopLevel}
          disabled={disabled}
        >
          {t('editTableOfContents.editor.addTopLevel', 'Add top-level bookmark')}
        </Button>
      </Group>

      {bookmarks.length === 0 ? (
        <Paper withBorder radius="md" ta="center" py="xl">
          <Stack gap="xs" align="center" px="lg">
            <LocalIcon icon="bookmark-add-rounded" style={{ fontSize: '2.25rem' }} />
            <Text fw={600}>{t('editTableOfContents.editor.empty.title', 'No bookmarks yet')}</Text>
            <Text size="sm" c="dimmed" maw={420}>
              {t('editTableOfContents.editor.empty.description', 'Import existing bookmarks or start by adding your first entry.')}
            </Text>
            <Button
              variant="subtle"
              color="blue"
              leftSection={<LocalIcon icon="add-rounded" />}
              onClick={handleAddTopLevel}
              disabled={disabled}
            >
              {t('editTableOfContents.editor.empty.action', 'Add first bookmark')}
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="sm">
          {bookmarks.map(bookmark => renderBookmark(bookmark))}
        </Stack>
      )}
    </Stack>
  );
}
