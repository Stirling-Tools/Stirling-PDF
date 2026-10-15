/**
 * Runs one measured interaction and (optionally) Lighthouse, then writes the
 * manifest fragment `report.py` consumes.
 *
 * This is the entry point `SKILL.md` steps 6–8 call. It never fabricates a
 * number: an area the browser cannot measure is written to `metrics.unavailable`.
 * The API the measured pages need comes from a live backend when one answers and
 * from the repo's own stubs served over HTTP otherwise, so the audit renders the
 * feature rather than an error screen; Lighthouse is only skipped, with a
 * recorded reason, when no runner is installed or no backend can be stood in for
 * (`--lighthouse-force` audits the error state anyway). Findings derived from the
 * measurements are appended to the manifest, so the report's Findings tab carries
 * the verdicts without anyone having to write them up afterwards.
 *
 * Usage (from `frontend/`, so `playwright` and `@app/*` resolve):
 *   npx tsx editor/tests/walkthrough/perf/cli.ts \
 *     --out captures/perf --scenario editor-settings-cycle --cycles 5
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { assembleInteraction } from "./assemble";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  collectWebInteraction,
  launchCollectorBrowser,
  SAMPLE_INTERVAL_MS,
} from "./collect-web";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { probeBackend, stubbedState, type BackendState } from "./backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  DEFAULT_STUB_PORT,
  startStubBackend,
  type StubBackend,
} from "./stub-backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  backendSkipReason,
  DEFAULT_SETTLE_MS,
  resolveLighthouse,
  runLighthouse,
} from "./collect-lighthouse";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  deriveClaims,
  deriveFindings,
  type DerivedFindings,
  type FindingGroup,
  type PerfFinding,
} from "./findings";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS, resolveRoute } from "./scenarios";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type {
  LighthouseRun,
  PerfClaim,
  PerfFragment,
  PerfInteraction,
  Scenario,
} from "./types";

const HERE = import.meta.dirname;
const REPO_ROOT = resolve(HERE, "../../../../..");
const REPORT_PY = join(
  REPO_ROOT,
  ".claude/skills/ui-walkthrough/scripts/report.py",
);
const FRONTEND_DIR = join(REPO_ROOT, "frontend");

interface Cli {
  out: string;
  baseUrl: string;
  route: string;
  platform: string;
  scenario: string;
  cycles: number;
  idleBaselineMs: number;
  trace: boolean;
  cpuProfile: boolean;
  lighthouse: boolean;
  lighthouseForce: boolean;
  lighthouseBin: string;
  lighthouseSettleMs: number;
  noStubBackend: boolean;
  stubBackendPort: number;
  buildLabel: string;
  instrumentation: string;
  fixture: string;
  manifest: string | null;
  merged: string | null;
  validate: boolean;
  reportPy: string;
}

function die(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(2);
}

function parseCli(): Cli {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      "base-url": { type: "string" },
      route: { type: "string" },
      platform: { type: "string" },
      scenario: { type: "string" },
      cycles: { type: "string" },
      "idle-baseline": { type: "string" },
      trace: { type: "boolean", default: false },
      "cpu-profile": { type: "boolean", default: true },
      "no-cpu-profile": { type: "boolean", default: false },
      lighthouse: { type: "boolean", default: false },
      "lighthouse-force": { type: "boolean", default: false },
      "lighthouse-bin": { type: "string" },
      "lighthouse-settle-ms": { type: "string" },
      "no-stub-backend": { type: "boolean", default: false },
      "stub-backend-port": { type: "string" },
      "build-label": { type: "string" },
      instrumentation: { type: "string" },
      fixture: { type: "string" },
      manifest: { type: "string" },
      merged: { type: "string" },
      validate: { type: "boolean", default: false },
      "report-py": { type: "string" },
    },
    strict: false,
  });

  const cycles = Number(values.cycles ?? 5);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 20)
    die(
      `--cycles must be an integer between 1 and 20, got ${String(values.cycles)}`,
    );
  const idleBaselineMs = Number(values["idle-baseline"] ?? 4_000);
  if (!Number.isFinite(idleBaselineMs) || idleBaselineMs < 0)
    die(`--idle-baseline must be a non-negative number of ms`);
  const stubBackendPort = Number(
    values["stub-backend-port"] ?? DEFAULT_STUB_PORT,
  );
  if (
    !Number.isInteger(stubBackendPort) ||
    stubBackendPort < 1 ||
    stubBackendPort > 65_535
  )
    die(
      `--stub-backend-port must be a port number, got ${String(values["stub-backend-port"])}`,
    );
  if (values.validate && !values.manifest)
    die("--validate needs --manifest <manifest.json> to validate");
  const lighthouseSettleMs = Number(
    values["lighthouse-settle-ms"] ?? DEFAULT_SETTLE_MS,
  );
  if (!Number.isInteger(lighthouseSettleMs) || lighthouseSettleMs < 0)
    die(
      `--lighthouse-settle-ms must be a non-negative whole number of ms, got ${String(values["lighthouse-settle-ms"])}`,
    );

  return {
    out: resolve(String(values.out ?? "captures/perf")),
    baseUrl: String(values["base-url"] ?? "http://localhost:5173"),
    route: values.route ? String(values.route) : "",
    platform: String(values.platform ?? "desktop-web"),
    scenario: String(values.scenario ?? BUILTIN_SCENARIOS[0].id),
    cycles,
    idleBaselineMs,
    trace: Boolean(values.trace),
    cpuProfile: Boolean(values["cpu-profile"]) && !values["no-cpu-profile"],
    lighthouse: Boolean(values.lighthouse),
    lighthouseForce: Boolean(values["lighthouse-force"]),
    lighthouseBin: String(values["lighthouse-bin"] ?? ""),
    lighthouseSettleMs,
    noStubBackend: Boolean(values["no-stub-backend"]),
    stubBackendPort,
    buildLabel: String(values["build-label"] ?? "unspecified build"),
    instrumentation: String(
      values.instrumentation ??
        "CDP Performance domain counters + PerformanceObserver (longtask/event/resource) + React devtools hook",
    ),
    fixture: String(values.fixture ?? ""),
    manifest: values.manifest ? resolve(String(values.manifest)) : null,
    merged: values.merged ? resolve(String(values.merged)) : null,
    validate: Boolean(values.validate),
    reportPy: values["report-py"]
      ? resolve(String(values["report-py"]))
      : REPORT_PY,
  };
}

async function loadScenario(spec: string): Promise<Scenario> {
  const builtin = BUILTIN_SCENARIOS.find((candidate) => candidate.id === spec);
  if (builtin) return builtin;
  const path = isAbsolute(spec) ? spec : resolve(process.cwd(), spec);
  if (!existsSync(path))
    die(`unknown scenario '${spec}': not a builtin id and no such file`);
  const module = (await import(pathToFileURL(path).href)) as {
    scenario?: Scenario;
    default?: Scenario;
  };
  const scenario = module.scenario ?? module.default;
  if (!scenario || typeof scenario.use !== "function")
    die(`'${spec}' must export 'scenario' (or default) implementing Scenario`);
  return scenario;
}

/**
 * Appends derived findings to the manifest's own, per viewer group. An author
 * finding with the same title wins: the point of the merge is to add the
 * verdicts nobody wrote, not to restate the ones somebody did.
 */
function mergeFindings(
  manifest: Record<string, unknown>,
  derived: DerivedFindings,
): void {
  const findings = (manifest.findings ?? {}) as Record<string, unknown>;
  for (const group of Object.keys(derived) as FindingGroup[]) {
    const items: PerfFinding[] = derived[group];
    if (items.length === 0) continue;
    const existing = Array.isArray(findings[group])
      ? (findings[group] as { title?: unknown }[])
      : [];
    const titles = new Set(
      existing.map((finding) => String(finding?.title ?? "")),
    );
    findings[group] = [
      ...existing,
      ...items.filter((finding) => !titles.has(finding.title)),
    ];
  }
  manifest.findings = findings;
}

function mergeClaims(
  manifest: Record<string, unknown>,
  claims: PerfClaim[],
): void {
  const existing = Array.isArray(manifest.claims)
    ? (manifest.claims as { claim?: unknown }[])
    : [];
  const texts = new Set(existing.map((claim) => String(claim?.claim ?? "")));
  manifest.claims = [
    ...existing,
    ...claims.filter((claim) => !texts.has(claim.claim)),
  ];
}

function mergeNotes(manifest: Record<string, unknown>, notes: string[]): void {
  const existing = Array.isArray(manifest.notes)
    ? (manifest.notes as unknown[]).map(String)
    : [];
  const seen = new Set(existing);
  manifest.notes = [...existing, ...notes.filter((note) => !seen.has(note))];
}

function mergeIntoManifest(
  manifestPath: string,
  interaction: PerfInteraction,
  runs: LighthouseRun[],
  derived: DerivedFindings,
  claims: PerfClaim[],
  notes: string[],
): Record<string, unknown> {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  const performance = (manifest.performance ?? {}) as {
    interactions?: PerfInteraction[];
  };
  const lighthouse = (manifest.lighthouse ?? {}) as { runs?: LighthouseRun[] };
  performance.interactions = [...(performance.interactions ?? []), interaction];
  lighthouse.runs = [...(lighthouse.runs ?? []), ...runs];
  manifest.performance = performance;
  if (runs.length > 0) manifest.lighthouse = lighthouse;
  mergeFindings(manifest, derived);
  mergeClaims(manifest, claims);
  mergeNotes(manifest, notes);
  return manifest;
}

/**
 * The state the measured pages will see. A live backend wins; with none
 * answering, the repo's own API stubs are served on the port the dev server
 * already proxies to, so the interaction and the audit both render the feature
 * instead of an error. The second probe is the proof: it goes through the dev
 * server, so a proxy pointed at another port fails honestly instead of
 * producing numbers from a screen nobody looked at.
 */
async function ensureBackend(
  cli: Cli,
): Promise<{ backend: BackendState; stub: StubBackend | null }> {
  const live = await probeBackend(cli.baseUrl);
  if (live.ok || cli.noStubBackend) return { backend: live, stub: null };
  let stub: StubBackend;
  try {
    stub = await startStubBackend({ port: cli.stubBackendPort });
  } catch (error) {
    return {
      backend: {
        ...live,
        detail: `${live.detail}; the stub backend on port ${cli.stubBackendPort} could not start (${(error as Error).message})`,
      },
      stub: null,
    };
  }
  const throughProxy = await probeBackend(cli.baseUrl);
  if (throughProxy.ok) {
    return {
      backend: stubbedState(
        throughProxy.endpoint,
        `answered by the repo's API stubs on port ${stub.port} through ${cli.baseUrl}`,
      ),
      stub,
    };
  }
  await stub.close();
  return {
    backend: {
      ...live,
      detail:
        `${live.detail}; the stub backend on port ${stub.port} was not reachable ` +
        `through ${cli.baseUrl} (the dev server proxies /api to BACKEND_URL, ` +
        `which defaults to http://localhost:${DEFAULT_STUB_PORT})`,
    },
    stub: null,
  };
}

async function main(): Promise<void> {
  const cli = parseCli();
  const scenario = await loadScenario(cli.scenario);
  if (cli.platform) scenario.platform = cli.platform;
  scenario.route = resolveRoute(cli.route, scenario.route);
  if (!cli.fixture) cli.fixture = scenario.fixture;

  mkdirSync(cli.out, { recursive: true });
  const pictureDir = join(cli.out, "pictures");
  const artifactDir = join(cli.out, "artifacts");

  // Probed once, before anything is measured: the answer decides whether the
  // numbers describe the feature or the app's error state, and it is recorded
  // as evidence rather than remembered.
  const { backend, stub } = await ensureBackend(cli);
  process.stderr.write(
    `[perf] backend ${backend.source}: ${backend.endpoint} ${backend.detail}\n`,
  );

  const collectOptions = {
    scenario,
    baseUrl: cli.baseUrl,
    cycles: cli.cycles,
    idleBaselineMs: cli.idleBaselineMs,
    trace: cli.trace,
    cpuProfile: cli.cpuProfile,
    artifactDir,
    onProgress: (message: string): void => {
      process.stderr.write(`[perf] ${message}\n`);
    },
  };

  process.stderr.write(
    `[perf] ${scenario.id} on ${scenario.platform} against ${cli.baseUrl}${scenario.route}\n`,
  );
  const browser = await launchCollectorBrowser();
  let interaction: PerfInteraction;
  try {
    const result = await collectWebInteraction(browser, collectOptions);
    interaction = await assembleInteraction(browser, collectOptions, result, {
      fixture: cli.fixture,
      build: cli.buildLabel,
      instrumentation: cli.instrumentation,
      cycles: cli.cycles,
      idleBaselineMs: cli.idleBaselineMs,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      browserVersion: browser.version(),
      pictureDir,
    });
    for (const note of result.unavailable)
      process.stderr.write(`[perf] unavailable: ${note}\n`);
  } finally {
    await browser.close();
  }

  const runs: LighthouseRun[] = [];
  const notes: string[] = [];
  if (cli.lighthouse) {
    const bin = cli.lighthouseBin || resolveLighthouse(FRONTEND_DIR);
    if (!bin) {
      notes.push(
        "Lighthouse (no runner installed: set LIGHTHOUSE_BIN or add a lighthouse dependency)",
      );
      process.stderr.write(`[perf] ${notes[notes.length - 1]}\n`);
    } else if (!backend.ok && !cli.lighthouseForce) {
      // Reaching here means neither a live backend nor the stub backend answered
      // the dev server, so an audit would score the error screen. The run is
      // skipped and says so, so the gap is a recorded finding, not a mystery.
      notes.push(backendSkipReason(backend));
      process.stderr.write(`[perf] ${notes[notes.length - 1]}\n`);
    } else {
      const url = new URL(scenario.route, cli.baseUrl).toString();
      const result = await runLighthouse({
        url,
        route: scenario.route,
        platform: scenario.platform,
        mode: `${cli.buildLabel}; ${cli.fixture}`,
        outDir: cli.out,
        binary: bin,
        chromePath: process.env.CHROME_PATH,
        backend,
        settleMs: cli.lighthouseSettleMs,
      });
      runs.push(...result.runs);
      notes.push(...result.unavailable, ...result.notes);
      for (const note of result.unavailable)
        process.stderr.write(`[perf] lighthouse unavailable: ${note}\n`);
      for (const note of result.notes)
        process.stderr.write(`[perf] lighthouse caveat: ${note}\n`);
    }
  }

  // The verdict on what was just measured. Derived here rather than written by
  // hand so the Findings tab cannot be more optimistic than the numbers.
  const findings = deriveFindings({
    interaction,
    cycles: cli.cycles,
    lighthouse: runs,
    backend,
  });
  for (const group of Object.keys(findings) as FindingGroup[]) {
    for (const finding of findings[group])
      process.stderr.write(
        `[perf] finding (${group}, ${finding.severity}): ${finding.title}\n`,
      );
  }

  // What the numbers do and do not settle. A claim whose measurement was never
  // taken stays `not-measured` instead of reading as supported.
  const claims = deriveClaims({
    interaction,
    cycles: cli.cycles,
    lighthouse: runs,
    backend,
  });
  for (const claim of claims)
    process.stderr.write(`[perf] claim (${claim.status}): ${claim.claim}\n`);

  const fragment: PerfFragment & { notes: string[] } = {
    performance: { interactions: [interaction] },
    lighthouse: { runs },
    findings,
    claims,
    notes,
  };
  const fragmentPath = join(cli.out, "perf.fragment.json");
  writeFileSync(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`);

  let mergedPath: string | null = null;
  if (cli.manifest) {
    const merged = mergeIntoManifest(
      cli.manifest,
      interaction,
      runs,
      findings,
      claims,
      notes,
    );
    mergedPath = cli.merged ?? join(cli.out, "manifest.merged.json");
    mkdirSync(dirname(mergedPath), { recursive: true });
    writeFileSync(mergedPath, `${JSON.stringify(merged, null, 2)}\n`);
    if (cli.validate) {
      if (!existsSync(cli.reportPy))
        die(`report.py not found at ${cli.reportPy}; pass --report-py`);
      const check = spawnSync(
        "python3",
        [cli.reportPy, "validate", mergedPath],
        {
          encoding: "utf8",
        },
      );
      process.stderr.write(check.stdout ?? "");
      process.stderr.write(check.stderr ?? "");
      if (check.status !== 0)
        die(
          `report.py validate failed (exit ${String(check.status)}) for ${mergedPath}`,
        );
      process.stderr.write(`[perf] report.py validate passed: ${mergedPath}\n`);
    }
  }

  // Closed before the summary is printed: a listening server keeps the event
  // loop alive, so the process would hang instead of exiting.
  if (stub) await stub.close();

  process.stdout.write(
    `${JSON.stringify(
      {
        scenario: scenario.id,
        platform: scenario.platform,
        backend: `${backend.source}: ${backend.detail}`,
        window: interaction.window,
        metrics: interaction.metrics,
        pictures: Object.keys(interaction.pictures ?? {}),
        artifacts: interaction.artifacts ?? [],
        lighthouseRuns: runs.map((run) => ({
          formFactor: run.formFactor,
          scores: run.scores,
        })),
        findings: Object.fromEntries(
          (Object.keys(findings) as FindingGroup[]).map((group) => [
            group,
            findings[group].map(
              (finding) => `${finding.severity} ${finding.title}`,
            ),
          ]),
        ),
        claims: claims.map((claim) => `${claim.status} ${claim.claim}`),
        fragment: fragmentPath,
        merged: mergedPath,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
