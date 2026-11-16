import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import OperationButton from "@editor/components/tools/shared/OperationButton";
import { ToolActionsContext } from "@editor/contexts/ToolActionsContext";

vi.mock("@editor/hooks/useBackendHealth", () => ({
  useBackendHealth: () => ({ isOnline: true }),
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
  it("turns into a sign-in prompt when signing in would unlock the tool", () => {
    const signIn = vi.fn();
    const run = renderButton(signIn);

    expect(screen.getByText("tool.signInRequired")).toBeInTheDocument();
    const button = screen.getByTestId("run");
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("tool.signInToUse");
    fireEvent.click(button);
    expect(signIn).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("stays disabled when no sign-in can unlock the tool", () => {
    renderButton();

    expect(screen.queryByTestId("sign-in-required")).toBeNull();
    expect(screen.getByTestId("run")).toBeDisabled();
  });
});
