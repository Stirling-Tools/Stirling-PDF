import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { SigningSessionThumbnail } from "@app/components/shared/signing/SigningSessionThumbnail";

const state = vi.hoisted(() => ({
  visible: false,
  userId: "alice",
  fetch: vi.fn(),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: state.userId } }),
}));
vi.mock("@mantine/hooks", () => ({
  useIntersection: () => ({
    ref: vi.fn(),
    entry: { isIntersecting: state.visible },
  }),
}));
vi.mock("@app/api/signing", () => ({
  fetchSigningThumbnail: (...args: unknown[]) => state.fetch(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.visible = false;
  state.userId = "alice";
  state.fetch.mockResolvedValue(new Blob(["preview"], { type: "image/png" }));
});

function setup() {
  const client = new QueryClient();
  const view = (finalized = false) => (
    <QueryClientProvider client={client}>
      <SigningSessionThumbnail sessionId="session-1" finalized={finalized} />
    </QueryClientProvider>
  );
  return { ...render(view()), view };
}

it("defers off-screen previews and releases their object URLs on unmount", async () => {
  const { container, rerender, view, unmount } = setup();
  expect(state.fetch).not.toHaveBeenCalled();
  state.visible = true;
  rerender(view());
  await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  expect(state.fetch).toHaveBeenCalledWith(
    "session-1",
    expect.any(AbortSignal),
  );
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("mocked-url");
});

it("refetches on finalization and never displays a previous account's preview", async () => {
  state.visible = true;
  const { container, rerender, view } = setup();
  await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  state.fetch.mockResolvedValueOnce(
    new Blob(["signed"], { type: "image/png" }),
  );
  rerender(view(true));
  await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
  state.fetch.mockReturnValue(new Promise(() => {}));
  state.userId = "bob";
  rerender(view(true));
  expect(container.querySelector("img")).toBeNull();
  await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(3));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it("keeps a quiet placeholder when a preview cannot be read", async () => {
  state.visible = true;
  state.fetch.mockRejectedValue(new Error("Forbidden"));
  const { container } = setup();
  await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});
