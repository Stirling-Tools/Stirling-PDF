/**
 * Runs one measured interaction and (optionally) Lighthouse, then writes the
 * manifest fragment `report.py` consumes.
 *
 * This is the entry point `SKILL.md` steps 6–8 call. It never fabricates a
 * number: an area the browser cannot measure is written to `metrics.unavailable`
 * and Lighthouse is skipped with a recorded reason when no runner is installed
 * or the audited route has no backend to render against (`--lighthouse-force`
 * audits the error state anyway). Findings derived from the measurements are
 * appended to the manifest, so the report's Findings tab carries the verdicts
 * without anyone having to write them up afterwards.
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
import { probeBackend } from "./backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  backendSkipReason,
  resolveLighthouse,
  runLighthouse,
} from "./collect-lighthouse";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  deriveFindings,
  type DerivedFindings,
  type FindingGroup,
  type PerfFinding,
} from "./findings";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS } from "./scenarios";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type {
  LighthouseRun,
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
  if (values.validate && !values.manifest)
    die("--validate needs --manifest <manifest.json> to validate");

  return {
    out: resolve(String(values.out ?? "captures/perf")),
    baseUrl: String(values["base-url"] ?? "http://localhost:5173"),
    route: String(values.route ?? "/editor"),
    platform: String(values.platform ?? "desktop-web"),
    scenario: String(values.scenario ?? BUILTIN_SCENARIOS[0].id),
    cycles,
    idleBaselineMs,
    trace: Boolean(values.trace),
    cpuProfile: Boolean(values["cpu-profile"]) && !values["no-cpu-profile"],
    lighthouse: Boolean(values.lighthouse),
    lighthouseForce: Boolean(values["lighthouse-force"]),
    lighthouseBin: String(values["lighthouse-bin"] ?? ""),
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

function mergeIntoManifest(
  manifestPath: string,
  interaction: PerfInteraction,
  runs: LighthouseRun[],
  derived: DerivedFindings,
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
  return manifest;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const scenario = await loadScenario(cli.scenario);
  if (cli.platform) scenario.platform = cli.platform;
  if (cli.route) scenario.route = cli.route;
  if (!cli.fixture) cli.fixture = scenario.fixture;

  mkdirSync(cli.out, { recursive: true });
  const pictureDir = join(cli.out, "pictures");
  const artifactDir = join(cli.out, "artifacts");

  // Probed once, before anything is measured: the answer decides whether the
  // numbers describe the feature or the app's error state, and it is recorded
  // as evidence rather than remembered.
  const backend = await probeBackend(cli.baseUrl);
  process.stderr.write(
    `[perf] backend ${backend.endpoint} ${backend.detail}${
      backend.ok ? "" : " — the route renders its error state"
    }\n`,
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
      backend,
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
      // An audit of an error screen scores the error screen. The run is skipped
      // and said so, so the gap is a recorded finding instead of a mystery.
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

  const fragment: PerfFragment & { notes: string[] } = {
    performance: { interactions: [interaction] },
    lighthouse: { runs },
    findings,
    notes,
  };
  const fragmentPath = join(cli.out, "perf.fragment.json");
  writeFileSync(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`);

  let mergedPath: string | null = null;
  if (cli.manifest) {
    const merged = mergeIntoManifest(cli.manifest, interaction, runs, findings);
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

  process.stdout.write(
    `${JSON.stringify(
      {
        scenario: scenario.id,
        platform: scenario.platform,
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
        fragment: fragmentPath,
        merged: mergedPath,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
