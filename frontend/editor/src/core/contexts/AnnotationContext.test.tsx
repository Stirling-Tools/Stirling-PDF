import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AnnotationProvider,
  useAnnotation,
} from "@app/contexts/AnnotationContext";
import type { AnnotationToolId } from "@app/components/viewer/viewerTypes";

const consumerRenders = vi.fn();

function Consumer() {
  const { activeAnnotationToolId } = useAnnotation();
  consumerRenders(activeAnnotationToolId);
  return <span data-testid="tool">{activeAnnotationToolId ?? "none"}</span>;
}

function ArmToolButton({ toolId }: { toolId: AnnotationToolId }) {
  const { setActiveAnnotationToolId } = useAnnotation();
  return (
    <button type="button" onClick={() => setActiveAnnotationToolId(toolId)}>
      arm
    </button>
  );
}

function Harness({ children }: { children: ReactNode }) {
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        tick
      </button>
      <AnnotationProvider>{children}</AnnotationProvider>
    </>
  );
}

describe("AnnotationProvider", () => {
  it("keeps consumer renders stable when a parent re-renders", () => {
    consumerRenders.mockClear();
    const stableChild = <Consumer />;

    render(
      <Harness>
        {stableChild}
        <ArmToolButton toolId="textComment" />
      </Harness>,
    );
    expect(consumerRenders).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("tick"));
    fireEvent.click(screen.getByText("tick"));

    expect(consumerRenders).toHaveBeenCalledTimes(1);
  });

  it("re-renders consumers when the armed tool changes", () => {
    consumerRenders.mockClear();

    render(
      <Harness>
        <Consumer />
        <ArmToolButton toolId="textComment" />
      </Harness>,
    );

    fireEvent.click(screen.getByText("arm"));

    expect(screen.getByTestId("tool")).toHaveTextContent("textComment");
    expect(consumerRenders).toHaveBeenCalledTimes(2);
  });
});
