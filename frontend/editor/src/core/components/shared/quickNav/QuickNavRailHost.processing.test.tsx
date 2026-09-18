import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import {
  QuickNavHostProvider,
  useRegisterQuickNavView,
  type QuickNavHostActions,
} from "@app/contexts/QuickNavHostContext";
import { consumeProcessingFolderCreationRequest } from "@app/utils/pendingProcessingFolderCreation";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

const capability = vi.hoisted(() => ({ available: true }));
const connected = vi.hoisted(() => ({ value: true }));
vi.mock("@app/hooks/useProcessingFolderCreation", () => ({
  get canCreateProcessingFolders() {
    return capability.available;
  },
}));
vi.mock("@app/hooks/useConnectedServer", () => ({
  useConnectedServer: () => connected.value,
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/quickNav/QuickNavRailContainer", () => ({
  QuickNavRailContainer: ({ groups }: { groups: QuickNavEntry[][] }) => (
    <>
      {groups.flat().map((entry) => (
        <button
          key={entry.id}
          disabled={entry.disabled}
          onClick={entry.disabled ? undefined : entry.onClick}
        >
          {entry.label}
        </button>
      ))}
    </>
  ),
}));

function Host({ actions }: { actions: QuickNavHostActions }) {
  useRegisterQuickNavView({}, actions);
  const { pathname } = useLocation();
  return <output aria-label="Current path">{pathname}</output>;
}

function setup(path: string, actions: QuickNavHostActions = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QuickNavHostProvider>
        <Host actions={actions} />
        <QuickNavRailHost />
      </QuickNavHostProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  capability.available = true;
  connected.value = true;
  consumeProcessingFolderCreationRequest();
});

it.each(["/settings/general", "/docs", "/processor"])(
  "keeps folder processing available on %s and carries the request to the editor",
  (path) => {
    setup(path);
    fireEvent.click(
      screen.getByRole("button", { name: "processingFolders.setup.title" }),
    );
    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      EDITOR_BASENAME,
    );
    expect(consumeProcessingFolderCreationRequest()).toBe(true);
    expect(consumeProcessingFolderCreationRequest()).toBe(false);
  },
);

it("opens directly when the current screen supplies the folder providers", () => {
  const createProcessingFolder = vi.fn();
  setup("/compress-pdf", { createProcessingFolder });
  fireEvent.click(
    screen.getByRole("button", { name: "processingFolders.setup.title" }),
  );
  expect(createProcessingFolder).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Current path")).toHaveTextContent(
    "/compress-pdf",
  );
  expect(consumeProcessingFolderCreationRequest()).toBe(false);
});

it("does not leave a pending request when navigation is declined", () => {
  const requestNavigation = vi.fn();
  setup("/settings/general", { requestNavigation });
  fireEvent.click(
    screen.getByRole("button", { name: "processingFolders.setup.title" }),
  );
  expect(requestNavigation).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Current path")).toHaveTextContent(
    "/settings/general",
  );
  expect(consumeProcessingFolderCreationRequest()).toBe(false);
});

it("omits folder processing in builds without the feature", () => {
  capability.available = false;
  setup("/settings/general");
  expect(
    screen.queryByRole("button", { name: "processingFolders.setup.title" }),
  ).toBeNull();
});

it("disables folder processing and automate with no connected server", () => {
  connected.value = false;
  const createProcessingFolder = vi.fn();
  setup("/compress-pdf", { createProcessingFolder });

  const processing = screen.getByRole("button", {
    name: "processingFolders.setup.title",
  });
  const automate = screen.getByRole("button", {
    name: "quickAccess.automate",
  });
  expect(processing).toBeDisabled();
  expect(automate).toBeDisabled();

  fireEvent.click(processing);
  expect(createProcessingFolder).not.toHaveBeenCalled();
  expect(consumeProcessingFolderCreationRequest()).toBe(false);
});
