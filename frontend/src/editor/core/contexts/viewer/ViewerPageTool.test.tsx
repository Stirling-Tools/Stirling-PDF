import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ViewerPageToolProvider,
  useRegisterViewerPageTool,
  useViewerPageTool,
  type ViewerPageTool,
} from "@editor/contexts/viewer/ViewerPageTool";

const makeTool = (fileId: string): ViewerPageTool => ({
  fileId,
  PageLayer: () => null,
  Toolbar: () => null,
});

function Registrant({ tool }: { tool: ViewerPageTool | null }) {
  useRegisterViewerPageTool(tool);
  return null;
}

let seen: ViewerPageTool | null = null;
function Reader() {
  seen = useViewerPageTool();
  return null;
}

function Host({
  first,
  second,
}: {
  first?: ViewerPageTool | null;
  second?: ViewerPageTool | null;
}) {
  return (
    <ViewerPageToolProvider>
      {first !== undefined && <Registrant tool={first} />}
      {second !== undefined && <Registrant tool={second} />}
      <Reader />
    </ViewerPageToolProvider>
  );
}

describe("viewer page tool slot", () => {
  it("holds a registered tool until its registrant unmounts", () => {
    const tool = makeTool("a");
    const { rerender } = render(<Host first={tool} />);
    expect(seen).toBe(tool);
    rerender(<Host />);
    expect(seen).toBeNull();
  });

  it("keeps a newer registration when an older registrant unmounts", () => {
    const older = makeTool("a");
    const newer = makeTool("b");
    const { rerender } = render(<Host first={older} second={newer} />);
    expect(seen).toBe(newer);
    rerender(<Host second={newer} />);
    expect(seen).toBe(newer);
  });

  it("does not clear another tool when a registrant passes null", () => {
    const tool = makeTool("a");
    render(<Host first={tool} second={null} />);
    expect(seen).toBe(tool);
  });

  it("reads null without a provider", () => {
    render(<Reader />);
    expect(seen).toBeNull();
  });
});
