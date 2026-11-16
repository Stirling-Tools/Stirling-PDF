import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";

/**
 * A tool declares its mandatory parameters once, as the `validateFn` it hands `useBaseParameters` -
 * that is what greys out its Run button until the user has chosen. Anything composing the tool
 * without rendering it (a pipeline step, an AI-authored plan) has no hook to ask, so the same
 * predicate has to reach the tool's `operationConfig` as `validateParams`.
 *
 * Nothing in the type system ties the two together: a tool that gains a `validateFn` and forgets
 * `validateParams` still compiles, and a pipeline step for it would silently look configured while
 * the run failed at the backend. So this scans for the drift instead.
 */
const SRC = path.resolve(__dirname, "../../../..");
const TOOL_ROOTS = ["core/hooks/tools", "core/components/tools"];

interface ToolModules {
  tool: string;
  paramsSource: string;
  operationSource: string | null;
}

const isModule = (file: string, suffix: string) =>
  file.endsWith(suffix) && !file.endsWith(".test.ts");

/** Source lines, minus whole-line comments - a mention of a field is not a declaration of one. */
const code = (source: string) =>
  source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

/**
 * True if the tool constrains its parameters at all. `validateFn: () => true` is not a constraint -
 * it says "these defaults are always runnable", which is exactly what declaring nothing says.
 */
const hasMandatoryParams = (source: string) =>
  /\bvalidateFn:/.test(source) &&
  !/\bvalidateFn:\s*\(\)\s*=>\s*true\b/.test(source);

function toolModules(): ToolModules[] {
  const found: ToolModules[] = [];
  for (const root of TOOL_ROOTS) {
    const rootDir = path.join(SRC, root);
    for (const tool of fs.readdirSync(rootDir)) {
      const dir = path.join(rootDir, tool);
      if (!fs.statSync(dir).isDirectory()) continue;
      const files = fs.readdirSync(dir);
      const params = files.find((f) => isModule(f, "Parameters.ts"));
      if (!params) continue;
      const operation = files.find((f) => isModule(f, "Operation.ts"));
      found.push({
        tool,
        paramsSource: code(fs.readFileSync(path.join(dir, params), "utf8")),
        operationSource: operation
          ? code(fs.readFileSync(path.join(dir, operation), "utf8"))
          : null,
      });
    }
  }
  return found;
}

describe("validateParams coverage", () => {
  const modules = toolModules();

  test("the scan finds the tools at all", () => {
    // Guards against the sweep passing vacuously because it looked in the wrong place.
    expect(modules.length).toBeGreaterThan(20);
  });

  test("every tool with mandatory parameters exposes them to composers", () => {
    const missing = modules
      .filter(({ paramsSource }) => hasMandatoryParams(paramsSource))
      .filter(
        ({ operationSource }) =>
          // A tool with no operationConfig is not composable at all, so it has nothing to tell.
          operationSource !== null &&
          /OperationConfig\s*[:=]/.test(operationSource) &&
          !/\bvalidateParams:/.test(operationSource),
      )
      .map(({ tool }) => tool);

    expect(missing).toEqual([]);
  });
});
