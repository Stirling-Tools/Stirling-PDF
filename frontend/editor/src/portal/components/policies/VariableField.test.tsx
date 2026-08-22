import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormField } from "@app/ui/FormField";

import {
  VariableField,
  VariablesReference,
} from "@portal/components/policies/VariableField";

// Keys come back verbatim, except the few the field interpolates - those are the strings the
// assertions below read, so they have to render like the real catalogue does.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Deliberately a fresh t each call, as react-i18next often gives: the field must not treat
    // that as a language change and rebuild itself under the caret.
    i18n: { language: "en-US" },
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "portal.policies.variables.fromStep") {
        return `${options?.label} from step ${options?.n}`;
      }
      if (key.startsWith("portal.policies.variables.labels.")) {
        return (
          LABELS[key.slice("portal.policies.variables.labels.".length)] ?? key
        );
      }
      if (options?.label) return `${key}:${options.label}`;
      return key;
    },
  }),
}));

const LABELS: Record<string, string> = {
  document_filename: "File name",
  document_sha256: "Fingerprint",
  document_pageCount: "Page count",
  run_policyName: "Policy name",
  run_runId: "Run ID",
  steps_body: "Full response",
  steps_status: "Status code",
};

/** The field is controlled; give it real state so edits round-trip. */
function Harness({
  initial = "",
  multiline = true,
}: {
  initial?: string;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MantineProvider>
      <VariableField
        value={value}
        onChange={setValue}
        multiline={multiline}
        aria-label="field"
      />
      <output data-testid="stored">{value}</output>
    </MantineProvider>
  );
}

const editor = () => screen.getByLabelText("field");
const stored = () => screen.getByTestId("stored").textContent;
const boxes = () =>
  Array.from(document.querySelectorAll(".portal-varfield__token"));
const boxNames = () =>
  boxes().map(
    (box) => box.querySelector(".portal-varfield__token-label")?.textContent,
  );

/** Put the caret at the end of the editor's last text node and fire an input. */
function typeInto(text: string) {
  const el = editor();
  let node = el.lastChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    node = document.createTextNode("");
    el.appendChild(node);
  }
  node.nodeValue = (node.nodeValue ?? "") + text;
  const range = document.createRange();
  range.setStart(node, node.nodeValue!.length);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.input(el);
}

describe("VariableField", () => {
  it("draws a saved reference as a named box, with no braces on screen", () => {
    render(<Harness initial="Filed {{document.filename}} today" />);
    expect(boxNames()).toEqual(["File name"]);
    expect(editor().textContent).not.toContain("{{");
    // What is stored is unchanged: the boxes are only how it is drawn.
    expect(stored()).toBe("Filed {{document.filename}} today");
  });

  it("names an earlier step's output by its step number", () => {
    render(<Harness initial="Link: {{steps.1.body}}" />);
    expect(boxNames()).toEqual(["Full response from step 1"]);
    expect(
      document.querySelector(".portal-varfield__token-source")?.textContent,
    ).toBe("1");
  });

  it.each(["@", "/", "{{"])(
    "opens the list on %s and inserts on Enter",
    (trigger) => {
      render(<Harness />);
      typeInto(`see ${trigger}`);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      fireEvent.keyDown(editor(), { key: "Enter" });
      expect(stored()).toMatch(/^see \{\{[\w.]+\}\} $/);
      // The typed trigger never survives as text.
      expect(editor().textContent).not.toContain(trigger);
    },
  );

  it("filters on the name, not just the path", () => {
    render(<Harness />);
    typeInto("@fingerprint");
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Fingerprint");
  });

  it("leaves @ and / alone in the middle of a word", () => {
    render(<Harness />);
    typeInto("mail bob@acme");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    typeInto(" and/or");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the list once nothing matches, keeping the typed text", () => {
    render(<Harness />);
    typeInto("x @zzzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(stored()).toBe("x @zzzz");
  });

  it("clicking a box opens the list with that variable ticked, and swaps in place", () => {
    render(<Harness initial="a {{document.filename}} b" />);
    fireEvent.mouseDown(boxes()[0]);

    const list = screen.getByRole("listbox");
    const ticked = within(list)
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true");
    expect(ticked[0]).toHaveTextContent("File name");

    fireEvent.mouseDown(
      within(list).getByRole("option", { name: /Page count/ }),
    );
    expect(stored()).toBe("a {{document.pageCount}} b");
    expect(boxes()).toHaveLength(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("removes a whole box from its x, and Ctrl+Z puts it back", () => {
    render(<Harness initial="a {{document.filename}} b" />);
    fireEvent.mouseDown(
      document.querySelector(".portal-varfield__token-remove")!,
    );
    expect(stored()).toBe("a  b");
    expect(boxes()).toHaveLength(0);

    fireEvent.keyDown(editor(), { key: "z", ctrlKey: true });
    expect(stored()).toBe("a {{document.filename}} b");
    expect(boxNames()).toEqual(["File name"]);
  });

  it("removes a focused box on Delete without double-snapshotting the undo", () => {
    // Regression: the box and the editor both listen for Delete. When the box let the event
    // bubble, one edit was snapshotted twice and the first undo restored an identical state.
    render(<Harness initial="a {{document.filename}} b" />);
    const box = boxes()[0] as HTMLElement;
    box.focus();
    fireEvent.keyDown(box, { key: "Delete" });
    expect(stored()).toBe("a  b");

    fireEvent.keyDown(editor(), { key: "z", ctrlKey: true });
    expect(stored()).toBe("a {{document.filename}} b");
  });

  it("redoes with Ctrl+Shift+Z", () => {
    render(<Harness initial="{{run.runId}}" />);
    fireEvent.mouseDown(
      document.querySelector(".portal-varfield__token-remove")!,
    );
    fireEvent.keyDown(editor(), { key: "z", ctrlKey: true });
    expect(stored()).toBe("{{run.runId}}");

    fireEvent.keyDown(editor(), { key: "Z", ctrlKey: true, shiftKey: true });
    expect(stored()).toBe("");
  });

  it("opens the list from the Add variable button and inserts at the caret", async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: /variables\.add/ }),
    );
    const list = screen.getByRole("listbox");
    fireEvent.mouseDown(
      within(list).getByRole("option", { name: /Policy name/ }),
    );
    expect(stored()).toBe("{{run.policyName}} ");
  });

  it("converts pasted brace text into boxes", () => {
    render(<Harness />);
    fireEvent.paste(editor(), {
      clipboardData: {
        getData: () => "Filed {{document.filename}} under {{run.policyName}}.",
      },
    });
    expect(boxNames()).toEqual(["File name", "Policy name"]);
    expect(stored()).toBe(
      "Filed {{document.filename}} under {{run.policyName}}.",
    );
  });

  it("shows a path it has no name for as an unnamed box, still swappable", () => {
    render(<Harness initial="{{steps.1.body.ocs.data.url}}" />);
    const box = boxes()[0];
    expect(box).toHaveClass("portal-varfield__token--unnamed");
    expect(boxNames()).toEqual(["steps.1.body.ocs.data.url"]);

    fireEvent.mouseDown(box);
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    // Nothing is ticked: the saved path is not one of the named variables.
    expect(
      options.filter((o) => o.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1); // the highlight still has to land somewhere
    expect(options.find((o) => o.querySelector("svg"))).toBeUndefined();
  });

  it("keeps a single-line field to one line", () => {
    render(<Harness multiline={false} />);
    typeInto("one");
    const prevented = !fireEvent.keyDown(editor(), { key: "Enter" });
    expect(prevented).toBe(true);
  });

  it("shows the raw value behind Edit as text and comes back with boxes", async () => {
    render(<Harness initial="Filed {{document.filename}}" />);
    await userEvent.click(
      screen.getByRole("button", { name: /variables\.editAsText/ }),
    );
    const raw = screen.getByLabelText(
      "portal.policies.variables.rawLabel",
    ) as HTMLTextAreaElement;
    expect(raw.value).toBe("Filed {{document.filename}}");

    await userEvent.click(
      screen.getByRole("button", { name: /variables\.editAsBoxes/ }),
    );
    expect(boxNames()).toEqual(["File name"]);
  });

  it("takes its name from a FormField label, and focuses when that label is clicked", async () => {
    // A <label for> binds to labelable elements only, so a contenteditable gets neither the name
    // nor the click-to-focus unless the field wires them up itself.
    function Labelled() {
      const [value, setValue] = useState("");
      return (
        <MantineProvider>
          <FormField label="Message body">
            <VariableField value={value} onChange={setValue} multiline />
          </FormField>
        </MantineProvider>
      );
    }
    render(<Labelled />);

    const field = screen.getByRole("textbox", { name: "Message body" });
    expect(field).toBeInTheDocument();

    await userEvent.click(screen.getByText("Message body"));
    expect(document.activeElement).toBe(field);
  });
});

describe("VariablesReference", () => {
  it("expands to the catalogue and collapses again", async () => {
    render(
      <MantineProvider>
        <VariablesReference />
      </MantineProvider>,
    );
    const toggle = screen.getByRole("button", {
      name: /portal\.policies\.variables\.title/,
    });
    expect(screen.queryByText("document.sha256")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    // Both halves are listed: the name leads, the path backs it up.
    expect(screen.getByText("Fingerprint")).toBeInTheDocument();
    expect(screen.getByText("document.sha256")).toBeInTheDocument();
    expect(screen.getByText("steps.1.body")).toBeInTheDocument();
    expect(screen.getByText("steps.1.body.ocs.data.url")).toBeInTheDocument();
    expect(
      screen.getByText("portal.policies.variables.exampleTag"),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(screen.queryByText("document.sha256")).not.toBeInTheDocument();
  });
});
