import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LazyToolSection } from "@app/components/tools/toolPicker/LazyToolSection";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnected = false;
  root = null;
  rootMargin = "";
  thresholds = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {
    this.disconnected = true;
  }

  unobserve() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  intersect() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function renderSection(estimatedHeight = 200) {
  return render(
    <MantineProvider>
      <LazyToolSection estimatedHeight={estimatedHeight}>
        <div>Tool list</div>
      </LazyToolSection>
    </MantineProvider>,
  );
}

describe("LazyToolSection", () => {
  const originalIntersectionObserver = global.IntersectionObserver;

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    global.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
  });

  it("holds the children back until the section intersects", () => {
    const { container } = renderSection(240);

    expect(screen.queryByText("Tool list")).not.toBeInTheDocument();
    const placeholder = container.querySelector("div[style]") as HTMLElement;
    expect(placeholder.style.minHeight).toBe("240px");
    expect(MockIntersectionObserver.instances).toHaveLength(1);
  });

  it("mounts the children on intersection and stops observing", async () => {
    renderSection();

    await act(async () => {
      MockIntersectionObserver.instances[0].intersect();
    });

    await waitFor(() => {
      expect(screen.getByText("Tool list")).toBeInTheDocument();
    });
    expect(MockIntersectionObserver.instances[0].disconnected).toBe(true);
  });

  it("mounts immediately when IntersectionObserver is unavailable", () => {
    global.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;

    renderSection();

    expect(screen.getByText("Tool list")).toBeInTheDocument();
  });
});
