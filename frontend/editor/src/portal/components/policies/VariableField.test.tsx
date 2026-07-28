import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  VariableField,
  VariablesReference,
} from "@portal/components/policies/VariableField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/** The field is controlled; give it real state so typing round-trips. */
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <VariableField value={value} onChange={setValue} aria-label="field" />;
}

const editor = () => screen.getByLabelText("field") as HTMLTextAreaElement;

describe("VariableField", () => {
  it("opens suggestions on {{ and completes the reference on Enter", async () => {
    render(<Harness />);
    await userEvent.type(editor(), "see {{{{doc");

    const menu = await screen.findByRole("listbox");
    expect(menu).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");
    // The first match completes with closed braces, cursor after them.
    expect(editor().value).toMatch(/^see \{\{document\.\w+\}\}$/);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters as the partial narrows and accepts by click", async () => {
    render(<Harness />);
    await userEvent.type(editor(), "{{{{run.runid");

    const option = await screen.findByRole("option", {
      name: /run\.runId/,
    });
    fireEvent.mouseDown(option);
    expect(editor().value).toBe("{{run.runId}}");
  });

  it("does not open for prose braces", async () => {
    render(<Harness />);
    await userEvent.type(editor(), "a {{{{ then words");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the menu when the caret moves out of the open reference", async () => {
    // Regression: with no selection handler, moving the caret left a stale menu whose recorded
    // {{ start no longer matched - accepting then spliced the completion into the wrong place.
    render(<Harness />);
    await userEvent.type(editor(), "x {{{{doc");
    await screen.findByRole("listbox");

    const el = editor();
    el.setSelectionRange(0, 0);
    fireEvent.select(el);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Enter with the menu closed must not splice a completion into the text.
    await userEvent.keyboard("{Enter}");
    expect(el.value).toBe("x {{doc");
  });

  it("reopens the menu when the caret returns into an open reference", async () => {
    render(<Harness />);
    await userEvent.type(editor(), "{{{{doc");
    await screen.findByRole("listbox");

    const el = editor();
    el.setSelectionRange(0, 0);
    fireEvent.select(el);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    el.setSelectionRange(el.value.length, el.value.length);
    fireEvent.select(el);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("closes on Escape and leaves the text alone", async () => {
    render(<Harness />);
    await userEvent.type(editor(), "{{{{steps");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(editor().value).toBe("{{steps");
  });

  it("renders completed references as tokens in the painted layer", () => {
    render(<Harness initial="did {{document.filename}} ok" />);
    const token = document.querySelector(".portal-varfield__token");
    expect(token?.textContent).toBe("{{document.filename}}");
  });

  it("keeps a single-line field to one line", async () => {
    render(<Harness />);
    await userEvent.type(editor(), "one{Enter}two");
    expect(editor().value).toBe("onetwo");
  });
});

describe("VariablesReference", () => {
  it("expands to the catalogue and collapses again", async () => {
    // The toggle is the shared DS Button, which needs the Mantine context.
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
    expect(screen.getByText("document.sha256")).toBeInTheDocument();
    expect(screen.getByText("steps.1.body")).toBeInTheDocument();
    // The deep body path appears as a tagged example, not a variable row.
    expect(
      screen.getByText("{{steps.1.body.ocs.data.url}}"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.policies.variables.exampleTag"),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(screen.queryByText("document.sha256")).not.toBeInTheDocument();
  });
});
