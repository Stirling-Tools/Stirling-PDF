import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RemovePassword from "@app/tools/RemovePassword";
import apiClient from "@app/services/apiClient";
import {
  clearPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import { createStirlingFile, type StirlingFile } from "@app/types/fileContext";

const state = vi.hoisted(() => ({
  files: [] as StirlingFile[],
  updateParameter: vi.fn(),
}));
vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileContext: () => ({ actions: {} }),
}));
vi.mock("@app/hooks/tools/removePassword/useRemovePasswordOperation", () => ({
  useRemovePasswordOperation: vi.fn(),
}));
vi.mock("@app/components/tooltips/useRemovePasswordTips", () => ({
  useRemovePasswordTips: () => ({}),
}));
vi.mock("@app/hooks/tools/shared/useBaseTool", () => ({
  useBaseTool: () => ({
    selectedFiles: state.files,
    hasFiles: true,
    hasResults: false,
    operation: { isLoading: false },
    params: {
      parameters: { password: "reader", ownerPassword: "owner" },
      updateParameter: state.updateParameter,
    },
  }),
}));
vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: (config: {
    steps: { content: ReactNode }[];
    executeButton: { paramsValid: boolean };
  }) => (
    <>
      {config.steps[0].content}
      <button disabled={!config.executeButton.paramsValid}>Execute</button>
    </>
  ),
}));

const post = vi.mocked(apiClient.post);
const local: PdfAccess = {
  password: "reader",
  encrypted: true,
  signed: false,
  ownerAuthenticated: false,
  requiresOpeningPassword: true,
  localInspection: true,
  permissions: -4,
  canModify: true,
  pageCount: 1,
};
const renderTool = () =>
  render(
    <MantineProvider>
      <RemovePassword />
    </MantineProvider>,
  );

beforeEach(() => {
  clearPdfAccess();
  post.mockReset();
  state.updateParameter.mockReset();
  state.files = [createStirlingFile(new File(["pdf"], "protected.pdf"))];
  rememberPdfAccess(state.files[0], local);
});

describe("Remove Password protection status", () => {
  it("keeps both controls unavailable while owner-password information is unknown", () => {
    post.mockReturnValueOnce(new Promise(() => {}));
    renderTool();
    expect(screen.getAllByText("Checking protection…")).toHaveLength(2);
    expect(screen.getByLabelText("Password to open")).toBeDisabled();
    expect(screen.getByLabelText("Permissions password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Execute" })).toBeDisabled();
    expect(state.updateParameter).not.toHaveBeenCalled();
  });

  it("shows unavailable after failure without guessing or clearing entered credentials", async () => {
    post.mockRejectedValueOnce(new Error("Offline"));
    renderTool();
    await waitFor(() =>
      expect(screen.getAllByText("Unable to check protection")).toHaveLength(2),
    );
    expect(screen.getByLabelText("Permissions password")).toBeDisabled();
    expect(state.updateParameter).not.toHaveBeenCalled();
  });

  it("enables only the roles verified by the backend", async () => {
    post.mockResolvedValueOnce({
      data: { ...local, localInspection: undefined, hasOwnerPassword: false },
    });
    renderTool();
    await waitFor(() =>
      expect(screen.getByLabelText("Password to open")).toBeEnabled(),
    );
    expect(screen.getByLabelText("Permissions password")).toBeDisabled();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(state.updateParameter).toHaveBeenCalledWith("ownerPassword", "");
  });

  it("waits for every selected file before claiming complete protection information", async () => {
    const other = createStirlingFile(new File(["second"], "second.pdf"));
    rememberPdfAccess(other, local);
    state.files.push(other);
    post.mockResolvedValueOnce({
      data: { ...local, localInspection: undefined, hasOwnerPassword: true },
    });
    let finish!: (value: { data: PdfAccess }) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderTool();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Permissions password")).toBeDisabled();
    await act(async () =>
      finish({
        data: { ...local, localInspection: undefined, hasOwnerPassword: false },
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Permissions password")).toBeEnabled(),
    );
  });

  it("cancels the pending upload on navigation", async () => {
    post.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderTool();
    const token = post.mock.calls[0][2]?.cancelToken;
    expect(token?.reason).toBeUndefined();
    unmount();
    await waitFor(() => expect(token?.reason).toBeDefined());
  });
});
