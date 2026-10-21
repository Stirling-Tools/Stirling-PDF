/**
 * In-page instrumentation for the performance collector.
 *
 * Both halves of the probe — the init script and the drain — travel to the
 * browser as source strings, never as functions. `addInitScript(fn)` and
 * `page.evaluate(fn)` serialize a function with `Function.prototype.toString()`,
 * and tsx compiles this file with esbuild's `keepNames`, which injects
 * `__name(...)` calls that exist only in the bundler's scope. A serialized
 * function therefore dies in the page with `ReferenceError: __name is not
 * defined` — after it has usually written enough of its state to look
 * installed. Strings cannot fail that way.
 *
 * Keep this script dependency-free, ES5-shaped and free of bundler-sensitive
 * syntax: it is the one part of the harness that cannot be type-checked.
 */

// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { PageProbe } from "./types";

export const PROBE_KEY = "__wtPerf";

/**
 * Installed before the app boots: observers only ever see entries emitted
 * after they are armed, so late installation silently loses the load.
 */
export const PROBE_SCRIPT = `
(function () {
  var state = {
    longTasks: [],
    events: [],
    resources: [],
    commits: [],
    errors: [],
    observers: []
  };
  window["${PROBE_KEY}"] = state;

  function observe(type, push, options) {
    try {
      var supported = PerformanceObserver.supportedEntryTypes;
      if (Array.isArray(supported) && supported.indexOf(type) === -1) return;
      var observer = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i += 1) push(entries[i]);
      });
      var settings = { type: type, buffered: true };
      if (options) {
        for (var key in options) settings[key] = options[key];
      }
      observer.observe(settings);
      // An observer nothing references is collectable, and a collected
      // observer reports nothing at all: holding it is the measurement.
      state.observers.push(observer);
      return observer;
    } catch (error) {
      state.errors.push("observer " + type + ": " + String(error));
      return null;
    }
  }

  observe("longtask", function (entry) {
    state.longTasks.push({
      start: entry.startTime,
      duration: entry.duration,
      name: entry.name
    });
  });

  // Event timing hides everything under 104 ms by default, which is most of a
  // click. This window exists to measure clicks, so ask for the smallest
  // threshold the observer accepts.
  observe(
    "event",
    function (entry) {
      if (typeof entry.processingStart !== "number") return;
      state.events.push({
        name: entry.name,
        start: entry.startTime,
        duration: entry.duration,
        processingStart: entry.processingStart
      });
    },
    { durationThreshold: 16 }
  );

  observe("resource", function (entry) {
    state.resources.push({
      name: entry.name,
      initiatorType: entry.initiatorType || "",
      start: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0
    });
  });
})();
`;

/**
 * Counts React commits by wrapping the devtools hook's commit callback.
 *
 * Runs after the app has mounted, never as an init script: `@vitejs/plugin-react-swc`
 * installs its own hook through `Object.defineProperty` on the way up, and a
 * probe that arrives first gets replaced by nothing usable — the refresh
 * runtime then reads properties off a hook it did not create and the app never
 * boots. Wrapping afterwards costs the commits before the measurement window,
 * which are not the ones under test.
 */
export const PROBE_COMMITS_SCRIPT = `
(function () {
  var state = window[${JSON.stringify(PROBE_KEY)}];
  if (!state) return false;
  var hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || typeof hook.onCommitFiberRoot !== "function") return false;

  var installed = hook.onCommitFiberRoot;
  function countCommit(root) {
    var duration = null;
    var value = root && root.current ? root.current.actualDuration : null;
    if (typeof value === "number") duration = value;
    state.commits.push({ start: performance.now(), duration: duration });
  }

  // React tooling reassigns this property when it re-injects (a dev server's
  // refresh does it on every update), so hold it open: reads hand back a
  // wrapper that counts and then defers to whatever was installed last.
  try {
    Object.defineProperty(hook, "onCommitFiberRoot", {
      configurable: true,
      get: function () {
        return function () {
          countCommit(arguments[1]);
          if (installed) installed.apply(null, arguments);
        };
      },
      set: function (next) {
        installed = typeof next === "function" ? next : null;
      }
    });
  } catch (error) {
    state.errors.push("commit hook: " + String(error));
    return false;
  }
  return true;
})()
`;

/**
 * Drains the probe state from `startIndex` on. `observers` stays out of the
 * result: it holds live observer handles, which do not travel, and which the
 * manifest has no use for.
 */
export function probeDrainScript(startIndex: number): string {
  return `(function () {
  var state = window[${JSON.stringify(PROBE_KEY)}];
  if (!state) {
    return {
      longTasks: [],
      events: [],
      resources: [],
      commits: [],
      errors: ["probe not installed"],
      total: 0
    };
  }
  return {
    longTasks: state.longTasks.slice(${startIndex}),
    events: state.events.slice(${startIndex}),
    resources: state.resources.slice(${startIndex}),
    commits: state.commits.slice(${startIndex}),
    errors: state.errors,
    total: state.commits.length
  };
})()`;
}

/** Installation check, a string for the same reason the probe itself is one. */
export function probeInstalledScript(): string {
  return `Boolean(window[${JSON.stringify(PROBE_KEY)}])`;
}

export function emptyProbe(): PageProbe {
  return { longTasks: [], events: [], resources: [], commits: [], errors: [] };
}

/**
 * Resource timing hides sizes for cross-origin responses without
 * `Timing-Allow-Origin`; those come back as `0`, which is "unknown", not "no
 * bytes".
 */
export function splitResourceSizes(resources: PageProbe["resources"]): {
  knownBytes: number;
  unknownSizeCount: number;
} {
  let knownBytes = 0;
  let unknownSizeCount = 0;
  for (const resource of resources) {
    if (resource.transferSize > 0 || resource.encodedBodySize > 0) {
      knownBytes += resource.transferSize || resource.encodedBodySize;
    } else {
      unknownSizeCount += 1;
    }
  }
  return { knownBytes, unknownSizeCount };
}
