import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ChangeEvent } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));
// Mantine's PasswordInput loops under jsdom + React 19, so render it flat
vi.mock("@mantine/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PasswordInput: (props: {
    label: string;
    description: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    "data-testid"?: string;
  }) => (
    <label>
      {props.label}
      <span>{props.description}</span>
      <input
        data-testid={props["data-testid"]}
        value={props.value}
        onChange={props.onChange}
      />
    </label>
  ),
}));
const lockedIds = new Set<string>();
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({
    selectors: {
      getStirlingFileStub: (id: string) => ({
        processedFile: { isEncrypted: lockedIds.has(id) },
      }),
    },
  }),
}));

import {
  LockedDocumentPasswordField,
  useLockedDocumentStep,
} from "@app/components/tools/shared/LockedDocumentPasswordField";
import { useLockedDocuments } from "@app/hooks/tools/shared/useLockedDocuments";
import type { LockedDocumentMode } from "@app/hooks/tools/shared/useLockedDocuments";
import {
  clearLockedDocumentAccess,
  getLockedDocumentAccess,
  setLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";
import { createStirlingFile, type StirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const file = (id: string) =>
  createStirlingFile(
    new File(["%PDF"], `${id}.pdf`, { type: "application/pdf" }),
    id as FileId,
  );

function Field({
  files,
  mode,
}: {
  files: StirlingFile[];
  mode: LockedDocumentMode;
}) {
  const summary = useLockedDocuments(files);
  return <LockedDocumentPasswordField summary={summary} mode={mode} />;
}

const renderField = (files: StirlingFile[], mode: LockedDocumentMode) =>
  render(
    <MantineProvider>
      <Field files={files} mode={mode} />
    </MantineProvider>,
  );

afterEach(() => {
  // Unmount first: clearing the store re-renders anything still subscribed.
  cleanup();
  clearLockedDocumentAccess();
  lockedIds.clear();
});

describe("LockedDocumentPasswordField", () => {
  it("renders nothing when no selected file is locked or unlocked in-app", () => {
    renderField([file("plain")], "append");

    expect(
      screen.queryByTestId("locked-document-password"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("locked-document-original-notice"),
    ).not.toBeInTheDocument();
  });

  it("asks for the password of a locked file with wording for the tool kind", () => {
    lockedIds.add("locked");

    renderField([file("locked")], "append");

    expect(screen.getByTestId("locked-document-password")).toBeInTheDocument();
    expect(
      screen.getByText(/the result stays password protected/),
    ).toBeInTheDocument();
  });

  it("stores the typed password against the locked file, not in tool params", () => {
    lockedIds.add("locked");
    const locked = file("locked");
    renderField([locked], "audit");
    expect(screen.getByText(/the file is not changed/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("locked-document-password"), {
      target: { value: "typed" },
    });

    expect(getLockedDocumentAccess("locked")).toEqual({
      source: locked,
      password: "typed",
      origin: "entered",
    });
    expect(screen.getByTestId("locked-document-password")).toHaveValue("typed");

    fireEvent.change(screen.getByTestId("locked-document-password"), {
      target: { value: "" },
    });
    expect(getLockedDocumentAccess("locked")).toBeUndefined();
  });

  it("explains that an unlocked copy is sent as the original", () => {
    setLockedDocumentAccess("unlocked", {
      source: file("original"),
      password: "pw",
      origin: "unlocked",
    });

    renderField([file("unlocked")], "audit");

    expect(
      screen.getByTestId("locked-document-original-notice"),
    ).toHaveTextContent(
      "so its signatures are checked exactly as they were signed",
    );
    expect(
      screen.queryByTestId("locked-document-password"),
    ).not.toBeInTheDocument();
  });
});

describe("useLockedDocumentStep", () => {
  it("shows the step and blocks running only while a password is missing", () => {
    lockedIds.add("locked");
    const files = [file("locked")];
    const { result, rerender } = renderHook(() =>
      useLockedDocumentStep({ files, mode: "append" }),
    );
    expect(result.current.step.isVisible).toBe(true);
    expect(result.current.ready).toBe(false);

    act(() => {
      setLockedDocumentAccess("locked", {
        source: files[0],
        password: "typed",
        origin: "entered",
      });
    });
    rerender();

    expect(result.current.ready).toBe(true);
  });

  it("hides the step for plain files", () => {
    const files = [file("plain")];
    const { result } = renderHook(() =>
      useLockedDocumentStep({ files, mode: "audit" }),
    );

    expect(result.current.step.isVisible).toBe(false);
    expect(result.current.ready).toBe(true);
  });
});
