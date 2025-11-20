export interface BookmarkPayload {
  title: string;
  pageNumber: number;
  children?: BookmarkPayload[];
}

export interface BookmarkNode {
  id: string;
  title: string;
  pageNumber: number;
  children: BookmarkNode[];
  expanded: boolean;
}

const createBookmarkId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createBookmarkNode = (bookmark?: Partial<BookmarkNode>): BookmarkNode => ({
  id: bookmark?.id ?? createBookmarkId(),
  title: bookmark?.title ?? '',
  pageNumber: bookmark?.pageNumber ?? 1,
  children: bookmark?.children ? bookmark.children.map(child => createBookmarkNode(child)) : [],
  expanded: bookmark?.expanded ?? true,
});

export const hydrateBookmarkPayload = (payload: BookmarkPayload[] = []): BookmarkNode[] => {
  return payload.map(item => ({
    id: createBookmarkId(),
    title: item.title ?? '',
    pageNumber: typeof item.pageNumber === 'number' && item.pageNumber > 0 ? item.pageNumber : 1,
    expanded: true,
    children: item.children ? hydrateBookmarkPayload(item.children) : [],
  }));
};

export const serializeBookmarkNodes = (bookmarks: BookmarkNode[]): BookmarkPayload[] => {
  return bookmarks.map(bookmark => ({
    title: bookmark.title,
    pageNumber: bookmark.pageNumber,
    children: serializeBookmarkNodes(bookmark.children),
  }));
};
