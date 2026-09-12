import { recordToolUsage } from "@app/api/toolRecommendations";
import type { ToolId } from "@app/types/toolId";
import type { FileId, ToolOperation } from "@app/types/file";

// Module store rather than a context: tool completions happen deep in operation
// hooks, and every consumer only needs "which tool finished last".
let lastCompletedTool: ToolId | null = null;
const listeners = new Set<() => void>();

/**
 * The tools applied to each live document, keyed by the file that currently
 * carries that lineage.
 *
 * A file's persisted `toolHistory` only follows its version chain, and the
 * operations most worth automating - convert, split, merge - deliberately start
 * a fresh chain, so history alone loses the document exactly where it gets
 * interesting. This map carries the lineage across that boundary by moving it
 * from a tool's inputs onto its outputs, and falls back to `toolHistory` for any
 * file it has not seen (a reload, or a version produced before this ran).
 */
const chainsByFileId = new Map<FileId, ToolId[]>();

// The workbench holds far fewer live files than this; the cap only stops a very
// long session from growing the map without bound.
const MAX_TRACKED_FILES = 500;

// The server keeps the trailing few steps; this just bounds the request body.
const MAX_CHAIN_LENGTH = 10;

export interface ToolCompletionInput {
  id: FileId;
  toolHistory?: ToolOperation[];
}

export interface ToolCompletion {
  toolId: ToolId;
  /** The documents the tool consumed. */
  inputs: ToolCompletionInput[];
  /** The documents it produced; they inherit the inputs' lineage. */
  outputFileIds: FileId[];
}

export function getLastCompletedTool(): ToolId | null {
  return lastCompletedTool;
}

/** The tools already applied to this document, newest step last. */
export function getDocumentToolChain(input: ToolCompletionInput): ToolId[] {
  const tracked = chainsByFileId.get(input.id);
  if (tracked) return tracked;
  return (input.toolHistory ?? []).map((operation) => operation.toolId);
}

export function subscribeToToolCompletions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Call once per successful tool run. The backend scores each input document's
 * chain, so a transition means "this is what came next for this file" and a
 * chain is a workflow that could be automated.
 */
export function notifyToolCompleted({
  toolId,
  inputs,
  outputFileIds,
}: ToolCompletion): void {
  lastCompletedTool = toolId;

  const priorChains = distinctChains(inputs.map(getDocumentToolChain));
  const carried = trim([...dominantChain(priorChains), toolId]);

  // The inputs were consumed to produce the outputs, which now hold the lineage.
  for (const input of inputs) chainsByFileId.delete(input.id);
  for (const fileId of outputFileIds) rememberChain(fileId, carried);

  void recordToolUsage(toolId, priorChains);
  listeners.forEach((listener) => listener());
}

function rememberChain(fileId: FileId, chain: ToolId[]): void {
  chainsByFileId.delete(fileId);
  chainsByFileId.set(fileId, chain);
  while (chainsByFileId.size > MAX_TRACKED_FILES) {
    const oldest = chainsByFileId.keys().next();
    if (oldest.done) break;
    chainsByFileId.delete(oldest.value);
  }
}

function trim(chain: ToolId[]): ToolId[] {
  return chain.length > MAX_CHAIN_LENGTH
    ? chain.slice(chain.length - MAX_CHAIN_LENGTH)
    : chain;
}

/** Ten identically-processed inputs are one workflow, not ten. */
function distinctChains(chains: ToolId[][]): ToolId[][] {
  const byKey = new Map<string, ToolId[]>();
  for (const chain of chains) {
    const trimmed = trim(chain);
    byKey.set(trimmed.join(">"), trimmed);
  }
  return [...byKey.values()];
}

/**
 * Which lineage an output inherits when a tool took several documents in. The
 * longest chain is the most-processed input and so the best representative of
 * the workflow; the key order breaks ties so repeated merges stay consistent.
 */
function dominantChain(chains: ToolId[][]): ToolId[] {
  let best: ToolId[] = [];
  for (const chain of chains) {
    if (
      chain.length > best.length ||
      (chain.length === best.length && chain.join(">") < best.join(">"))
    ) {
      best = chain;
    }
  }
  return best;
}

export function resetToolUsageTrackerForTests(): void {
  lastCompletedTool = null;
  chainsByFileId.clear();
  listeners.clear();
}
