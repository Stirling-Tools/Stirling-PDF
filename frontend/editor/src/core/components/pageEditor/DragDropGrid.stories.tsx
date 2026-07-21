import type { Meta, StoryObj } from "@storybook/react-vite";
import DragDropGrid from "@app/components/pageEditor/DragDropGrid";

interface MockGridItem {
  id: string;
  pageNumber?: number;
  originalFileId?: string;
}

const buildItems = (count: number): MockGridItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `page-${index + 1}`,
    pageNumber: index + 1,
    originalFileId: "file-1",
  }));

const renderItem = (
  item: MockGridItem,
  index: number,
  refs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  boxSelectedIds: string[],
  clearBoxSelection: () => void,
  activeDragIds: string[],
  justMoved: boolean,
  dragHandleProps?: any,
  zoomLevel?: number,
) => {
  const { ref: dndRef, ...restDragProps } = dragHandleProps ?? {};
  const isBoxSelected = boxSelectedIds.includes(item.id);
  const isDragging = activeDragIds.includes(item.id);

  return (
    <div
      ref={(element: HTMLDivElement | null) => {
        if (element) {
          refs.current.set(item.id, element);
        } else {
          refs.current.delete(item.id);
        }
        dndRef?.(element);
      }}
      {...restDragProps}
      onClick={clearBoxSelection}
      style={{
        width: `calc(10rem * ${zoomLevel ?? 1})`,
        height: `calc(13rem * ${zoomLevel ?? 1})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "0.5rem",
        border: isBoxSelected
          ? "2px solid var(--mantine-color-blue-6)"
          : "1px solid var(--mantine-color-gray-4)",
        background: isDragging
          ? "var(--mantine-color-gray-1)"
          : "var(--mantine-color-body)",
        opacity: justMoved ? 0.7 : 1,
        cursor: "grab",
      }}
    >
      Page {item.pageNumber ?? index + 1}
    </div>
  );
};

const noopReorder = () => {};

const meta = {
  title: "PageEditor/DragDropGrid",
  component: DragDropGrid,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DragDropGrid>;
export default meta;

type Story = StoryObj<typeof meta>;

const ScrollDecorator = (StoryComponent: React.ComponentType) => (
  <div
    data-scrolling-container="true"
    style={{ height: "40rem", overflow: "auto" }}
  >
    <StoryComponent />
  </div>
);

export const Default: Story = {
  args: {
    items: buildItems(8),
    onReorderPages: noopReorder,
    renderItem,
  },
  decorators: [ScrollDecorator],
};

export const Empty: Story = {
  args: {
    items: [],
    onReorderPages: noopReorder,
    renderItem,
  },
  decorators: [ScrollDecorator],
};

export const Zoomed: Story = {
  args: {
    items: buildItems(6),
    onReorderPages: noopReorder,
    renderItem,
    zoomLevel: 1.5,
  },
  decorators: [ScrollDecorator],
};
