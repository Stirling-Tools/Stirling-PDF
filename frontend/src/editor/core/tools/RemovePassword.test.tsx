import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RemovePassword from "@editor/tools/RemovePassword";
import apiClient from "@editor/services/apiClient";
import {
  clearPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import {
  createStirlingFile,
  type StirlingFile,
} from "@editor/types/fileContext";

const state = vi.hoisted(() => ({
  files: [] as StirlingFile[],
  updateParameter: vi.fn(),
  execute: vi.fn(),
  requestOwner: vi.fn(),
  ownerPassword: "owner",
}));
vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileContext: () => ({
    actions: { requestPdfOwnerAccess: state.requestOwner },
  }),
}));
vi.mock(
  "@editor/hooks/tools/removePassword/useRemovePasswordOperation",
  () => ({
    useRemovePasswordOperation: vi.fn(),
  }),
);
vi.mock("@editor/components/tooltips/useRemovePasswordTips", () => ({
  useRemovePasswordTips: () => ({}),
}));
vi.mock("@editor/hooks/tools/shared/useBaseTool", () => ({
  useBaseTool: () => ({
    selectedFiles: state.files,
    hasFiles: true,
    hasResults: false,
    operation: { isLoading: false },
    handleExecute: state.execute,
    params: {
      parameters: { password: "reader", ownerPassword: state.ownerPassword },
      updateParameter: state.updateParameter,
    },
  }),
}));
vi.mock("@editor/components/tools/shared/createToolFlow", () => ({
  createToolFlow: (config: {
    steps: { content: ReactNode }[];
    executeButton: { paramsValid: boolean; onClick: () => Promise<void> };
  }) => (
    <>
      {config.steps[0].content}
      <button
        disabled={!config.executeButton.paramsValid}
        onClick={config.executeButton.onClick}
      >
        Execute
      </button>
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
  permissions: -4,
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
  state.execute.mockReset();
  state.requestOwner.mockReset();
  state.ownerPassword = "owner";
  state.files = [createStirlingFile(new File(["pdf"], "protected.pdf"))];
  rememberPdfAccess(state.files[0], local);
});

describe("Remove Password protection status", () => {
  it.each([true, false])(
    "requests the owner locally to retain restrictions; accepted: %s",
    async (accepted) => {
      state.ownerPassword = "";
      state.requestOwner.mockResolvedValue(accepted);
      rememberPdfAccess(state.files[0], {
        ...local,
        requiresOpeningPassword: undefined,
      });
      renderTool();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Execute" }));
      });
      expect(state.requestOwner).toHaveBeenCalledOnce();
      expect(state.execute).toHaveBeenCalledTimes(accepted ? 1 : 0);
      expect(post).not.toHaveBeenCalled();
    },
  );
  it("accepts selections when local owner-password information is unknown without uploading", async () => {
    renderTool();
    expect(screen.getByLabelText("Password to open")).toBeEnabled();
    expect(screen.getByLabelText("Permissions password")).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    });
    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.updateParameter).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("accepts both selections when no protection information is cached", () => {
    clearPdfAccess();
    renderTool();
    expect(screen.getByLabelText("Password to open")).toBeEnabled();
    expect(screen.getByLabelText("Permissions password")).toBeEnabled();
    expect(state.updateParameter).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("disables only roles already known to be absent", () => {
    rememberPdfAccess(state.files[0], {
      ...local,
      requiresOpeningPassword: false,
    });
    renderTool();
    expect(screen.getByLabelText("Password to open")).toBeDisabled();
    expect(screen.getByLabelText("Permissions password")).toBeEnabled();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(state.updateParameter).toHaveBeenCalledWith("password", "");
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps removal selectable for a mixture of unencrypted and protected files", () => {
    rememberPdfAccess(state.files[0], { ...local, encrypted: false });
    const other = createStirlingFile(new File(["second"], "second.pdf"));
    rememberPdfAccess(other, local);
    state.files.push(other);
    renderTool();
    expect(screen.getByLabelText("Permissions password")).toBeEnabled();
    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
    expect(state.updateParameter).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("updates both controls when frontend access changes", () => {
    renderTool();
    act(() => {
      rememberPdfAccess(state.files[0], { ...local, encrypted: false });
    });
    expect(screen.getByLabelText("Password to open")).toBeDisabled();
    expect(screen.getByLabelText("Permissions password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Execute" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });
});
