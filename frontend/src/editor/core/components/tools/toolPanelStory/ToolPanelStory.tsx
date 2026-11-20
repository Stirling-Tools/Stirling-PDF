import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { PlatformProviders } from "@editor/components/PlatformProviders";
import { AppProviders } from "@editor/components/AppProviders";
import RightSidebar from "@editor/components/tools/RightSidebar";
import Workbench from "@editor/components/layout/Workbench";
import { useFileHandler } from "@editor/hooks/useFileHandler";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import {
  ToolPanelPreviewProvider,
  type ToolPanelPreview,
} from "@editor/contexts/ToolPanelPreviewContext";
import {
  loadFixture,
  type FixtureName,
} from "@editor/components/tools/toolPanelStory/fixtures";
import type { ToolId } from "@editor/types/toolId";
import type { WorkbenchType } from "@editor/types/workbench";
import {
  useNavigationActions,
  useNavigationState,
} from "@editor/contexts/NavigationContext";
import { clearWorkbenchSession } from "@editor/services/workbenchSession";
import { fileStorage } from "@editor/services/fileStorage";
import { automationStorage } from "@editor/services/automationStorage";
import { ensureLocalPdfAccess } from "@editor/services/pdfAccessService";
// The editor's App loads Tailwind and Storybook's preview does not; without it
// the Workbench's flex column collapses and the viewer lays out no pages.
import "@editor/styles/tailwind.css";

export interface ToolPanelStoryProps {
  toolId: ToolId;
  /** Loaded and selected in this order before the tool opens. */
  files?: readonly FixtureName[];
  /** Merged over the tool's default parameters, for settings that need input to appear. */
  parameters?: Readonly<Record<string, unknown>>;
  /**
   * File-typed parameters (a certificate, a stamp image), loaded from fixtures;
   * a list loads into a File[] parameter.
   */
  parameterFiles?: Readonly<
    Record<string, FixtureName | readonly FixtureName[]>
  >;
  /** Opens steps the tool would keep collapsed until a file or choice exists. */
  expandAllSteps?: boolean;
  /**
   * Holds the workbench at this view while the tool is open, as when the user
   * switches to it; a tool that switches away on mount is switched back.
   */
  workbench?: WorkbenchType;
  /**
   * Draws the editor's real workbench beside the panel, for panel states only
   * the viewer reaches: fields it reads, placement it arms, marks drawn on a page.
   */
  showWorkbench?: boolean;
}

/**
 * The editor's real tool panel for one tool, inside the editor's own provider
 * stack (PlatformProviders, then AppProviders): the same RightSidebar, header and
 * createToolFlow steps the editor draws. Only the inputs are staged: fixture files
 * go in through FileContext, the tool opens through the workflow, and
 * ToolPanelPreview opens what would otherwise wait on input.
 */
export function ToolPanelStory(props: ToolPanelStoryProps) {
  if (!useEmptyWorkbench()) return null;
  return (
    <PlatformProviders>
      <AppProviders>
        <StagedTool {...props}>
          <PanelFrame showWorkbench={props.showWorkbench} />
          {props.workbench && <HeldWorkbench workbench={props.workbench} />}
        </StagedTool>
      </AppProviders>
    </PlatformProviders>
  );
}

/**
 * The editor reopens the last session's files and saved automations on mount,
 * from sessionStorage and IndexedDB, so without this a story would show every
 * earlier story's files and automations beside its own.
 */
function useEmptyWorkbench(): boolean {
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let cancelled = false;
    clearWorkbenchSession();
    void Promise.all([fileStorage.clearAll(), clearSavedAutomations()]).finally(
      () => {
        if (!cancelled) setEmpty(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return empty;
}

async function clearSavedAutomations(): Promise<void> {
  const saved = await automationStorage.getAllAutomations();
  await Promise.all(
    saved.map((automation) =>
      automationStorage.deleteAutomation(automation.id),
    ),
  );
}

function HeldWorkbench({ workbench }: { workbench: WorkbenchType }) {
  const { workbench: current } = useNavigationState();
  const { actions } = useNavigationActions();
  useEffect(() => {
    if (current !== workbench) actions.setWorkbench(workbench);
  }, [current, workbench, actions]);
  return null;
}

/**
 * The editor's row of workbench and tool panel, grown to the panel's full
 * content height so a capture shows every setting rather than a scrolled window.
 * The panel's stage is absolutely positioned, so its height is read, not inherited.
 */
function PanelFrame({ showWorkbench }: { showWorkbench?: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const queriesSettled = useIsFetching() === 0;

  useEffect(() => {
    const stage =
      frameRef.current?.querySelector<HTMLElement>(".tool-panel__stage");
    if (!stage) return;
    const measure = () =>
      setHeight(stage.getBoundingClientRect().top + stage.scrollHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    for (const child of stage.querySelectorAll("*")) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      data-queries-settled={queriesSettled}
      style={{
        display: "flex",
        height: height ? `max(100vh, ${height}px)` : "100vh",
        background: "var(--c-bg)",
      }}
    >
      {/* The workbench's slot: sidebar tooltips open into it, as in the editor. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
        {showWorkbench && <Workbench />}
      </div>
      <RightSidebar />
    </div>
  );
}

function StagedTool({
  toolId,
  files = ["sample.pdf"],
  parameters,
  parameterFiles,
  expandAllSteps = true,
  children,
}: ToolPanelStoryProps & { children: ReactNode }) {
  const { addFiles } = useFileHandler();
  const { handleToolSelectForced } = useToolWorkflowActions();
  const [preview, setPreview] = useState<ToolPanelPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [documents, fileParameters] = await Promise.all([
        Promise.all(files.map(loadFixture)),
        loadParameterFiles(parameterFiles),
      ]);
      if (cancelled) return;
      if (documents.length > 0)
        await settlePdfAccess(await addFiles(documents));
      if (cancelled) return;
      // In place before the tool mounts: parameter hooks read it only for their
      // initial state.
      setPreview({
        expandAllSteps,
        parameters:
          parameters || parameterFiles
            ? { ...parameters, ...fileParameters }
            : undefined,
      });
      handleToolSelectForced(toolId);
    })();
    return () => {
      cancelled = true;
    };
    // Stage once per mount; Storybook remounts the story when its args change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!preview) return null;
  return (
    <ToolPanelPreviewProvider value={preview}>
      {children}
    </ToolPanelPreviewProvider>
  );
}

/**
 * The viewer reads each PDF's encryption and signatures as it opens it, and
 * tools that gate on that access wait for it; the story has no viewer, so the
 * staged files are read the same way here.
 */
async function settlePdfAccess(files: readonly File[]): Promise<void> {
  await Promise.all(
    files
      .filter((file) => file.type === "application/pdf")
      .map((file) => ensureLocalPdfAccess(file).catch(() => undefined)),
  );
}

async function loadParameterFiles(
  parameterFiles: ToolPanelStoryProps["parameterFiles"],
): Promise<Record<string, File | File[]>> {
  if (!parameterFiles) return {};
  const entries = await Promise.all(
    Object.entries(parameterFiles).map(
      async ([key, names]) =>
        [
          key,
          typeof names === "string"
            ? await loadFixture(names)
            : await Promise.all(names.map(loadFixture)),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}
