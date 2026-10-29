export type ActivityScope = "user" | "team" | "install";

export interface ActivityChain {
  operations: string[];
  fileCount: number;
  scope: ActivityScope;
}

export type ChainOrder = "mostRun" | "nearestFirst";

export interface RankChainsOptions {
  minFileCount?: number;
  limit?: number;
  order?: ChainOrder;
}

export interface FindRepeatedChainsOptions extends RankChainsOptions {
  isAutomatable: (toolId: string) => boolean;
  minLength?: number;
  maxLength?: number;
}

const DEFAULT_MIN_FILE_COUNT = 3;
const DEFAULT_MIN_LENGTH = 2;
const DEFAULT_MAX_LENGTH = 5;
const DEFAULT_LIMIT = 3;
const SUBSUMED_SHARE = 0.8;
const SCOPE_RANK: Record<ActivityScope, number> = {
  user: 0,
  team: 1,
  install: 2,
};

function automatableRuns(
  history: string[],
  isAutomatable: (toolId: string) => boolean,
): string[][] {
  const runs: string[][] = [];
  let current: string[] = [];
  for (const toolId of history) {
    if (!isAutomatable(toolId)) {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    if (current[current.length - 1] !== toolId) current.push(toolId);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function containsContiguous(haystack: string[], needle: string[]): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((op, i) => haystack[start + i] === op)) return true;
  }
  return false;
}

export function sameOperations(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((op, i) => op === b[i]);
}

export function rankChains(
  chains: ActivityChain[],
  {
    minFileCount = DEFAULT_MIN_FILE_COUNT,
    limit = DEFAULT_LIMIT,
    order = "mostRun",
  }: RankChainsOptions = {},
): ActivityChain[] {
  const frequent = chains.filter((chain) => chain.fileCount >= minFileCount);

  const maximal = frequent.filter(
    (chain) =>
      !frequent.some(
        (other) =>
          other.scope === chain.scope &&
          other.operations.length > chain.operations.length &&
          other.fileCount >= chain.fileCount * SUBSUMED_SHARE &&
          containsContiguous(other.operations, chain.operations),
      ),
  );

  return maximal
    .sort(
      (a, b) =>
        (order === "nearestFirst"
          ? SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]
          : 0) ||
        b.fileCount - a.fileCount ||
        b.operations.length - a.operations.length,
    )
    .slice(0, limit);
}

export function findRepeatedChains(
  histories: string[][],
  {
    isAutomatable,
    minLength = DEFAULT_MIN_LENGTH,
    maxLength = DEFAULT_MAX_LENGTH,
    ...rankOptions
  }: FindRepeatedChainsOptions,
): ActivityChain[] {
  const counts = new Map<string, ActivityChain>();

  for (const history of histories) {
    const seenInHistory = new Set<string>();
    for (const run of automatableRuns(history, isAutomatable)) {
      for (let start = 0; start < run.length; start++) {
        const longest = Math.min(maxLength, run.length - start);
        for (let length = minLength; length <= longest; length++) {
          const operations = run.slice(start, start + length);
          const key = operations.join("\u0000");
          if (seenInHistory.has(key)) continue;
          seenInHistory.add(key);
          const entry = counts.get(key) ?? {
            operations,
            fileCount: 0,
            scope: "user" as const,
          };
          entry.fileCount += 1;
          counts.set(key, entry);
        }
      }
    }
  }

  return rankChains([...counts.values()], rankOptions);
}
