import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import {
  QuickNavHostProvider,
  useQuickNavHost,
  useRegisterQuickNavHost,
  useSuppressQuickNavRail,
} from "@app/contexts/QuickNavHostContext";

/** None of these are visible from the rail's markup, so they are pinned here. */

function Probe({ onRead }: { onRead: (value: unknown) => void }) {
  const host = useQuickNavHost();
  onRead({
    appMounted: host?.appMounted,
    chromeless: host?.chromeless,
    hasTeams: host?.hasTeams,
    identity: host?.identity,
    openSettings: Boolean(host?.actions.current?.openSettings),
  });
  return null;
}

function App() {
  useRegisterQuickNavHost(
    { identity: { displayName: "Ada", profilePictureUrl: null } },
    { openSettings: () => {}, openTeams: () => {} },
  );
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
    // A switch unmounts one app a commit before the next registers; blanking the
    // avatar there is the blink the hoist exists to avoid. Handlers are the
    // exception - calling into a torn-down tree is not harmless.
    const { view, read } = setup();

    expect(read().appMounted).toBe(true);
    expect(read().identity).toEqual({
      displayName: "Ada",
      profilePictureUrl: null,
    });
    expect(read().openSettings).toBe(true);

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
    expect(after.hasTeams).toBe(true);
    expect(after.openSettings).toBe(false);
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
