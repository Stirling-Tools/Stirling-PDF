import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EnterpriseApp } from "@processor/EnterpriseApp";

describe("self-hosted EnterpriseApp", () => {
  const original = window.location;
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    Object.defineProperty(window, "location", {
      value: { ...original, replace },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: original,
      writable: true,
    });
  });

  it("forwards to the hosted Enterprise page, keeping the link's query and hash", () => {
    render(
      <MemoryRouter initialEntries={["/enterprise?source=sales#quote"]}>
        <EnterpriseApp />
      </MemoryRouter>,
    );
    expect(replace).toHaveBeenCalledOnce();
    const target = new URL(replace.mock.calls[0][0]);
    expect(target.pathname).toMatch(/\/enterprise$/);
    expect(target.search).toBe("?source=sales");
    expect(target.hash).toBe("#quote");
  });
});
