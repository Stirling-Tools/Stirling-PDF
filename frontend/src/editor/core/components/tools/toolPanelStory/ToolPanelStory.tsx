import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useIsFetching } from "@tanstack/react-query";
import { PlatformProviders } from "@editor/components/PlatformProviders";
import { AppProviders } from "@editor/components/AppProviders";
import RightSidebar from "@editor/components/tools/RightSidebar";
import Workbench from "@editor/components/layout/Workbench";
import FileManager from "@editor/components/FileManager";
import { FilesPageProvider } from "@editor/contexts/FilesPageContext";
import { useFileHandler } from "@editor/hooks/useFileHandler";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
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
import { usePublishToolEndpoints } from "@editor/components/tools/toolPanelStory/serverEndpoints";
import {
  FreshLaunch,
  forgetEarlierStories,
} from "@editor/components/tools/toolPanelStory/freshLaunch";
// The editor's App loads Tailwind and Storybook's preview does not; without it
// the Workbench's flex column collapses and the viewer lays out no pages.
import "@editor/styles/tailwind.css";
import classes from "@editor/components/tools/toolPanelStory/ToolPanelStory.module.css";

export interface ToolPanelStoryProps {
  toolId: ToolId;
  /** Loaded and selected in this order before the tool opens. */
  files?: readonly FixtureName[];
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
  /**
   * Mounts the editor's Files modal, for a panel whose own file picker opens
   * it (Overlay PDFs' "Choose PDF(s)..."). Off by default: the modal reads the
   * file library from IndexedDB on mount.
   */
  filesModal?: boolean;
}

const DEFAULT_FILES: readonly FixtureName[] = ["sample.pdf"];

/**
 * The editor's real tool panel for one tool, inside the editor's own provider
 * stack (PlatformProviders, then AppProviders): the same RightSidebar, header and
 * createToolFlow steps the editor draws. Only the inputs are staged: fixture files
 * go in through FileContext and the tool opens through the workflow. Everything
 * after that is reached the way a user reaches it, from the story's play.
 */
export function ToolPanelStory(props: ToolPanelStoryProps) {
  // Storybook re-renders on an args change without remounting, and staging
  // runs once per mount, so new files or a new tool get a fresh editor.
  const staging = `${props.toolId}:${(props.files ?? DEFAULT_FILES).join("|")}`;
  return <StagedEditor key={staging} {...props} />;
}

function StagedEditor(props: ToolPanelStoryProps) {
  // Once per mount, before the providers below mount and read any cache.
  useState(forgetEarlierStories);
  if (!useEmptyWorkbench()) return null;
  return (
    <PlatformProviders>
      <AppProviders>
        <ToolEndpointsPublisher />
        <FreshLaunch />
        <StagedTool {...props}>
          {props.filesModal ? (
            <FilesPageProvider>
              <PanelFrame showWorkbench={props.showWorkbench} />
              <FileManager />
            </FilesPageProvider>
          ) : (
            <PanelFrame showWorkbench={props.showWorkbench} />
          )}
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

function ToolEndpointsPublisher() {
  usePublishToolEndpoints();
  return null;
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
 * A story shows one tool, so closing it would leave the tool picker in its
 * place. The close button stays drawn; the stylesheet stops pointer clicks and
 * this stops the click a keyboard press fires.
 */
function ignoreToolClose(event: MouseEvent<HTMLDivElement>) {
  if (
    event.target instanceof Element &&
    event.target.closest(".sui-panelhdr__close")
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
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
      className={classes.frame}
      data-queries-settled={queriesSettled}
      onClickCapture={ignoreToolClose}
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
  files = DEFAULT_FILES,
  children,
}: ToolPanelStoryProps & { children: ReactNode }) {
  const { addFiles } = useFileHandler();
  const { handleToolSelectForced } = useToolWorkflowActions();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const documents = await Promise.all(files.map(loadFixture));
      if (cancelled) return;
      if (documents.length > 0)
        await settlePdfAccess(await addFiles(documents));
      if (cancelled) return;
      handleToolSelectForced(toolId);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Stage once per mount; ToolPanelStory remounts this when the args change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready ? children : null;
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
