import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  FIXTURE_PASSWORDS,
  type EncryptedFixtureName,
} from "@editor/components/tools/toolPanelStory/fixtures";
import { PAGE_POINTER_LAYER_CLASS } from "@editor/components/viewer/ViewerPointerProviders";
import {
  loadFixture,
  type FixtureName,
} from "@editor/components/tools/toolPanelStory/fixtures";

export interface PlayContext {
  canvasElement: HTMLElement;
}

export type PanelQueries = ReturnType<typeof within>;

/**
 * Where a tooltip opens from: a step's title, a field's (i) by its accessible
 * name, any panel element by its text (a truncated name), the run button (its
 * disabled reason), or an element the story finds itself, for a trigger
 * outside the panel (a portalled popover) or a wrapper around a disabled
 * control.
 */
export type TooltipTrigger =
  | { step: string }
  | { info: string | RegExp }
  | { text: string | RegExp }
  | { runButton: true }
  | { element: (context: PlayContext) => Promise<HTMLElement> };

const PANEL = '[data-sidebar="tool-panel"]';

/**
 * For waits that span staging, a server response or an opening transition;
 * the default findBy timeout of one second is shorter than a cold story load.
 */
export const STAGE_TIMEOUT = { timeout: 20000 };

/**
 * Resolves once the staged tool has slid over the tool picker, drawn its
 * content and heard back from every server read it started, so the a11y scan
 * and any capture see the finished panel rather than one with its files still
 * loading or its settings disabled while the endpoint check is in flight.
 */
export async function waitForToolPanel({
  canvasElement,
}: PlayContext): Promise<HTMLElement> {
  const findReadyPanel = () => {
    const panel = canvasElement.ownerDocument.querySelector<HTMLElement>(PANEL);
    expect(panel).not.toBeNull();
    expect(panel!.querySelector(".tool-panel__picker-layer")).toBeNull();
    const content = panel!.querySelector(
      ".tool-panel__tool-layer .mantine-ScrollArea-viewport",
    );
    expect(content?.textContent ?? "").toMatch(/\S/);
    expect(content!.textContent).not.toMatch(/Loading/);
    expect(panel!.closest('[data-queries-settled="true"]')).not.toBeNull();
    return panel!;
  };
  for (let attempt = 1; ; attempt++) {
    const panel = await waitFor(findReadyPanel, STAGE_TIMEOUT);
    // React Query reports a fetch one task after the component that starts it
    // renders, so a panel can read as settled for that task before its first
    // server read begins; ready means still ready once that report is in.
    await nextTask();
    try {
      findReadyPanel();
      return panel;
    } catch (error) {
      if (attempt === MAX_SETTLE_ATTEMPTS) throw error;
    }
  }
}

const MAX_SETTLE_ATTEMPTS = 5;

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Play function that waits for `text`, for a state a server response draws late. */
export function untilPanelShows(text: string | RegExp) {
  return async (context: PlayContext): Promise<void> => {
    await waitForPanelText(context, text);
  };
}

/** The panel's queries once `text` is showing, for content a server response or a click draws late. */
export async function waitForPanelText(
  context: PlayContext,
  text: string | RegExp,
): Promise<PanelQueries> {
  const panel = within(await waitForToolPanel(context));
  await expect(
    await panel.findByText(text, undefined, STAGE_TIMEOUT),
  ).toBeVisible();
  return panel;
}

/**
 * Picks each radio option in turn (a mode switch, then the choice it reveals),
 * waiting for it to enable and take the check, since a click on a control the
 * panel has not enabled yet is dropped.
 */
export async function choose(
  context: PlayContext,
  ...options: (string | RegExp)[]
): Promise<PanelQueries> {
  const panel = within(await waitForToolPanel(context));
  for (const option of options) {
    const radio = await panel.findByRole(
      "radio",
      { name: option },
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(radio).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.click(radio);
    await waitFor(() => expect(radio).toBeChecked());
  }
  return panel;
}

async function findRunButton(context: PlayContext): Promise<HTMLElement> {
  const panel = await waitForToolPanel(context);
  return waitFor(() => {
    const button = panel.querySelector<HTMLElement>('[data-tour="run-button"]');
    expect(button).not.toBeNull();
    return button!;
  }, STAGE_TIMEOUT);
}

/**
 * Opens a collapsed step by clicking its header, as a user does. A step the
 * tool keeps closed until it has input stays closed; give it the input first.
 */
export async function openStep(
  context: PlayContext,
  title: string,
): Promise<PanelQueries> {
  const panel = within(await waitForToolPanel(context));
  const header = await panel.findByText(title, { exact: true }, STAGE_TIMEOUT);
  await userEvent.click(header);
  return within(await waitForToolPanel(context));
}

/**
 * Puts fixture files into one of the panel's own file inputs, the way a file
 * picked in the dialog arrives, so the tool reads them through its real
 * handler. `nth` picks among several inputs in panel order.
 */
export async function uploadToPanel(
  context: PlayContext,
  fixtures: FixtureName | readonly FixtureName[],
  nth = 0,
): Promise<PanelQueries> {
  const panelElement = await waitForToolPanel(context);
  const input = await waitFor(() => {
    const found =
      panelElement.querySelectorAll<HTMLInputElement>('input[type="file"]')[
        nth
      ];
    expect(found).toBeDefined();
    return found!;
  }, STAGE_TIMEOUT);
  const names = typeof fixtures === "string" ? [fixtures] : fixtures;
  await userEvent.upload(input, await Promise.all(names.map(loadFixture)));
  return within(await waitForToolPanel(context));
}

/** Clicks the tool's run button once it is enabled. */
export async function runTool(context: PlayContext): Promise<PanelQueries> {
  const run = await findRunButton(context);
  await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(run);
  return within(await waitForToolPanel(context));
}

/** Opens a panel menu from its trigger button and resolves with the open menu. */
export async function openMenu(
  context: PlayContext,
  trigger: string | RegExp,
): Promise<HTMLElement> {
  const panel = within(await waitForToolPanel(context));
  const button = await panel.findByRole(
    "button",
    { name: trigger },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(button).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(button);
  return within(context.canvasElement.ownerDocument.body).findByRole(
    "menu",
    {},
    STAGE_TIMEOUT,
  );
}

/** A point on a page element, as fractions of its width and height from its top left. */
export interface PagePoint {
  x: number;
  y: number;
}

const PAGE_POINTER_LAYER = `.${PAGE_POINTER_LAYER_CLASS}`;

/**
 * The first element matching `selector` (by default the layer a page takes
 * pointer input on) once the viewer has laid it out. Only a story with
 * `showWorkbench` and the viewer workbench draws pages.
 */
export function findPageElement(
  { canvasElement }: PlayContext,
  selector = PAGE_POINTER_LAYER,
): Promise<HTMLElement> {
  return waitFor(() => {
    const element =
      canvasElement.ownerDocument.querySelector<HTMLElement>(selector);
    expect(element?.getBoundingClientRect().height).toBeGreaterThan(0);
    return element!;
  }, STAGE_TIMEOUT);
}

async function scrolledPageElement(
  context: PlayContext,
  selector: string,
): Promise<HTMLElement> {
  const element = await findPageElement(context, selector);
  element.scrollIntoView({ block: "center" });
  return element;
}

function pageCoords(element: HTMLElement, { x, y }: PagePoint) {
  const box = element.getBoundingClientRect();
  return {
    clientX: box.left + box.width * x,
    clientY: box.top + box.height * y,
  };
}

/** Moves the pointer to `at` on a page and clicks there, as a user places something. */
export async function clickPage(
  context: PlayContext,
  at: PagePoint,
  selector = PAGE_POINTER_LAYER,
): Promise<void> {
  const target = await scrolledPageElement(context, selector);
  const coords = pageCoords(target, at);
  await userEvent.pointer([
    { target, coords },
    { keys: "[MouseLeft]", target, coords },
  ]);
}

/** Presses at `from`, drags through the midpoint to `to` and releases, as a user draws a box. */
export async function dragOnPage(
  context: PlayContext,
  from: PagePoint,
  to: PagePoint,
  selector = PAGE_POINTER_LAYER,
): Promise<void> {
  const target = await scrolledPageElement(context, selector);
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const end = pageCoords(target, to);
  await userEvent.pointer([
    { keys: "[MouseLeft>]", target, coords: pageCoords(target, from) },
    { target, coords: pageCoords(target, midpoint) },
    { target, coords: end },
    { keys: "[/MouseLeft]", target, coords: end },
  ]);
}

/**
 * Turns on placement in a stamp-style settings panel (Add Text, Add Image) and
 * resolves once it reads "Pause placement". The toggle drives tools the viewer
 * creates once it has drawn a page, so a click before then is dropped.
 */
export async function armPlacement(
  context: PlayContext,
): Promise<PanelQueries> {
  await findPageElement(context);
  const panel = within(await waitForToolPanel(context));
  // The panel arms itself on a short timer after a settings change, and React
  // keeps the same button node, so a click on "Resume placement" can land
  // after it has become "Pause placement" and pause again: re-read and retry.
  await waitFor(async () => {
    if (panel.queryByRole("button", { name: "Pause placement" })) return;
    const resume = panel.getByRole("button", { name: "Resume placement" });
    expect(resume).toBeEnabled();
    await userEvent.click(resume);
    expect(
      panel.getByRole("button", { name: "Pause placement" }),
    ).toBeInTheDocument();
  }, STAGE_TIMEOUT);
  return panel;
}

/**
 * Readies placement with `arm`, clicks a third of the way down the first page
 * and resolves once the panel's Undo is enabled, which is when the placed
 * object is in the viewer's history.
 */
export async function placeOnPage(
  context: PlayContext,
  arm: (context: PlayContext) => Promise<PanelQueries>,
): Promise<PanelQueries> {
  const panel = await arm(context);
  await clickPage(context, { x: 0.5, y: 1 / 3 });
  await waitFor(
    () => expect(panel.getByRole("button", { name: "Undo" })).toBeEnabled(),
    STAGE_TIMEOUT,
  );
  return panel;
}

/** Clicks the panel's Undo once it is enabled and resolves once Redo is. */
export async function undoInPanel(panel: PanelQueries): Promise<void> {
  const undo = panel.getByRole("button", { name: "Undo" });
  await waitFor(() => expect(undo).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(undo);
  await waitFor(
    () => expect(panel.getByRole("button", { name: "Redo" })).toBeEnabled(),
    STAGE_TIMEOUT,
  );
}

/**
 * Enters an encrypted fixture's password in the editor's own unlock prompt.
 * Staging waits on that prompt, so a story that loads one opens no panel
 * until this has run.
 */
export async function unlockEncryptedPdf(
  context: PlayContext,
  fixture: EncryptedFixtureName = "encrypted.pdf",
): Promise<void> {
  const dialog = within(
    await within(context.canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: /Open PDF/ },
      STAGE_TIMEOUT,
    ),
  );
  const password = dialog.getByLabelText("Password to open", { exact: true });
  await waitFor(() => expect(password).toBeVisible(), STAGE_TIMEOUT);
  await userEvent.type(password, FIXTURE_PASSWORDS[fixture]);
  const open = await dialog.findByRole("button", { name: "Open PDF" });
  await waitFor(() => expect(open).toBeEnabled());
  await userEvent.click(open);
  await waitForToolPanel(context);
}

/**
 * A step title can share its text with the tool header or the run button; only
 * the step's title carries the (i) its tooltip opens from.
 */
function findStepTitle(panel: PanelQueries, title: string) {
  return waitFor(() => {
    const stepTitle = panel
      .getAllByText(title, { exact: true })
      .find((element: HTMLElement) =>
        element.parentElement?.querySelector(".sui-info"),
      );
    expect(stepTitle).toBeDefined();
    return stepTitle!;
  }, STAGE_TIMEOUT);
}

async function findTrigger(
  context: PlayContext,
  trigger: TooltipTrigger,
): Promise<HTMLElement> {
  if ("element" in trigger) return trigger.element(context);
  // A disabled button takes no pointer events; its tooltip hangs on the wrapper.
  if ("runButton" in trigger)
    return (await findRunButton(context)).parentElement!;
  const panel = within(await waitForToolPanel(context));
  if ("step" in trigger) return findStepTitle(panel, trigger.step);
  if ("info" in trigger)
    return panel.findByRole("button", { name: trigger.info }, STAGE_TIMEOUT);
  return panel.findByText(trigger.text, undefined, STAGE_TIMEOUT);
}

/**
 * The open tooltip: the app's Tooltip carries role="tooltip", Mantine's
 * Tooltip only its class.
 */
function openTooltipElement(document: Document): HTMLElement {
  const tooltip = document.querySelector<HTMLElement>(
    '[role="tooltip"], .mantine-Tooltip-tooltip',
  );
  expect(tooltip).toBeVisible();
  return tooltip!;
}

/**
 * Play function that opens one tooltip the way a user does, by hovering its
 * trigger, so the capture shows the tooltip the editor draws. `after` first
 * brings the panel to the state that shows the trigger.
 */
export function openTooltip(
  trigger: TooltipTrigger,
  { after }: { after?: (context: PlayContext) => Promise<unknown> } = {},
) {
  return async (context: PlayContext): Promise<void> => {
    await after?.(context);
    const target = await findTrigger(context, trigger);
    target.scrollIntoView({ block: "center" });
    await userEvent.hover(target);
    await waitFor(
      () => openTooltipElement(context.canvasElement.ownerDocument),
      STAGE_TIMEOUT,
    );
  };
}
