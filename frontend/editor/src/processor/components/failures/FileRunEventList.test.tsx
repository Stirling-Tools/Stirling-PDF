import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as baseRender, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";
import type { FileRunEvent } from "@processor/api/fileRunEvents";

/**
 * Tests for the list: the states it survives (loading, empty, no registry, refused),
 * plus replacing a row in place after acting, re-reading when the server refuses, and
 * bringing itself into view when a notification links to it.
 */

// jsdom does no layout and so implements no scrollIntoView.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

const fetchFileRunEvents = vi.fn();
const applyFileRunEventAction = vi.fn();

vi.mock("@processor/api/fileRunEvents", () => ({
  fetchFileRunEvents: (...args: unknown[]) => fetchFileRunEvents(...args),
  applyFileRunEventAction: (...args: unknown[]) =>
    applyFileRunEventAction(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Faithful to i18next: a known key resolves, an unknown key falls back to
    // defaultValue. That is what exercises the server-key-then-generic chain.
    // i18next's real signature: t(key, options) or t(key, defaultValue, options).
    t: (
      key: string,
      second?: { defaultValue?: string } | string,
      third?: Record<string, unknown>,
    ) => {
      const options = typeof second === "string" ? third : second;
      const fallback = typeof second === "string" ? second : undefined;
      const known: Record<string, string> = {
        "processor.failures.kind.inputPasswordProtected.title":
          "Password-protected document",
        "processor.failures.action.acknowledge": "Acknowledge",
        "processor.failures.empty.title": "No failures recorded",
        "processor.failures.occurrences": "occurrences",
        "processor.failures.runReference": "Run r1",
        "processor.failures.stage.input": "Input",
        "processor.failures.origin.tool": "Tool run",
        "processor.failures.origin.policy": "Policy",
      };
      if (key === "processor.failures.fromSource") {
        return `From source ${(options as { source?: string })?.source ?? ""}`;
      }
      if (key === "processor.failures.reportedBy") {
        return `Hit by ${(options as { actor?: string })?.actor ?? ""}`;
      }
      if (known[key]) return known[key];
      if ((options as { defaultValue?: string })?.defaultValue) {
        return (options as { defaultValue: string }).defaultValue;
      }
      return fallback ?? key;
    },
  }),
}));

// The list reads through the shared query hooks, @app/ui needs Mantine, and the section reads
// the location to know whether it was linked to.
const render = (
  ui: Parameters<typeof baseRender>[0],
  at = "/processor/documents",
) =>
  baseRender(ui, {
    wrapper: ({ children }) => (
      <ProcessorTestProviders>
        <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>
      </ProcessorTestProviders>
    ),
  });

const { FileRunEventList } =
  await import("@processor/components/failures/FileRunEventList");

function event(overrides: Partial<FileRunEvent> = {}): FileRunEvent {
  return {
    id: "fre-1",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "POLICY",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "processor.failures.kind.inputPasswordProtected.title",
    descriptionKey:
      "processor.failures.kind.inputPasswordProtected.description",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded",
    policyId: "p1",
    runId: "r1",
    sourceId: null,
    fileId: "f-1",
    actor: "dana@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    actions: [
      {
        id: "ACKNOWLEDGE",
        labelKey: "processor.failures.action.acknowledge",
        enabled: true,
        disabledReasonKey: null,
      },
    ],
    createdAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

describe("FileRunEventList", () => {
  beforeEach(() => {
    fetchFileRunEvents.mockReset();
    applyFileRunEventAction.mockReset();
    scrollIntoView.mockReset();
    // The dev-panel test stubs import.meta.env.DEV, which would otherwise persist
    // into every test after it.
    vi.unstubAllEnvs();
  });

  it("renders a row's title, run reference and raw detail, but no document name", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />);

    expect(await screen.findByText("Password-protected document")).toBeTruthy();
    // A run reference, not a document name: the record holds no file identity.
    expect(screen.getByText("Run r1")).toBeTruthy();
    // The raw message is shown, not swallowed: for an unclassified failure it is
    // the only diagnostic available.
    expect(screen.getByText("The PDF Document is passworded")).toBeTruthy();
  });

  it("names the person whose editor hit it, and marks it a tool run", async () => {
    // The point of reporting editor failures: a reviewer needs the person, since a
    // run reference means nothing for a failure that never had a run.
    fetchFileRunEvents.mockResolvedValue([
      event({ origin: "TOOL", actor: "dana@example.com", runId: null }),
    ]);

    render(<FileRunEventList />);

    expect(await screen.findByText("Tool run")).toBeTruthy();
    expect(screen.getByText("Hit by dana@example.com")).toBeTruthy();
  });

  it("names the source when no user was involved, since that is the only attribution", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event({ origin: "POLICY", actor: null, sourceId: "src-s3-invoices" }),
    ]);

    render(<FileRunEventList />);

    expect(await screen.findByText("From source src-s3-invoices")).toBeTruthy();
  });

  it("shows the occurrence count only once a failure has repeated", async () => {
    fetchFileRunEvents.mockResolvedValue([event({ occurrences: 1 })]);
    const { unmount } = render(<FileRunEventList />);
    await screen.findByText("Run r1");
    expect(screen.queryByText(/occurrences/)).toBeNull();
    unmount();

    fetchFileRunEvents.mockResolvedValue([event({ occurrences: 14 })]);
    render(<FileRunEventList />);
    expect(await screen.findByText(/occurrences/)).toBeTruthy();
  });

  it("shows an empty state when there is nothing to triage", async () => {
    fetchFileRunEvents.mockResolvedValue([]);

    render(<FileRunEventList />);

    expect(await screen.findByText("No failures recorded")).toBeTruthy();
  });

  it("renders nothing when the server has no failure registry", async () => {
    // A core-only build has no such route, which is not worth showing a reviewer as
    // an error, so the section stays silent.
    fetchFileRunEvents.mockRejectedValue(new Error("404"));

    const { container } = render(<FileRunEventList />);

    await waitFor(() => {
      expect(container.querySelector(".processor-failures__list")).toBeNull();
    });
    expect(screen.queryByText("No failures recorded")).toBeNull();
  });

  it("renders no heading at all for a caller the server refuses", async () => {
    // Reviewing is leader-only, so a member's read returns 403. With no dev panel to
    // frame, the whole section goes rather than leaving a bare heading.
    vi.stubEnv("DEV", false);
    fetchFileRunEvents.mockRejectedValue(new Error("403"));

    const { container } = render(<FileRunEventList />);

    await waitFor(() => {
      expect(container.querySelector(".processor-failures")).toBeNull();
    });
    // No section, and specifically no heading: Mantine puts its <style> tags in
    // the container, so "renders nothing" is asserted on our own output.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".processor-failures__debug")).toBeNull();
  });

  it("replaces the acted-on row in place using the server's response", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);
    applyFileRunEventAction.mockResolvedValue(
      event({ status: "ACKNOWLEDGED", statusActor: "me@example.com" }),
    );

    render(<FileRunEventList />);
    const button = await screen.findByRole("button", {
      name: "Acknowledge",
    });
    button.click();

    await waitFor(() => {
      expect(applyFileRunEventAction).toHaveBeenCalledWith(
        "fre-1",
        "ACKNOWLEDGE",
      );
    });
    // Updated from the response rather than by refetching, so the list does not
    // reload and jump under the reviewer.
    expect(fetchFileRunEvents).toHaveBeenCalledTimes(1);
  });

  it("brings itself into view when a notification links to it", async () => {
    // It sits below the review queue, so landing on the page is not the same as seeing it.
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />, "/processor/documents#failures");

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("stays where it is on an ordinary visit to the page", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />);

    await screen.findByText("Password-protected document");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("re-reads from the server when an action is refused", async () => {
    // A 409 means someone else closed it first; the server's view wins.
    fetchFileRunEvents.mockResolvedValue([event()]);
    applyFileRunEventAction.mockRejectedValue(new Error("409"));

    render(<FileRunEventList />);
    const button = await screen.findByRole("button", {
      name: "Acknowledge",
    });
    button.click();

    await waitFor(() => {
      expect(fetchFileRunEvents).toHaveBeenCalledTimes(2);
    });
  });
});
