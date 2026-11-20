import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import OperationButton from "@editor/components/tools/shared/OperationButton";
import { ToolActionsContext } from "@editor/contexts/ToolActionsContext";

const health = vi.hoisted(() => ({ isOnline: true }));
vi.mock("@editor/hooks/useBackendHealth", () => ({
  useBackendHealth: () => ({ isOnline: health.isOnline }),
}));
vi.mock("@editor/ui/Icon", () => ({ Icon: () => null }));

function renderButton(onEndpointUnavailableClick?: () => void) {
  const run = vi.fn();
  render(
    <MantineProvider>
      <ToolActionsContext.Provider value={{ onEndpointUnavailableClick }}>
        <OperationButton
          onClick={run}
          disabledReason="endpointUnavailable"
          submitText="Convert"
          data-testid="run"
        />
      </ToolActionsContext.Provider>
    </MantineProvider>,
  );
  return run;
}

describe("OperationButton", () => {
  beforeEach(() => {
    health.isOnline = true;
  });

  it("turns into a sign-in prompt when signing in would unlock the tool", () => {
    const signIn = vi.fn();
    const run = renderButton(signIn);

    expect(screen.queryByText("tool.signInRequired")).toBeNull();
    const button = screen.getByTestId("run");
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("tool.signInToUse");
    fireEvent.click(button);
    expect(signIn).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("becomes the run button once the tool is available", () => {
    const signIn = vi.fn();
    const run = vi.fn();
    const ui = (disabledReason?: "endpointUnavailable") => (
      <MantineProvider>
        <ToolActionsContext.Provider
          value={{ onEndpointUnavailableClick: signIn }}
        >
          <OperationButton
            onClick={run}
            disabledReason={disabledReason}
            submitText="Convert"
            data-testid="run"
          />
        </ToolActionsContext.Provider>
      </MantineProvider>
    );
    const { rerender } = render(ui("endpointUnavailable"));
    expect(screen.getByTestId("run")).toHaveTextContent("tool.signInToUse");

    rerender(ui());

    expect(screen.queryByTestId("sign-in-required")).toBeNull();
    const button = screen.getByTestId("run");
    expect(button).toHaveTextContent("Convert");
    fireEvent.click(button);
    expect(run).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("stays disabled when no sign-in can unlock the tool", () => {
    renderButton();

    expect(screen.queryByTestId("sign-in-required")).toBeNull();
    expect(screen.getByTestId("run")).toBeDisabled();
  });

  it("keeps the sign-in prompt while the backend is offline", () => {
    health.isOnline = false;
    const signIn = vi.fn();
    renderButton(signIn);

    const button = screen.getByTestId("run");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("blocks running the tool while the backend is offline", () => {
    health.isOnline = false;
    render(
      <MantineProvider>
        <OperationButton
          onClick={vi.fn()}
          submitText="Convert"
          data-testid="run"
        />
      </MantineProvider>,
    );

    expect(screen.getByTestId("run")).toBeDisabled();
  });
});
