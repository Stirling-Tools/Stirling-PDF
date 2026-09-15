import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  getProcessorQueryClient,
  resetProcessorQueryClient,
  tryGetProcessorQueryClient,
} from "@processor/queryClient";

const fetchThing = vi.fn(async () => "loaded");

/** Stands in for any processor view: mounts, reads one key, unmounts with the route. */
function ProcessorRoute() {
  const { data } = useQuery({
    queryKey: ["processor", "thing"],
    queryFn: fetchThing,
  });
  return <span>{data ?? "pending"}</span>;
}

function mountRoute() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={getProcessorQueryClient()}>
      {children}
    </QueryClientProvider>
  );
  return render(
    <Wrapper>
      <ProcessorRoute />
    </Wrapper>,
  );
}

describe("processor query client lifetime", () => {
  beforeEach(() => {
    resetProcessorQueryClient();
    fetchThing.mockClear();
  });

  it("serves a remount from cache instead of refetching", async () => {
    const first = mountRoute();
    await screen.findByText("loaded");
    expect(fetchThing).toHaveBeenCalledTimes(1);

    // Switching to the editor unmounts the processor route.
    first.unmount();

    mountRoute();
    // Painted from cache, not after a round trip.
    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(fetchThing).toHaveBeenCalledTimes(1);
  });

  it("hands every caller the same instance", () => {
    expect(getProcessorQueryClient()).toBe(getProcessorQueryClient());
  });

  it("reports no client until the processor first mounts", () => {
    expect(tryGetProcessorQueryClient()).toBeNull();
    const client = getProcessorQueryClient();
    expect(tryGetProcessorQueryClient()).toBe(client);
  });
});
