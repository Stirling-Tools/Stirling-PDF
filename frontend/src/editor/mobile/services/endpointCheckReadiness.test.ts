import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  isEndpointCheckBackendOnline,
  subscribeToEndpointCheckReadiness,
} from "@editor/services/endpointCheckReadiness";

const state = vi.hoisted(() => ({
  mode: "saas" as "saas" | "selfhosted" | "local" | null,
  cloudOnline: false,
  serverOnline: false,
  cloudListeners: new Set<() => void>(),
}));

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => state.mode,
    subscribeToModeChanges: () => () => {},
  },
}));
vi.mock("@editor/services/saasServerMonitor", () => ({
  saasServerMonitor: {
    getSnapshot: () => ({ isOnline: state.cloudOnline }),
    subscribe: (listener: () => void) => {
      state.cloudListeners.add(listener);
      return () => state.cloudListeners.delete(listener);
    },
  },
}));
vi.mock("@editor/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => ({ isOnline: state.serverOnline }),
    subscribe: () => () => {},
  },
}));

beforeEach(() => {
  state.mode = "saas";
  state.cloudOnline = false;
  state.serverOnline = false;
  state.cloudListeners.clear();
});

describe("endpoint checks on a phone", () => {
  test("wait for the cloud in cloud mode, whatever a self-hosted server says", () => {
    state.serverOnline = true;
    expect(isEndpointCheckBackendOnline()).toBe(false);
    state.cloudOnline = true;
    expect(isEndpointCheckBackendOnline()).toBe(true);
  });

  test("wait for the self-hosted server in self-hosted mode", () => {
    state.mode = "selfhosted";
    state.cloudOnline = true;
    expect(isEndpointCheckBackendOnline()).toBe(false);
    state.serverOnline = true;
    expect(isEndpointCheckBackendOnline()).toBe(true);
  });

  test("never run with no server chosen", () => {
    state.mode = "local";
    state.cloudOnline = true;
    state.serverOnline = true;
    expect(isEndpointCheckBackendOnline()).toBe(false);
  });

  test("keep the cloud monitor observed until unsubscribed", () => {
    const unsubscribe = subscribeToEndpointCheckReadiness(() => {});
    expect(state.cloudListeners.size).toBe(1);
    unsubscribe();
    expect(state.cloudListeners.size).toBe(0);
  });
});
