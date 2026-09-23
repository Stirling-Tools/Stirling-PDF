import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const viewer = { activeFileIndex: 0 };
const files = {
  files: [
    { fileId: "a", name: "alpha.pdf" },
    { fileId: "b", name: "beta.pdf" },
  ],
  fileStubs: [
    { id: "a", name: "alpha.pdf", thumbnailUrl: "alpha.png" },
    { id: "b", name: "beta.pdf", thumbnailUrl: "beta.png" },
  ],
};

vi.mock("@app/contexts/ViewerContext", () => ({ useViewer: () => viewer }));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: "viewer" }),
}));
vi.mock("@app/contexts/FileContext", () => ({ useAllFiles: () => files }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import RotateSettings from "@app/components/tools/rotate/RotateSettings";

const parameters = {
  parameters: { angle: 0 },
  rotateClockwise: vi.fn(),
  rotateAnticlockwise: vi.fn(),
} as never;

const renderAt = (activeFileIndex: number) => {
  viewer.activeFileIndex = activeFileIndex;
  return render(
    <MantineProvider>
      <RotateSettings parameters={parameters} />
    </MantineProvider>,
  );
};

describe("RotateSettings preview", () => {
  it("previews the viewer's active file, not the first loaded one", () => {
    renderAt(1);

    expect(screen.getByAltText("Preview of beta.pdf")).toBeInTheDocument();
    expect(screen.queryByAltText("Preview of alpha.pdf")).toBeNull();
  });

  it("follows the viewer when the active file changes", () => {
    const { rerender } = renderAt(0);
    expect(screen.getByAltText("Preview of alpha.pdf")).toBeInTheDocument();

    viewer.activeFileIndex = 1;
    rerender(
      <MantineProvider>
        <RotateSettings parameters={parameters} />
      </MantineProvider>,
    );

    expect(screen.getByAltText("Preview of beta.pdf")).toBeInTheDocument();
  });
});
