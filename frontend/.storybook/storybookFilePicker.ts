/// <reference types="vite/client" />
import type { Decorator } from "@storybook/react-vite";

/**
 * Storybook-only: a user's click on any file input offers the repo's own test
 * fixtures before the OS file picker, so a panel can be filled with one click.
 * Files the open story's tool already loads in CI come first.
 *
 * Only trusted clicks are caught. Story play functions upload through
 * `userEvent`, whose events are untrusted, so story tests never see this.
 */

const FIXTURE_URLS = import.meta.glob<string>(
  [
    "../src/editor/core/tests/test-fixtures/**/*.{pdf,png,jpg,jpeg,gif,bmp,tiff,webp,svg}",
    "../src/editor/core/tests/test-fixtures/**/*.{docx,doc,xlsx,pptx,odt,odp,rtf,txt,csv,xml,html,htm,md}",
    "../src/editor/core/tests/test-fixtures/**/*.{eml,msg,epub,cbz,fb2,zip,json}",
    "../src/editor/core/tests/test-fixtures/**/*.{p12,pfx,jks,keystore,der,cer,key}",
    "../src/editor/core/tests/test-fixtures/**/*.{pem,crt}.txt",
    "!**/README.md",
  ],
  { query: "?url", import: "default", eager: true },
);

const STORY_SOURCES = import.meta.glob<string>("../src/**/*.stories.tsx", {
  query: "?raw",
  import: "default",
});

const MIME_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  webp: "image/webp",
  svg: "image/svg+xml",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip",
  fb2: "application/x-fictionbook+xml",
  zip: "application/zip",
  json: "application/json",
  p12: "application/x-pkcs12",
  pfx: "application/x-pkcs12",
  pem: "application/x-pem-file",
  der: "application/x-x509-ca-cert",
  crt: "application/x-x509-ca-cert",
  cer: "application/x-x509-ca-cert",
};

/**
 * Vite refuses to serve `*.pem` and `*.crt` (`server.fs.deny`), so those
 * fixtures are stored with a `.txt` suffix; they load under their real name.
 */
function fixtureName(fileName: string): string {
  return fileName.replace(/\.(pem|crt)\.txt$/, ".$1");
}

interface StorybookFixture {
  name: string;
  url: string;
  type: string;
}

const FIXTURES: StorybookFixture[] = Object.entries(FIXTURE_URLS)
  .map(([path, url]) => {
    const name = fixtureName(path.slice(path.lastIndexOf("/") + 1));
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    return {
      name,
      url,
      type: MIME_TYPES[extension] ?? "application/octet-stream",
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

let currentStoryFile: string | undefined;

/** Records the open story's file, whose fixtures the chooser lists first. */
export const withStorybookFilePicker: Decorator = (Story, context) => {
  currentStoryFile = context.parameters.fileName;
  return Story();
};

function sourceKey(path: string): string {
  return path.replace(/^(\.\.?\/)+/, "");
}

/** Fixtures the open story file names, in the order it first names them. */
async function storyFixtureNames(): Promise<string[]> {
  if (!currentStoryFile) return [];
  const key = sourceKey(currentStoryFile);
  const load = Object.entries(STORY_SOURCES).find(
    ([path]) => sourceKey(path) === key,
  )?.[1];
  if (!load) return [];
  const source = await load();
  return FIXTURES.map((fixture) => ({
    name: fixture.name,
    at: source.indexOf(`"${fixture.name}"`),
  }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ name }) => name);
}

/** The `accept` attribute's rule, as the browser's own picker applies it. */
function acceptsFixture(accept: string, fixture: StorybookFixture): boolean {
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.some((token) => {
    if (token.startsWith("."))
      return fixture.name.toLowerCase().endsWith(token);
    if (token.endsWith("/*"))
      return fixture.type.startsWith(token.slice(0, -1));
    return fixture.type === token;
  });
}

async function loadIntoInput(
  input: HTMLInputElement,
  fixtures: StorybookFixture[],
): Promise<void> {
  const chosen = input.multiple ? fixtures : fixtures.slice(0, 1);
  const files = await Promise.all(
    chosen.map(async (fixture) => {
      const blob = await (await fetch(fixture.url)).blob();
      return new File([blob], fixture.name, { type: fixture.type });
    }),
  );
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

const BUTTON = `font: inherit; font-size: 0.8125rem; text-align: left;
  padding: 0.4rem 0.6rem; border-radius: 0.375rem; cursor: pointer;
  border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-text);`;
const PRIMARY = `${BUTTON} background: var(--c-primary);
  color: var(--c-text-on-primary); border-color: var(--c-primary);`;
const HEADING = `margin: 0.75rem 0 0.35rem; font-size: 0.75rem;
  font-weight: 600; color: var(--c-text-muted);`;

let pickingFromDevice = false;
const nativeClick = HTMLInputElement.prototype.click;
const nativeShowPicker = HTMLInputElement.prototype.showPicker;

function pickFromDevice(input: HTMLInputElement): void {
  pickingFromDevice = true;
  try {
    nativeClick.call(input);
  } finally {
    pickingFromDevice = false;
  }
}

async function offerFixtures(input: HTMLInputElement): Promise<void> {
  const matching = FIXTURES.filter((fixture) =>
    acceptsFixture(input.accept, fixture),
  );
  const storyNames = await storyFixtureNames();
  const fromStory = storyNames
    .map((name) => matching.find((fixture) => fixture.name === name))
    .filter((fixture): fixture is StorybookFixture => fixture !== undefined);
  const others = matching.filter((fixture) => !fromStory.includes(fixture));

  const dialog = element(
    "dialog",
    `width: min(26rem, calc(100vw - 2rem)); max-height: 80vh; overflow: auto;
     padding: 1rem; border-radius: 0.75rem; border: 1px solid var(--c-border);
     background: var(--c-surface); color: var(--c-text);
     font-family: inherit; box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);`,
  );
  dialog.setAttribute("aria-label", "Add a file");
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const loadAndClose = (fixtures: StorybookFixture[]) => {
    close();
    void loadIntoInput(input, fixtures);
  };

  dialog.append(
    element("h2", "margin: 0; font-size: 0.95rem;", "Add a file"),
    element(
      "p",
      "margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--c-text-muted);",
      `Takes ${input.accept || "any file"}${input.multiple ? ", several at once" : ""}`,
    ),
  );

  if (fromStory.length > 0) {
    dialog.append(element("p", HEADING, "Loaded by this tool's stories"));
    const list = element("div", "display: grid; gap: 0.35rem;");
    if (input.multiple && fromStory.length > 1) {
      const all = element(
        "button",
        PRIMARY,
        `Load all ${fromStory.length}: ${fromStory.map((f) => f.name).join(", ")}`,
      );
      all.addEventListener("click", () => loadAndClose(fromStory));
      list.append(all);
    }
    fromStory.forEach((fixture, index) => {
      const primary = index === 0 && !(input.multiple && fromStory.length > 1);
      const button = element(
        "button",
        primary ? PRIMARY : BUTTON,
        `Load ${fixture.name}`,
      );
      button.addEventListener("click", () => loadAndClose([fixture]));
      list.append(button);
    });
    dialog.append(list);
  }

  if (others.length > 0) {
    dialog.append(element("p", HEADING, "Other Storybook files"));
    const row = element("div", "display: flex; gap: 0.35rem;");
    const select = element("select", `${BUTTON} flex: 1; min-width: 0;`);
    select.setAttribute("aria-label", "Storybook file");
    for (const fixture of others)
      select.append(new Option(fixture.name, fixture.name));
    const load = element(
      "button",
      fromStory.length === 0 ? PRIMARY : BUTTON,
      "Load",
    );
    load.addEventListener("click", () => {
      const fixture = others.find((f) => f.name === select.value);
      if (fixture) loadAndClose([fixture]);
    });
    row.append(select, load);
    dialog.append(row);
  }

  if (matching.length === 0)
    dialog.append(
      element(
        "p",
        "margin: 0.75rem 0 0; font-size: 0.8125rem;",
        "No Storybook file matches this input.",
      ),
    );

  const footer = element(
    "div",
    "display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 1rem;",
  );
  const device = element("button", BUTTON, "Pick one from my device");
  device.addEventListener("click", () => {
    close();
    pickFromDevice(input);
  });
  const cancel = element("button", BUTTON, "Cancel");
  cancel.addEventListener("click", close);
  footer.append(device, cancel);
  dialog.append(footer);

  dialog.addEventListener("cancel", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function caughtByChooser(input: HTMLInputElement): boolean {
  return (
    input.type === "file" &&
    !pickingFromDevice &&
    window.event?.isTrusted === true
  );
}

let installed = false;

/** Routes user clicks on file inputs through the fixture chooser; idempotent. */
export function installStorybookFilePicker(): void {
  if (installed) return;
  installed = true;

  HTMLInputElement.prototype.click = function click(this: HTMLInputElement) {
    if (caughtByChooser(this)) {
      void offerFixtures(this);
      return;
    }
    nativeClick.call(this);
  };
  HTMLInputElement.prototype.showPicker = function showPicker(
    this: HTMLInputElement,
  ) {
    if (caughtByChooser(this)) {
      void offerFixtures(this);
      return;
    }
    nativeShowPicker.call(this);
  };

  // A click straight on a visible file input (or its label) opens the picker
  // natively, without going through click().
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (
        event.isTrusted &&
        target instanceof HTMLInputElement &&
        target.type === "file" &&
        !pickingFromDevice
      ) {
        event.preventDefault();
        void offerFixtures(target);
      }
    },
    true,
  );
}
