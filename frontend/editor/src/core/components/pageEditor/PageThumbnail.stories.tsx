import type { Meta, StoryObj, Decorator } from "@storybook/react-vite";
import PageThumbnail from "@app/components/pageEditor/PageThumbnail";
import { AppProviders } from "@app/components/AppProviders";
import type { PDFPage, PDFDocument } from "@app/types/pageEditor";

const buildPage = (overrides: Partial<PDFPage> = {}): PDFPage => ({
  id: "page-1",
  pageNumber: 1,
  originalPageNumber: 1,
  thumbnail: null,
  rotation: 0,
  selected: false,
  ...overrides,
});

const buildDocument = (pages: PDFPage[]): PDFDocument => ({
  id: "doc-1",
  name: "annual-report.pdf",
  file: new File(["dummy"], "annual-report.pdf", { type: "application/pdf" }),
  pages,
  totalPages: pages.length,
});

const noop = () => {};
const noopCommand = { execute: noop };

// PageThumbnail's "Insert File After" hover action reads openFilesModal from
// FilesModalContext, which is only available inside the full provider tree —
// mount that here with the network fetch + blocking gate disabled so the
// story renders immediately.
const withAppProviders: Decorator = (Story) => (
  <AppProviders
    appConfigProviderProps={{
      initialConfig: {},
      bootstrapMode: "non-blocking",
      autoFetch: false,
    }}
  >
    <Story />
  </AppProviders>
);

const meta = {
  title: "PageEditor/PageThumbnail",
  component: PageThumbnail,
  decorators: [withAppProviders],
} satisfies Meta<typeof PageThumbnail>;
export default meta;
type Story = StoryObj<typeof meta>;

const page = buildPage();
const pdfDocument = buildDocument([page]);

export const Default: Story = {
  args: {
    page,
    index: 0,
    totalPages: 1,
    fileColorIndex: 0,
    selectedPageIds: [],
    selectionMode: false,
    movingPage: null,
    isAnimating: false,
    activeDragIds: [],
    pageRefs: { current: new Map() },
    onReorderPages: noop,
    onTogglePage: noop,
    onAnimateReorder: noop,
    onExecuteCommand: noop,
    onSetStatus: noop,
    onSetMovingPage: noop,
    onDeletePage: noop,
    createRotateCommand: () => noopCommand,
    createDeleteCommand: () => noopCommand,
    createSplitCommand: () => noopCommand,
    pdfDocument,
    setPdfDocument: noop,
    splitPositions: new Set(),
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    selectedPageIds: [page.id],
    selectionMode: true,
  },
};

export const BlankPage: Story = {
  args: {
    ...Default.args,
    page: buildPage({ id: "page-2", isBlankPage: true }),
  },
};
