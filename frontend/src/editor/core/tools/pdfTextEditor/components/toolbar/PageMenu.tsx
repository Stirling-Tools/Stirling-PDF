import { useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Group, Menu, Stack, Text, type PopoverProps } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PAGE_SIZES as PAGE_SIZE_POINTS } from "@editor/constants/pageSizeConstants";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import {
  useEditorState,
  useSharedEditorStore,
} from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import { visiblePageIndex } from "@editor/tools/pdfTextEditor/util/dom";
import type {
  DocumentChange,
  PageOrientation,
  PageSizeName,
} from "@editor/tools/pdfTextEditor/util/documentChanges";
import {
  pageSetupRequest,
  usePageSetupRequest,
} from "@editor/tools/pdfTextEditor/store/pageSetupRequest";
import {
  BlockHeading,
  ChangeButton,
  ChangePopover,
} from "@editor/tools/pdfTextEditor/components/inspector/ChangeControls";
import { Field } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  ToolbarMenu,
  type ToolbarMenuPosition,
} from "@editor/tools/pdfTextEditor/components/toolbar/ToolbarMenu";
import { localPaperSize, orderPaperSizeOptions } from "@editor/utils/paperSize";

const PAGE_SIZES: PageSizeName[] = ["A4", "LETTER", "LEGAL", "A5", "A3"];

const SIZE_TOLERANCE_PT = 2;

const PAGE_SETUP_WIDTH = 380;

const VIEWER_EDGE_PX = 8;

function namedSize(width: number, height: number): PageSizeName | null {
  const [short, long] = width < height ? [width, height] : [height, width];
  return (
    PAGE_SIZES.find(
      (name) =>
        Math.abs(PAGE_SIZE_POINTS[name].width - short) <= SIZE_TOLERANCE_PT &&
        Math.abs(PAGE_SIZE_POINTS[name].height - long) <= SIZE_TOLERANCE_PT,
    ) ?? null
  );
}

type PageActionId = "add" | "duplicate" | "delete";

const PAGE_ACTIONS: Array<{
  id: PageActionId;
  icon: IconName;
  change: (page: number) => DocumentChange;
}> = [
  {
    id: "add",
    icon: "file-plus",
    change: (p) => ({ kind: "addPage", after: p }),
  },
  {
    id: "duplicate",
    icon: "copy-plus",
    change: (page) => ({ kind: "duplicatePage", page }),
  },
  {
    id: "delete",
    icon: "file-minus",
    change: (page) => ({ kind: "deletePage", page }),
  },
];

export function PageMenuItems({
  pageAt,
  onPageSetup,
}: {
  pageAt: () => number;
  onPageSetup: (pageIndex: number) => void;
}) {
  const { t } = useTranslation();
  const change = useEditorSession()?.changeDocument;
  const pageCount = useEditorState(useSharedEditorStore(), (s) => s.pageCount);
  const labels: Record<PageActionId, string> = {
    add: t("pdfTextEditor.pages.add", "Add a page after this one"),
    duplicate: t("pdfTextEditor.pages.duplicate", "Duplicate this page"),
    delete: t("pdfTextEditor.pages.delete", "Delete this page"),
  };
  return (
    <>
      <Menu.Label>{t("pdfTextEditor.pages.label", "Page")}</Menu.Label>
      {PAGE_ACTIONS.map((action) => (
        <Menu.Item
          key={action.id}
          leftSection={<Icon name={action.icon} size={18} />}
          disabled={!change || (action.id === "delete" && pageCount <= 1)}
          color={action.id === "delete" ? "red" : undefined}
          onClick={() => void change?.(action.change(pageAt()))}
          data-testid={`pdf-editor-page-${action.id}`}
        >
          {labels[action.id]}
        </Menu.Item>
      ))}
      <Menu.Item
        leftSection={<Icon name="file-sliders" size={18} />}
        disabled={!change}
        onClick={() => onPageSetup(pageAt())}
        data-testid="pdf-editor-page-setup"
      >
        {t("pdfTextEditor.pages.setup", "Page size and orientation…")}
      </Menu.Item>
    </>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <Field label={label}>
      <SegmentedControl
        ariaLabel={label}
        options={options}
        value={value}
        onChange={onChange}
        fullWidth
      />
    </Field>
  );
}

function PageSetupPanel({
  pageIndex,
  onClose,
}: {
  pageIndex: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const [initial] = useState(() => {
    const current = session?.pageSize(pageIndex);
    const named = current
      ? namedSize(current.width, current.height)
      : localPaperSize<PageSizeName>("A4", "LETTER");
    const orientation: PageOrientation =
      current && current.width > current.height ? "landscape" : "portrait";
    return {
      size: named ?? ("current" as const),
      ownSizeNamed: named !== null,
      orientation,
    };
  });
  const [size, setSize] = useState<PageSizeName | "current">(initial.size);
  const [orientation, setOrientation] = useState<PageOrientation>(
    initial.orientation,
  );
  const [scope, setScope] = useState<"page" | "all">("page");
  const sizeNames: Record<PageSizeName | "current", string> = {
    current: t("pdfTextEditor.pages.sizeCurrent", "Current"),
    A4: "A4",
    LETTER: t("pdfTextEditor.pages.sizeLetter", "Letter"),
    LEGAL: t("pdfTextEditor.pages.sizeLegal", "Legal"),
    A5: "A5",
    A3: "A3",
  };
  const apply = () => {
    onClose();
    void session?.changeDocument({
      kind: "pageSetup",
      pages: scope === "all" ? "all" : pageIndex,
      inView: pageIndex,
      size,
      orientation,
    });
  };
  return (
    <Stack gap="sm" data-testid="pdf-editor-page-setup-panel">
      <div>
        <Text size="sm" fw={600}>
          {t("pdfTextEditor.pages.setupTitle", "Page setup")}
        </Text>
        <Text size="xs" c="dimmed">
          {t(
            "pdfTextEditor.pages.setupSubtitle",
            "Content keeps its place from the top of the page.",
          )}
        </Text>
      </div>
      <Stack gap="xs">
        <Choice
          label={t("pdfTextEditor.pages.size", "Page size")}
          options={orderPaperSizeOptions(
            [
              ...(initial.ownSizeNamed ? [] : (["current"] as const)),
              ...PAGE_SIZES,
            ].map((value) => ({ value, label: sizeNames[value] })),
          )}
          value={size}
          onChange={setSize}
        />
        <Choice
          label={t("pdfTextEditor.pages.orientation", "Orientation")}
          options={[
            {
              value: "portrait",
              label: t("pdfTextEditor.pages.portrait", "Portrait"),
            },
            {
              value: "landscape",
              label: t("pdfTextEditor.pages.landscape", "Landscape"),
            },
          ]}
          value={orientation}
          onChange={setOrientation}
        />
        <Choice
          label={t("pdfTextEditor.pages.applyTo", "Apply to")}
          options={[
            {
              value: "page",
              label: t("pdfTextEditor.pages.thisPage", "This page"),
            },
            {
              value: "all",
              label: t("pdfTextEditor.pages.allPages", "All pages"),
            },
          ]}
          value={scope}
          onChange={setScope}
        />
      </Stack>
      <Group gap="xs" justify="flex-end">
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          onClick={onClose}
          data-testid="pdf-editor-page-setup-cancel"
        >
          {t("cancel", "Cancel")}
        </Button>
        <Button
          size="sm"
          onClick={apply}
          data-testid="pdf-editor-page-setup-apply"
        >
          {t("pdfTextEditor.pages.apply", "Apply")}
        </Button>
      </Group>
    </Stack>
  );
}

function PageSetupPopover({
  pageIndex,
  onClose,
  anchor,
  position,
  middlewares,
}: {
  pageIndex: number | null;
  onClose: () => void;
  anchor: ReactNode;
  position?: PopoverProps["position"];
  middlewares?: PopoverProps["middlewares"];
}) {
  return (
    <ChangePopover
      opened={pageIndex !== null}
      width={PAGE_SETUP_WIDTH}
      anchor={anchor}
      position={position}
      middlewares={middlewares}
    >
      {pageIndex !== null && (
        <PageSetupPanel
          key={pageIndex}
          pageIndex={pageIndex}
          onClose={onClose}
        />
      )}
    </ChangePopover>
  );
}

export function PagesMenu({
  disabled = false,
  target,
  position = "bottom-start",
}: {
  disabled?: boolean;
  target?: ReactElement;
  position?: ToolbarMenuPosition;
}) {
  const { t } = useTranslation();
  const [setupPage, setSetupPage] = useState<number | null>(null);
  return (
    <PageSetupPopover
      pageIndex={setupPage}
      onClose={() => setSetupPage(null)}
      anchor={
        <ToolbarMenu
          label={t("pdfTextEditor.pages.menu", "Pages")}
          icon="files"
          testId="pdf-editor-pages"
          disabled={disabled}
          position={position}
          target={target}
        >
          <PageMenuItems pageAt={visiblePageIndex} onPageSetup={setSetupPage} />
        </ToolbarMenu>
      }
    />
  );
}

export function PagesBlock() {
  const { t } = useTranslation();
  const pageCount = useEditorState(useSharedEditorStore(), (s) => s.pageCount);
  const [setupPage, setSetupPage] = useState<number | null>(null);
  const [menuOpened, setMenuOpened] = useState(false);
  return (
    <div data-testid="pdf-editor-pages-panel">
      <PageSetupPopover
        pageIndex={setupPage}
        onClose={() => setSetupPage(null)}
        anchor={
          <BlockHeading
            action={
              <Menu
                shadow="md"
                position="bottom-end"
                width={240}
                opened={menuOpened}
                onChange={setMenuOpened}
              >
                <Menu.Target>
                  <ChangeButton
                    label={t("pdfTextEditor.pages.actions", "Change pages")}
                    testId="pdf-editor-pages"
                    menuOpened={menuOpened}
                  />
                </Menu.Target>
                <Menu.Dropdown>
                  <PageMenuItems
                    pageAt={visiblePageIndex}
                    onPageSetup={setSetupPage}
                  />
                </Menu.Dropdown>
              </Menu>
            }
          >
            {t("pdfTextEditor.pages.menu", "Pages")} · {pageCount}
          </BlockHeading>
        }
      />
    </div>
  );
}

export function PageSetupHost() {
  const request = usePageSetupRequest();
  if (!request) return null;
  const viewer = document.querySelector("[data-viewer-pages]");
  const within = {
    boundary: viewer ?? ("clippingAncestors" as const),
    padding: VIEWER_EDGE_PX,
  };
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: request.clientX,
        top: request.clientY,
      }}
    >
      <PageSetupPopover
        pageIndex={request.pageIndex}
        onClose={() => pageSetupRequest.close()}
        anchor={<div style={{ width: 0, height: 0 }} />}
        position="bottom-start"
        middlewares={{ flip: within, shift: within }}
      />
    </div>,
    document.body,
  );
}
