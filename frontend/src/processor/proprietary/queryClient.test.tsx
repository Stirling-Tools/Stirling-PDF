import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  getPortalQueryClient,
  resetPortalQueryClient,
  tryGetPortalQueryClient,
} from "@portal/queryClient";

const fetchThing = vi.fn(async () => "loaded");

/** Stands in for any portal view: mounts, reads one key, unmounts with the route. */
function PortalRoute() {
  const { data } = useQuery({
    queryKey: ["portal", "thing"],
    queryFn: fetchThing,
  });
  return <span>{data ?? "pending"}</span>;
}

function mountRoute() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={getPortalQueryClient()}>
      {children}
    </QueryClientProvider>
  );
  return render(
    <Wrapper>
      <PortalRoute />
    </Wrapper>,
  );
}

describe("portal query client lifetime", () => {
  beforeEach(() => {
    resetPortalQueryClient();
    fetchThing.mockClear();
  });

  it("serves a remount from cache instead of refetching", async () => {
    const first = mountRoute();
    await screen.findByText("loaded");
    expect(fetchThing).toHaveBeenCalledTimes(1);

    // Switching to the editor unmounts the portal route.
    first.unmount();

    mountRoute();
    // Painted from cache, not after a round trip.
    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(fetchThing).toHaveBeenCalledTimes(1);
  });

  it("hands every caller the same instance", () => {
    expect(getPortalQueryClient()).toBe(getPortalQueryClient());
  });

  it("reports no client until the portal first mounts", () => {
    expect(tryGetPortalQueryClient()).toBeNull();
    const client = getPortalQueryClient();
    expect(tryGetPortalQueryClient()).toBe(client);
  });
});
