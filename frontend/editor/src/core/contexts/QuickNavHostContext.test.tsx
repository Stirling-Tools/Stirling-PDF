import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import {
  QuickNavHostProvider,
  useQuickNavHost,
  useRegisterQuickNavHost,
  useSuppressQuickNavRail,
} from "@app/contexts/QuickNavHostContext";

function Probe({ onRead }: { onRead: (value: unknown) => void }) {
  const host = useQuickNavHost();
  onRead({
    appMounted: host?.appMounted,
    chromeless: host?.chromeless,
    identity: host?.identity,
    activeTool: host?.activeTool,
    goToDefaultState: Boolean(host?.actions.current?.goToDefaultState),
  });
  return null;
}

function App() {
  useRegisterQuickNavHost(
    { identity: { displayName: "Ada", profilePictureUrl: null } },
    { goToDefaultState: () => {} },
  );
  return null;
}

function AppWithTool({ tool }: { tool: "automate" | null }) {
  useRegisterQuickNavHost({ activeTool: tool }, {});
  return null;
}

function LoginRoute() {
  useSuppressQuickNavRail();
  return null;
}

function setup() {
  let latest: Record<string, unknown> = {};
  const view = render(
    <QuickNavHostProvider>
      <Probe onRead={(value) => (latest = value as Record<string, unknown>)} />
      <App />
    </QuickNavHostProvider>,
  );
  return { view, read: () => latest };
}

describe("QuickNavHostContext", () => {
  it("keeps what the app published after it unmounts, but drops its handlers", () => {
    // Data survives the gap between one app unmounting and the next registering.
    const { view, read } = setup();

    expect(read().appMounted).toBe(true);
    expect(read().identity).toEqual({
      displayName: "Ada",
      profilePictureUrl: null,
    });
    expect(read().goToDefaultState).toBe(true);

    view.rerender(
      <QuickNavHostProvider>
        <Probe onRead={() => {}} />
      </QuickNavHostProvider>,
    );

    // Re-read through a fresh probe in the same provider.
    let after: Record<string, unknown> = {};
    view.rerender(
      <QuickNavHostProvider>
        <Probe onRead={(value) => (after = value as Record<string, unknown>)} />
      </QuickNavHostProvider>,
    );
    expect(after.appMounted).toBe(true);
    expect(after.goToDefaultState).toBe(false);
  });

  it("clears the open tool when the next app registers without one", () => {
    let latest: Record<string, unknown> = {};
    const view = render(
      <QuickNavHostProvider>
        <Probe
          onRead={(value) => (latest = value as Record<string, unknown>)}
        />
        <AppWithTool tool="automate" />
      </QuickNavHostProvider>,
    );
    expect(latest.activeTool).toBe("automate");

    act(() => {
      view.rerender(
        <QuickNavHostProvider>
          <Probe
            onRead={(value) => (latest = value as Record<string, unknown>)}
          />
          <AppWithTool tool={null} />
        </QuickNavHostProvider>,
      );
    });
    expect(latest.activeTool).toBe(null);
  });

  it("hides the bar while a route with no app chrome is on screen", () => {
    // appMounted is sticky, so it can't answer "is an app on screen now".
    const { view, read } = setup();
    expect(read().chromeless).toBe(false);

    act(() => {
      view.rerender(
        <QuickNavHostProvider>
          <Probe onRead={() => {}} />
          <App />
          <LoginRoute />
        </QuickNavHostProvider>,
      );
    });

    let during: Record<string, unknown> = {};
    view.rerender(
      <QuickNavHostProvider>
        <Probe
          onRead={(value) => (during = value as Record<string, unknown>)}
        />
        <App />
        <LoginRoute />
      </QuickNavHostProvider>,
    );
    expect(during.chromeless).toBe(true);
  });

  it("brings the bar back when that route leaves", () => {
    const { view } = setup();

    act(() => {
      view.rerender(
        <QuickNavHostProvider>
          <Probe onRead={() => {}} />
          <App />
          <LoginRoute />
        </QuickNavHostProvider>,
      );
    });

    let after: Record<string, unknown> = {};
    act(() => {
      view.rerender(
        <QuickNavHostProvider>
          <Probe
            onRead={(value) => (after = value as Record<string, unknown>)}
          />
          <App />
        </QuickNavHostProvider>,
      );
    });
    expect(after.chromeless).toBe(false);
  });
});
