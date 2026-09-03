import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import type {
  FailureActionOffer,
  FileRunEvent,
} from "@portal/api/fileRunEvents";

/** The failures table: its states, its copy, faceted filtering, and acting on a row. */

const fetchFileRunEvents = vi.fn();
const applyFileRunEventAction = vi.fn();

// Spread the real module: the queries layer also reads its status helpers.
vi.mock("@portal/api/fileRunEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@portal/api/fileRunEvents")>()),
  fetchFileRunEvents: (...args: unknown[]) => fetchFileRunEvents(...args),
  applyFileRunEventAction: (...args: unknown[]) =>
    applyFileRunEventAction(...args),
}));

// The sources list only exists to turn source ids into display names.
const sourcesData = vi.fn<
  () => { sources: { id: string; name: string }[] } | null
>(() => null);
vi.mock("@portal/queries/sources", () => ({
  useSources: () => ({ data: sourcesData(), loading: false, error: null }),
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
        "portal.failures.kind.inputPasswordProtected.title":
          "Password-protected document",
        "portal.failures.kind.inputPasswordProtected.description":
          "Your file is password protected, so the run could not read it.",
        "portal.failures.kind.unknown.title": "Unrecognised failure",
        "portal.failures.action.acknowledge": "Acknowledge",
        "portal.failures.action.dismiss": "Dismiss",
        "portal.failures.empty.title": "No failures recorded",
        "portal.failures.occurrences": "occurrences",
        "portal.failures.cause.inputRequired": "Input required",
        "portal.failures.scope.open": "Open",
        "portal.failures.scope.closed": "Closed",
        "portal.failures.outcome.dismissed": "Dismissed",
        "portal.failures.outcome.fileRemoved": "File deleted",
        "portal.failures.origin.tool": "Editor tool",
        "portal.failures.origin.policy": "Policy run",
      };
      if (known[key]) return known[key];
      if ((options as { defaultValue?: string })?.defaultValue) {
        return (options as { defaultValue: string }).defaultValue;
      }
      return fallback ?? key;
    },
  }),
}));

// The table reads through the shared query hooks and @app/ui needs Mantine.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, {
    wrapper: ({ children }) => (
      <PortalTestProviders>
        <MemoryRouter>{children}</MemoryRouter>
      </PortalTestProviders>
    ),
  });

const { FileRunEventList } =
  await import("@portal/components/failures/FileRunEventList");

function offer(overrides: Partial<FailureActionOffer>): FailureActionOffer {
  return {
    id: "ACKNOWLEDGE",
    labelKey: "portal.failures.action.acknowledge",
    defaultLabel: "Acknowledge",
    execution: "SERVER",
    slot: "SECONDARY",
    enabled: true,
    disabledReasonKey: null,
    ...overrides,
  };
}

function event(overrides: Partial<FileRunEvent> = {}): FileRunEvent {
  return {
    id: "fre-1",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "POLICY",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "portal.failures.kind.inputPasswordProtected.title",
    descriptionKey: "portal.failures.kind.inputPasswordProtected.description",
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
    actions: [offer({})],
    createdAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

/** Distinguished from the sort header of the same name by its aria-expanded state. */
const userFacetTrigger = () =>
  screen.getByRole("button", { name: "User", expanded: false });

describe("FileRunEventList", () => {
  beforeEach(() => {
    fetchFileRunEvents.mockReset();
    applyFileRunEventAction.mockReset();
    sourcesData.mockReturnValue(null);
  });

  it("shows the kind's sentence, never the raw log, and no document name", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />);

    expect(await screen.findByText("Password-protected document")).toBeTruthy();
    // The human copy the bell uses, not the diagnostic.
    expect(
      screen.getByText(
        "Your file is password protected, so the run could not read it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("The PDF Document is passworded")).toBeNull();
    // No file identity either; the record deliberately holds none.
    expect(screen.queryByText("f-1")).toBeNull();
  });

  it("opens the raw log in a modal from the eye on the row's title", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");

    fireEvent.click(screen.getByRole("button", { name: "View log" }));

    expect(screen.getByText("The PDF Document is passworded")).toBeTruthy();
    expect(screen.getByText("Copy log")).toBeTruthy();
  });

  it("offers no eye on a row with no diagnostic to show", async () => {
    fetchFileRunEvents.mockResolvedValue([event({ detail: null })]);

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");

    expect(screen.queryByRole("button", { name: "View log" })).toBeNull();
  });

  it("files each row under its directory cause, never the server's stage", async () => {
    fetchFileRunEvents.mockResolvedValue([
      // A classified kind takes its directory grouping...
      event(),
      // ...and anything unclassified is just unrecognised, wherever it failed.
      event({
        id: "fre-2",
        kindId: "SOMETHING_NEW",
        stage: "INTERNAL",
        titleKey: "portal.failures.kind.somethingNew.title",
        descriptionKey: "portal.failures.kind.somethingNew.description",
        defaultTitle: "Brand-new failure",
      }),
    ]);

    render(<FileRunEventList />);

    expect(await screen.findByText("Input required")).toBeTruthy();
    expect(screen.getByText("Unrecognised")).toBeTruthy();
    expect(screen.queryByText(/internal/i)).toBeNull();
  });

  it("names the person whose editor hit it, and where it failed", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event({ origin: "TOOL", actor: "dana@example.com", runId: null }),
    ]);

    render(<FileRunEventList />);

    expect(await screen.findByText("Editor tool")).toBeTruthy();
    expect(screen.getByText("dana@example.com")).toBeTruthy();
  });

  it("names the source when no user was involved, since that is the only attribution", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event({ origin: "POLICY", actor: null, sourceId: "src-s3-invoices" }),
    ]);

    render(<FileRunEventList />);

    expect(await screen.findByText("src-s3-invoices")).toBeTruthy();
  });

  it("shows the source's display name once the sources list resolves it", async () => {
    sourcesData.mockReturnValue({
      sources: [{ id: "src-s3-invoices", name: "Invoice bucket" }],
    });
    fetchFileRunEvents.mockResolvedValue([
      event({ origin: "POLICY", actor: null, sourceId: "src-s3-invoices" }),
    ]);

    render(<FileRunEventList />);

    expect(await screen.findByText("Invoice bucket")).toBeTruthy();
    expect(screen.queryByText("src-s3-invoices")).toBeNull();
  });

  it("shows the occurrence count only once a failure has repeated", async () => {
    fetchFileRunEvents.mockResolvedValue([event({ occurrences: 1 })]);
    const { unmount } = render(<FileRunEventList />);
    await screen.findByText("Password-protected document");
    expect(screen.queryByText(/occurrences/)).toBeNull();
    unmount();

    fetchFileRunEvents.mockResolvedValue([event({ occurrences: 14 })]);
    render(<FileRunEventList />);
    expect(await screen.findByText(/occurrences/)).toBeTruthy();
  });

  it("narrows to the picked value and restores on clear", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event(),
      event({
        id: "fre-2",
        actor: "lee@example.com",
        kindId: "UNKNOWN",
        titleKey: "portal.failures.kind.unknown.title",
        descriptionKey: "portal.failures.kind.unknown.description",
        defaultTitle: "Unrecognised failure",
      }),
    ]);

    render(<FileRunEventList />);
    await screen.findByText("Unrecognised failure");

    fireEvent.click(userFacetTrigger());
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /dana@example.com/ }),
    );

    // Only dana's failure survives the pick.
    expect(screen.queryByText("Unrecognised failure")).toBeNull();
    expect(screen.getByText("Password-protected document")).toBeTruthy();

    // The pick surfaced the clear affordance; clearing restores the row.
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Unrecognised failure")).toBeTruthy();
  });

  it("chains facets: a second pick narrows within the first", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event(),
      event({ id: "fre-2", origin: "TOOL" }),
      event({
        id: "fre-3",
        actor: "lee@example.com",
        kindId: "UNKNOWN",
        titleKey: "portal.failures.kind.unknown.title",
        descriptionKey: "portal.failures.kind.unknown.description",
        defaultTitle: "Unrecognised failure",
      }),
    ]);

    render(<FileRunEventList />);
    await screen.findByText("Unrecognised failure");

    // First facet: dana only (drops lee's row).
    fireEvent.click(userFacetTrigger());
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /dana@example.com/ }),
    );
    expect(screen.queryByText("Unrecognised failure")).toBeNull();
    expect(screen.getAllByText("Password-protected document")).toHaveLength(2);

    // Second facet chains on top: dana AND failed-in-policy.
    fireEvent.click(
      screen.getByRole("button", { name: "Failed in", expanded: false }),
    );
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Policy run/ }),
    );
    expect(screen.getAllByText("Password-protected document")).toHaveLength(1);
  });

  it("matches the search text against the raw diagnostic", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event(),
      event({
        id: "fre-2",
        detail: "AI engine returned error: 502",
        kindId: "UNKNOWN",
        titleKey: "portal.failures.kind.unknown.title",
        descriptionKey: "portal.failures.kind.unknown.description",
        defaultTitle: "Unrecognised failure",
      }),
    ]);

    render(<FileRunEventList />);
    await screen.findByText("Unrecognised failure");

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search failures, users and logs",
      }),
      {
        target: { value: "502" },
      },
    );

    expect(screen.queryByText("Password-protected document")).toBeNull();
    expect(screen.getByText("Unrecognised failure")).toBeTruthy();
  });

  it("shows an empty state when there is nothing to triage", async () => {
    fetchFileRunEvents.mockResolvedValue([]);

    render(<FileRunEventList />);

    expect(await screen.findByText("No failures recorded")).toBeTruthy();
  });

  it("explains itself rather than erroring when the server has no failure registry", async () => {
    // A core-only build has no such route, which is no reviewer's problem.
    fetchFileRunEvents.mockRejectedValue(new Error("404"));

    render(<FileRunEventList />);

    expect(await screen.findByText("Nothing to review")).toBeTruthy();
    expect(screen.queryByText("No failures recorded")).toBeNull();
  });

  it("says so for a caller the server refuses", async () => {
    // Leader-only, so a member's read 403s; a whole screen must say why it is empty.
    fetchFileRunEvents.mockRejectedValue(new Error("403"));

    const { container } = render(<FileRunEventList />);

    expect(await screen.findByText("Nothing to review")).toBeTruthy();
    expect(container.querySelector(".sui-datatable")).toBeNull();
  });

  it("replaces the acted-on row in place using the server's response", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);
    applyFileRunEventAction.mockResolvedValue(
      event({ status: "ACKNOWLEDGED", statusActor: "me@example.com" }),
    );

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Acknowledge" }));

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

  it("keeps Dismiss as every row's second button", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event({
        actions: [
          offer({}),
          offer({
            id: "DISMISS",
            labelKey: "portal.failures.action.dismiss",
            defaultLabel: "Dismiss",
            slot: "OVERFLOW",
          }),
        ],
      }),
    ]);
    applyFileRunEventAction.mockResolvedValue(
      event({ status: "DISMISSED", statusActor: "me@example.com" }),
    );

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(applyFileRunEventAction).toHaveBeenCalledWith("fre-1", "DISMISS");
    });
  });

  it("reads the closed queue when the reader switches scope", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");
    expect(fetchFileRunEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ closed: false }),
    );

    fetchFileRunEvents.mockResolvedValue([
      event({ status: "DISMISSED", statusActor: "ops@example.com" }),
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "Closed" }));

    await waitFor(() =>
      expect(fetchFileRunEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ closed: true }),
      ),
    );
  });

  it("shows how a closed failure was settled, and by whom", async () => {
    fetchFileRunEvents.mockResolvedValueOnce([]);
    fetchFileRunEvents.mockResolvedValue([
      event({ status: "DISMISSED", statusActor: "ops@example.com" }),
      event({ id: "fre-2", status: "FILE_REMOVED", statusActor: null }),
    ]);

    render(<FileRunEventList />);
    fireEvent.click(screen.getByRole("radio", { name: "Closed" }));

    expect(await screen.findByText("Dismissed")).toBeTruthy();
    expect(screen.getByText("File deleted")).toBeTruthy();
    expect(screen.getByText("ops@example.com")).toBeTruthy();
    // Nobody closed it by hand, so the actor column names the system instead.
    expect(screen.getByText("Stirling")).toBeTruthy();
  });

  it("offers no outcome column while the open queue is showing", async () => {
    fetchFileRunEvents.mockResolvedValue([event()]);

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");

    expect(screen.queryByRole("columnheader", { name: /outcome/i })).toBeNull();
  });

  it("takes a dismissed row out of the open queue rather than greying it in place", async () => {
    fetchFileRunEvents.mockResolvedValue([
      event({
        actions: [
          offer({
            id: "DISMISS",
            labelKey: "portal.failures.action.dismiss",
            defaultLabel: "Dismiss",
            slot: "OVERFLOW",
          }),
        ],
      }),
    ]);
    applyFileRunEventAction.mockResolvedValue(
      event({ status: "DISMISSED", statusActor: "me@example.com" }),
    );

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    // It belongs to the closed queue now, so the open one must stop listing it.
    await waitFor(() =>
      expect(screen.queryByText("Password-protected document")).toBeNull(),
    );
  });

  it("re-reads from the server when an action is refused", async () => {
    // A 409 means someone else closed it first; the server's view wins.
    fetchFileRunEvents.mockResolvedValue([event()]);
    applyFileRunEventAction.mockRejectedValue(new Error("409"));

    render(<FileRunEventList />);
    await screen.findByText("Password-protected document");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Acknowledge" }));

    await waitFor(() => {
      expect(fetchFileRunEvents).toHaveBeenCalledTimes(2);
    });
  });
});
