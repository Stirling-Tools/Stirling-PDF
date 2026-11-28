import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expectConsole } from "@editor/tests/failOnConsole";
import AutomationRun from "@editor/components/tools/automate/AutomationRun";
import type { AutomationConfig } from "@editor/types/automation";
import type { useAutomateOperation } from "@editor/hooks/tools/automate/useAutomateOperation";

type Operation = ReturnType<typeof useAutomateOperation>;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
        String(values?.[k] ?? ""),
      ),
  }),
}));

const files = vi.hoisted(() => ({ selected: [] as File[] }));
const openFilesModal = vi.hoisted(() => vi.fn());
vi.mock("@editor/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => files.selected,
}));
vi.mock("@editor/hooks/useConnectedServer", () => ({
  useConnectedServer: () => true,
}));
vi.mock("@editor/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({ openFilesModal }),
}));
vi.mock("@editor/utils/resourceManager", () => ({
  useResourceCleanup: () => () => {},
}));
vi.mock("@editor/components/tools/shared/FilesToolStep", () => ({
  createFilesToolStep: () => <div>selected files</div>,
}));
vi.mock("@editor/components/tools/shared/ReviewToolStep", () => ({
  createReviewToolStep: () => <div>review</div>,
}));
vi.mock("@editor/contexts/ToolRegistryContext", () => ({
  useToolRegistry: () => ({
    regularTools: {
      rotate: {
        name: "Rotate",
        operationConfig: { defaultParameters: { angle: 0 } },
      },
      addPassword: {
        name: "Add Password",
        operationConfig: {
          defaultParameters: { password: "" },
          validateParams: (p: { password: string }) => p.password !== "",
        },
      },
    },
  }),
}));

const automation: AutomationConfig = {
  id: "suggested-1",
  name: "Lock it",
  operations: [
    { operation: "rotate", parameters: { angle: 90 } },
    { operation: "addPassword", parameters: { password: "hunter2" } },
  ],
  createdAt: "",
  updatedAt: "",
};

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    isLoading: false,
    files: [],
    downloadUrl: null,
    errorMessage: null,
    executeOperation: vi.fn(),
    cancelOperation: vi.fn(),
    resetResults: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  } as unknown as Operation;
}

function renderRun(
  op: Operation,
  props: Partial<Parameters<typeof AutomationRun>[0]> = {},
) {
  const handlers = {
    onBack: vi.fn(),
    onDone: vi.fn(),
    onEditStep: vi.fn(),
    onFileClick: vi.fn(),
    onUndo: vi.fn(),
    editAction: {
      label: "Customize",
      icon: "pencil" as const,
      onClick: vi.fn(),
    },
  };
  render(
    <MantineProvider>
      <AutomationRun
        automation={automation}
        automateOperation={op}
        actions={[]}
        {...handlers}
        {...props}
      />
    </MantineProvider>,
  );
  return handlers;
}

describe("AutomationRun", () => {
  beforeEach(() => {
    files.selected = [];
    openFilesModal.mockReset();
  });

  test("asks for a PDF before it can run", () => {
    renderRun(operation());

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(openFilesModal).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Run automation" }),
    ).toHaveProperty("disabled", true);
  });

  test("will not run a step whose settings its tool rejects", () => {
    files.selected = [new File(["a"], "a.pdf")];
    renderRun(operation(), {
      automation: {
        ...automation,
        operations: [
          automation.operations[0],
          { operation: "addPassword", parameters: { password: "" } },
        ],
      },
    });

    expect(screen.getByRole("button", { name: /^Run on/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByText("Edit this automation to finish configuring its steps."),
    ).toBeTruthy();
    expect(screen.getAllByText("Needs configuration")).toHaveLength(1);
  });

  test("a run can be cancelled, which keeps nothing it produced", () => {
    files.selected = [new File(["a"], "a.pdf")];
    const op = operation({ isLoading: true });
    renderRun(op);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(op.cancelOperation).toHaveBeenCalledTimes(1);
  });

  test("leaving a running automation cancels it first", () => {
    files.selected = [new File(["a"], "a.pdf")];
    const op = operation({ isLoading: true });
    const handlers = renderRun(op);

    fireEvent.click(
      screen.getByRole("button", { name: "Back to automations" }),
    );
    expect(op.cancelOperation).toHaveBeenCalledTimes(1);
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });

  test("while running, shows that on the button and offers only Back and Cancel", () => {
    files.selected = [new File(["a"], "a.pdf")];
    renderRun(operation({ isLoading: true }), {
      actions: [
        { key: "edit", label: "Edit", icon: "pencil", onClick: vi.fn() },
      ],
    });

    expect(screen.getByRole("button", { name: /^Starting/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: "Back to automations" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Open menu for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Customize" })).toBeNull();
  });

  test("holds back the results until the run has finished", () => {
    files.selected = [new File(["a"], "a.pdf")];
    renderRun(
      operation({ isLoading: true, files: [new File(["out"], "out.pdf")] }),
    );

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Starting/ })).toBeTruthy();
  });

  test("shows no results when the run ended in an error", () => {
    files.selected = [new File(["a"], "a.pdf")];
    renderRun(
      operation({
        files: [new File(["out"], "out.pdf")],
        errorMessage: "Could not prepare the download",
      }),
    );

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      "Could not prepare the download",
    );
  });

  test("offers Cancel while the run waits to start", async () => {
    files.selected = [new File(["a"], "a.pdf")];
    let start: () => void = () => {};
    const executeOperation = vi.fn(
      () => new Promise<void>((resolve) => (start = resolve)),
    );
    renderRun(operation({ executeOperation }));

    fireEvent.click(screen.getByRole("button", { name: /^Run on/ }));
    await screen.findByRole("button", { name: "Cancel" });
    start();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull(),
    );
  });

  test("keeps a failed step's Retry and Edit step back until the run settles", () => {
    files.selected = [new File(["a"], "a.pdf")];
    const executeOperation = vi.fn(
      (config: { onStepError: (index: number, error: string) => void }) => {
        config.onStepError(1, "Password too short");
        return new Promise<void>(() => {});
      },
    );
    renderRun(operation({ executeOperation } as never));

    fireEvent.click(screen.getByRole("button", { name: /^Run on/ }));
    expect(screen.getByText("Password too short")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit step" })).toBeNull();
  });

  test("announces each step as it starts and as it finishes, without one replacing the other", () => {
    files.selected = [new File(["a"], "a.pdf")];
    const executeOperation = vi.fn(
      (config: {
        onStepStart: (index: number) => void;
        onStepComplete: (index: number) => void;
      }) => {
        config.onStepStart(0);
        config.onStepComplete(0);
        config.onStepStart(1);
        return new Promise<void>(() => {});
      },
    );
    renderRun(operation({ executeOperation } as never));

    fireEvent.click(screen.getByRole("button", { name: /^Run on/ }));
    // The finish and the next start land together and are both announced.
    expect(
      screen.getByText(/Step 1 of 2 done: .+ Running step 2 of 2: /),
    ).toBeTruthy();
  });

  test("a retry that fails to start does not bring back a failed run's files", async () => {
    expectConsole.error(/Automation execution failed/);
    files.selected = [new File(["a"], "a.pdf")];

    function StatefulRun() {
      const [outputs, setOutputs] = useState([new File(["out"], "out.pdf")]);
      const [error, setError] = useState<string | null>(
        "Could not prepare the download",
      );
      return (
        <AutomationRun
          automation={automation}
          automateOperation={operation({
            files: outputs,
            errorMessage: error,
            resetResults: () => setOutputs([]),
            clearError: () => setError(null),
            executeOperation: vi.fn(async () => {
              throw new Error("backend not ready");
            }),
          })}
          actions={[]}
          editAction={{ label: "Customize", icon: "pencil", onClick: vi.fn() }}
          onBack={vi.fn()}
          onDone={vi.fn()}
          onEditStep={vi.fn()}
          onFileClick={vi.fn()}
          onUndo={vi.fn()}
        />
      );
    }
    render(
      <MantineProvider>
        <StatefulRun />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Run on/ }));
    await screen.findByRole("button", { name: "Back to automations" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Run on/ })).toBeTruthy();
  });

  test("reports the run as in flight the moment Run is pressed", () => {
    files.selected = [new File(["a"], "a.pdf")];
    const onRunningChange = vi.fn();
    const executeOperation = vi.fn(() => {
      expect(onRunningChange).toHaveBeenLastCalledWith(true);
      return new Promise<void>(() => {});
    });
    renderRun(operation({ executeOperation }), { onRunningChange });

    fireEvent.click(screen.getByRole("button", { name: /^Run on/ }));
    expect(executeOperation).toHaveBeenCalled();
  });

  test("names how many files it will run on", () => {
    files.selected = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")];
    renderRun(operation());

    expect(
      screen.getByRole("button", { name: "Run on 2 files" }),
    ).toHaveProperty("disabled", false);
  });

  test("offers Retry and Edit step on the failed step", async () => {
    files.selected = [new File(["a"], "a.pdf")];
    const executeOperation = vi.fn(
      async (config: {
        onStepError: (index: number, error: string) => void;
      }) => {
        config.onStepError(1, "Password too short");
      },
    );
    const handlers = renderRun(operation({ executeOperation } as never));

    fireEvent.click(screen.getByRole("button", { name: /^Run on/ }));
    await screen.findByText("Password too short");

    fireEvent.click(screen.getByRole("button", { name: "Edit step" }));
    expect(handlers.onEditStep).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(executeOperation).toHaveBeenCalledTimes(2);
    await screen.findByRole("button", { name: "Back to automations" });
  });

  test("after a run, offers Done and no way to run or save it again", () => {
    files.selected = [new File(["a"], "a.pdf")];
    const handlers = renderRun(
      operation({ files: [new File(["out"], "out.pdf")] }),
    );

    expect(screen.queryByRole("button", { name: "Run again" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Run on/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(handlers.onDone).toHaveBeenCalledTimes(1);
  });
});
