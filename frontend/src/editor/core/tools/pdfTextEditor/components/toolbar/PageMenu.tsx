import { useEffect, useState, type ReactElement } from "react";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PAGE_SIZES as PAGE_SIZE_POINTS } from "@editor/constants/pageSizeConstants";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { Modal } from "@editor/ui/Modal";
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
import { ToolbarMenu } from "@editor/tools/pdfTextEditor/components/toolbar/ToolbarMenu";
import "@editor/tools/pdfTextEditor/components/toolbar/PageMenu.css";

const PAGE_SIZES: PageSizeName[] = ["A4", "LETTER", "LEGAL", "A5", "A3"];

const SIZE_TOLERANCE_PT = 2;

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

export function PageMenuItems({ onPageSetup }: { onPageSetup: () => void }) {
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
          onClick={() => void change?.(action.change(visiblePageIndex()))}
          data-testid={`pdf-editor-page-${action.id}`}
        >
          {labels[action.id]}
        </Menu.Item>
      ))}
      <Menu.Item
        leftSection={<Icon name="file-sliders" size={18} />}
        disabled={!change}
        onClick={onPageSetup}
        data-testid="pdf-editor-page-setup"
      >
        {t("pdfTextEditor.pages.setup", "Page size and orientation…")}
      </Menu.Item>
    </>
  );
}

export function usePageSetup(): { open: () => void; modal: ReactElement } {
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    modal: <PageSetupModal open={open} onClose={() => setOpen(false)} />,
  };
}

export function PagesMenu({
  disabled = false,
  target,
  position = "bottom-start",
}: {
  disabled?: boolean;
  target?: ReactElement;
  position?: "bottom-start" | "top";
}) {
  const { t } = useTranslation();
  const setup = usePageSetup();
  return (
    <>
      <ToolbarMenu
        label={t("pdfTextEditor.pages.menu", "Pages")}
        icon="files"
        testId="pdf-editor-pages"
        disabled={disabled}
        position={position}
        target={target}
      >
        <PageMenuItems onPageSetup={setup.open} />
      </ToolbarMenu>
      {setup.modal}
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
    <>
      <span className="pdf-editor-page-setup__label">{label}</span>
      <SegmentedControl
        ariaLabel={label}
        options={options}
        value={value}
        onChange={onChange}
        fullWidth
      />
    </>
  );
}

function PageSetupModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const [size, setSize] = useState<PageSizeName | "current">("A4");
  const [ownSizeNamed, setOwnSizeNamed] = useState(true);
  const [orientation, setOrientation] = useState<PageOrientation>("portrait");
  const [scope, setScope] = useState<"page" | "all">("page");
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    if (!open) return;
    setScope("page");
    const shown = visiblePageIndex();
    setPageIndex(shown);
    const current = session?.pageSize(shown);
    if (!current) return;
    setOrientation(current.width > current.height ? "landscape" : "portrait");
    const named = namedSize(current.width, current.height);
    setOwnSizeNamed(named !== null);
    setSize(named ?? "current");
  }, [open, session]);
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
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={t("pdfTextEditor.pages.setupTitle", "Page setup")}
      subtitle={t(
        "pdfTextEditor.pages.setupSubtitle",
        "Content keeps its place from the top of the page.",
      )}
      footer={
        <Button onClick={apply} data-testid="pdf-editor-page-setup-apply">
          {t("pdfTextEditor.pages.apply", "Apply")}
        </Button>
      }
    >
      <div className="pdf-editor-page-setup">
        <Choice
          label={t("pdfTextEditor.pages.size", "Page size")}
          options={[
            ...(ownSizeNamed ? [] : (["current"] as const)),
            ...PAGE_SIZES,
          ].map((value) => ({ value, label: sizeNames[value] }))}
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
      </div>
    </Modal>
  );
}
