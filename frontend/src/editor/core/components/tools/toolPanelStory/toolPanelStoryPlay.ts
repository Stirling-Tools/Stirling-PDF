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
 * A full-suite CI shard takes over 20 seconds on its slowest stories. Keep it
 * under the Storybook project's testTimeout, or a slow story times out with no
 * message instead of naming the element it waited for.
 */
export const STAGE_TIMEOUT = { timeout: 40000 };

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

/** The tool's run button, whatever the tool labels it. */
export async function findRunButton(
  context: PlayContext,
): Promise<HTMLElement> {
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
 * Puts files into one of the panel's own file inputs, the way a file picked in
 * the dialog arrives, so the tool reads them through its real handler. Takes
 * fixture names, or Files a story builds itself. `nth` picks among several
 * inputs in panel order.
 */
export async function uploadToPanel(
  context: PlayContext,
  files: FixtureName | File | readonly (FixtureName | File)[],
  nth = 0,
): Promise<PanelQueries> {
  const panelElement = await waitForToolPanel(context);
  const input = await waitFor(() => {
    const found =
      panelElement.querySelectorAll<HTMLInputElement>('input[type="file"]')[
        nth
      ];
    expect(found).toBeDefined();
    return found;
  }, STAGE_TIMEOUT);
  const list =
    typeof files === "string" || files instanceof File ? [files] : files;
  await userEvent.upload(
    input,
    await Promise.all(
      list.map((file: FixtureName | File) =>
        file instanceof File ? file : loadFixture(file),
      ),
    ),
  );
  return within(await waitForToolPanel(context));
}

/** Clicks the tool's run button once it is enabled. */
export async function runTool(context: PlayContext): Promise<PanelQueries> {
  await startTool(context);
  return within(await waitForToolPanel(context));
}

/**
 * Runs the tool and resolves once the review step shows its result: Undo, or
 * the download button a tool without Undo shows.
 */
export async function runToResults(
  context: PlayContext,
): Promise<PanelQueries> {
  const run = await findRunButton(context);
  const panel = within(run.closest<HTMLElement>(PANEL)!);
  // The run button can enable a moment before the tool has its files, and a
  // click then does nothing, so click again while it still offers to run. A
  // run in flight disables it, so a started run is never clicked twice.
  await waitFor(async () => {
    const result =
      panel.queryByRole("button", { name: "Undo" }) ??
      panel.queryByTestId("download-result-button");
    if (!result && run.isConnected && !run.hasAttribute("disabled"))
      await userEvent.click(run);
    expect(result).toBeVisible();
  }, STAGE_TIMEOUT);
  return panel;
}

/**
 * Clicks the run button once it is enabled and resolves without waiting for
 * the panel to settle, for a story that shows the run in flight: a settled
 * panel has no "Loading" text, which a running one does.
 */
export async function startTool(context: PlayContext): Promise<PanelQueries> {
  const run = await findRunButton(context);
  await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(run);
  return within(run.closest<HTMLElement>(PANEL)!);
}

/** Queries over the whole document, for menus, listboxes and dialogs the panel portals out. */
export function bodyOf(context: PlayContext): PanelQueries {
  return within(context.canvasElement.ownerDocument.body);
}

/** Queries over the panel once it has settled. */
export async function panelOf(context: PlayContext): Promise<PanelQueries> {
  return within(await waitForToolPanel(context));
}

/** The panel control with `role` and accessible `name`, once it is enabled. */
export async function findEnabled(
  context: PlayContext,
  role: "button" | "textbox" | "checkbox" | "switch",
  name: string | RegExp,
): Promise<HTMLElement> {
  const panel = await panelOf(context);
  const control = await panel.findByRole(role, { name }, STAGE_TIMEOUT);
  await waitFor(() => expect(control).toBeEnabled(), STAGE_TIMEOUT);
  return control;
}

/** Clicks a panel checkbox or switch and resolves once it has taken the new state. */
export async function toggle(
  context: PlayContext,
  role: "checkbox" | "switch",
  name: string | RegExp,
): Promise<PanelQueries> {
  const control = await findEnabled(context, role, name);
  if (!(control instanceof HTMLInputElement))
    throw new Error(`${role} "${String(name)}" is not an input`);
  const wasChecked = control.checked;
  await userEvent.click(control);
  await waitFor(() => expect(control.checked).toBe(!wasChecked));
  return panelOf(context);
}

/** Replaces the text in the panel's textbox named `name` and resolves with it. */
export async function typeInto(
  context: PlayContext,
  name: string | RegExp,
  text: string,
): Promise<HTMLElement> {
  const input = await findEnabled(context, "textbox", name);
  await userEvent.clear(input);
  await userEvent.type(input, text);
  return input;
}

/**
 * Opens the panel's ColorInput named `name` and resolves with its picker,
 * which Mantine portals out of the panel and fades in.
 */
export async function openColorPicker(
  context: PlayContext,
  name: string | RegExp,
): Promise<HTMLElement> {
  await userEvent.click(await findEnabled(context, "textbox", name));
  return waitFor(() => {
    const picker = context.canvasElement.ownerDocument.querySelector(
      ".mantine-ColorInput-dropdown",
    );
    if (!(picker instanceof HTMLElement))
      throw new Error("The colour picker has not opened");
    expect(picker).toBeVisible();
    return picker;
  }, STAGE_TIMEOUT);
}

/**
 * Opens the panel's Select named `name` once it is enabled and resolves with
 * its listbox once open, which Mantine portals out of the panel. Found through the
 * input's aria-controls: a viewer page can draw listboxes of its own.
 */
export async function openSelect(
  context: PlayContext,
  name: string | RegExp,
): Promise<PanelQueries> {
  const listbox = await waitFor(async () => {
    // Found again on every try: a panel still settling can remount the field, which
    // closes a dropdown it opened, so a closed one is clicked open again.
    const select = await findEnabled(context, "textbox", name);
    // The dropdown stays hidden while its field is scrolled out of the panel,
    // and a click does not scroll.
    select.scrollIntoView({ block: "center" });
    if (select.getAttribute("aria-expanded") !== "true")
      await userEvent.click(select);
    const id = select.getAttribute("aria-controls");
    const found = id ? select.ownerDocument.getElementById(id) : null;
    // Mounted is not open: mid-transition the dropdown is hidden, and its options
    // are not yet in the accessibility tree a role query reads.
    expect(found).toBeVisible();
    // A dropdown that closes as it settles keeps its options mounted under a
    // hidden parent, where a role query skips them.
    expect(within(found!).queryAllByRole("option")).not.toHaveLength(0);
    return found!;
  }, STAGE_TIMEOUT);
  return within(listbox);
}

/** Picks `option` in the panel's Select named `name` and resolves once the field shows it. */
export async function selectOption(
  context: PlayContext,
  name: string | RegExp,
  option: string,
): Promise<PanelQueries> {
  const listbox = await openSelect(context, name);
  await userEvent.click(listbox.getByRole("option", { name: option }));
  const panel = within(await waitForToolPanel(context));
  await waitFor(() =>
    expect(panel.getByRole("textbox", { name })).toHaveValue(option),
  );
  return panel;
}

/**
 * Opens a panel menu from its trigger button and resolves with the open menu
 * once its fade-in has finished, so its items already pass toBeVisible.
 */
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
  const menu = await within(
    context.canvasElement.ownerDocument.body,
  ).findByRole("menu", {}, STAGE_TIMEOUT);
  await waitFor(() => expect(menu).toBeVisible(), STAGE_TIMEOUT);
  return menu;
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

/** Places as placeOnPage does, then undoes it, for the panel's Redo state. */
export async function placeAndUndo(
  context: PlayContext,
  arm: (context: PlayContext) => Promise<PanelQueries>,
): Promise<PanelQueries> {
  const panel = await placeOnPage(context, arm);
  await undoInPanel(panel);
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
 * the step's title is followed by the info icon its tooltip opens from, drawn
 * either bare or wrapped in `.sui-info`.
 */
function findStepTitle(panel: PanelQueries, title: string) {
  return waitFor(() => {
    const stepTitle = panel
      .getAllByText(title, { exact: true })
      .find((element: HTMLElement) => {
        const icon = element.nextElementSibling;
        return (
          (icon instanceof SVGElement ||
            !!icon?.classList.contains("sui-info")) &&
          !element.closest("button")
        );
      });
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
  if ("info" in trigger) return findInfoButton(panel, trigger.info);
  return panel.findByText(trigger.text, undefined, STAGE_TIMEOUT);
}

function matchesText(text: string, expected: string | RegExp): boolean {
  return typeof expected === "string"
    ? text.trim() === expected
    : expected.test(text.trim());
}

/**
 * The (i) whose explanation is `info`, or null. A field's (i) is named after the
 * field ("About Page Order") and its explanation is the field's description,
 * read from the element just before the button; any other (i) is named by its
 * text.
 */
export function queryInfoButton(
  panel: PanelQueries,
  info: string | RegExp,
): HTMLElement | null {
  const named = panel.queryAllByRole("button", { name: info });
  if (named[0]) return named[0];
  return (
    panel
      .queryAllByRole("button", { name: /^About / })
      .find((button: HTMLElement) =>
        matchesText(
          button.parentElement?.previousElementSibling?.textContent ?? "",
          info,
        ),
      ) ?? null
  );
}

/** {@link queryInfoButton}, throwing when no (i) explains `info`. */
export function getInfoButton(
  panel: PanelQueries,
  info: string | RegExp,
): HTMLElement {
  const button = queryInfoButton(panel, info);
  if (!button) throw new Error(`No (i) explains ${String(info)}`);
  return button;
}

/** {@link getInfoButton}, waiting for the (i) to appear. */
export function findInfoButton(
  panel: PanelQueries,
  info: string | RegExp,
): Promise<HTMLElement> {
  return waitFor(() => getInfoButton(panel, info), STAGE_TIMEOUT);
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
