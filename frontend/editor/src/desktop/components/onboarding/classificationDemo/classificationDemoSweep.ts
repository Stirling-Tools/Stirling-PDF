/** Classifies the newest Downloads PDFs in the browser and writes them to storage
 *  labelled. Reads only; opens nothing; never hands the classification demo's files to the AI. */

import {
  canListDirectory,
  listDirectory,
  readDiskFile,
  type DiskFileEntry,
} from "@app/services/localFolderContents";
import { classifyFileHeuristically } from "@app/services/heuristic/heuristicClassification";
import { meterAutomationRun } from "@app/services/automationMeter";
import type { StirlingFile } from "@app/types/fileContext";
import type {
  HeuristicConfidence,
  HeuristicResult,
} from "@app/services/heuristic/types";
import { LABEL_FAMILIES } from "@app/data/classificationLabels";
import { accentColor, accentCycleColor } from "@app/utils/accentColors";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";

/** Names this run in the billing audit trail, so onboarding's sweep is distinguishable
 *  from classification on upload. */
const ONBOARDING_METER_NAME = "Onboarding classification";

/** The step this work corresponds to, matching what the upload path meters, so both read
 *  the same in the trail even though this sweep never calls the AI. */
const CLASSIFY_STEP = "/api/v1/ai/tools/classify-and-label";

/** How many PDFs one sweep covers. The rest of the folder waits for a follow-up batch. */
export const CLASSIFICATION_DEMO_BATCH_SIZE = 50;

/** Wall-clock allowance per document. Ordinary PDFs classify in well under this; one
 *  that yields nothing inside it is retired as unreadable rather than holding the
 *  sweep, which is what a broken file or a dead pdf.js worker used to do. */
export const HEURISTIC_BUDGET_MS = 1000;

/** Roll-up id used for a document the heuristic could not place. */
export const UNCLASSIFIED_GROUP_ID = "other";

export type ClassificationDemoPhase =
  | "reading"
  | "gathering"
  | "processing"
  | "finished";

/** One document type inside a roll-up, e.g. "Invoice" within "Financial". */
export interface ClassificationDemoLabelCount {
  id: string;
  name: string;
  count: number;
}

/** One roll-up in the running tally, in the same grouping the Files sidebar uses. */
export interface ClassificationDemoGroupCount {
  id: string;
  name: string;
  count: number;
  /** Document types behind the roll-up, biggest first: the heuristic names a real
   *  label ("Invoice"), not just its family, so the chart can drill in for free. */
  labels: ClassificationDemoLabelCount[];
}

export interface ClassificationDemoProgress {
  phase: ClassificationDemoPhase;
  /** Documents classified so far (whether or not they earned a label). */
  processed: number;
  /** Documents this sweep will cover; 0 until the folder has been read. */
  total: number;
  /** While gathering: files in the folder looked at so far, of how many. */
  listing?: { checked: number; total: number };
  /** Running tally, biggest group first — drives the ticker under the logo. */
  groups: ClassificationDemoGroupCount[];
}

export interface ClassificationDemoOutcome {
  processed: number;
  groups: ClassificationDemoGroupCount[];
  /** PDFs in the folder in total, including the ones this sweep did not reach. */
  pdfsInFolder: number;
  /** PDFs left over after this sweep — what a follow-up batch would draw from. */
  remaining: number;
  /** Every document taken on, skipped ones included. Follow-ups exclude by path: by
   *  count, a skip drags the next batch back over covered ground. */
  sweptPaths: string[];
}

/** Folds a follow-up batch into the results on screen. Counts accumulate; folder
 *  figures come from the newer sweep, the only one that re-listed the directory. */
export function mergeOutcomes(
  previous: ClassificationDemoOutcome,
  next: ClassificationDemoOutcome,
): ClassificationDemoOutcome {
  const groups = new Map<string, ClassificationDemoGroupCount>();
  for (const group of [...previous.groups, ...next.groups]) {
    const existing = groups.get(group.id);
    if (!existing) {
      groups.set(group.id, {
        ...group,
        labels: group.labels.map((label) => ({ ...label })),
      });
      continue;
    }
    existing.count += group.count;
    for (const label of group.labels) {
      const seen = existing.labels.find((l) => l.id === label.id);
      if (seen) seen.count += label.count;
      else existing.labels.push({ ...label });
    }
  }
  return {
    processed: previous.processed + next.processed,
    groups: [...groups.values()]
      .map((group) => ({
        ...group,
        labels: [...group.labels].sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count),
    pdfsInFolder: next.pdfsInFolder,
    remaining: next.remaining,
    sweptPaths: [...previous.sweptPaths, ...next.sweptPaths],
  };
}

export interface ClassificationDemoDeps {
  /** Mount so the folder is readable here and visible in the file manager afterwards. */
  mountFolder: (directory: string, name: string) => Promise<unknown>;
  /** Writes a classified document to storage, unopened, so the sidebar can group it.
   *  Verdict arrives already computed — see {@link classifyAndAdd} for why. */
  addFiles: (
    files: File[],
    options?: {
      selectFiles?: boolean;
      skipWorkspaceDispatch?: boolean;
      skipUploadTracking?: boolean;
      presetClassification?: {
        labels: string[];
        confidence: HeuristicConfidence;
      };
      skipMetadataHydration?: boolean;
    },
  ) => Promise<StirlingFile[]>;
  onProgress: (progress: ClassificationDemoProgress) => void;
  /** Polled between files so a user who closes the modal is not left with a running sweep. */
  isCancelled?: () => boolean;
}

interface LabelPlacement {
  family: { id: string; name: string };
  label: { id: string; name: string };
}

/** Label id -> the sidebar family that rolls it up, so the tally matches the sidebar. */
const PLACEMENT_BY_LABEL = new Map<string, LabelPlacement>(
  LABEL_FAMILIES.flatMap((family) =>
    family.labels.map(
      (label) =>
        [
          label.id,
          {
            family: { id: family.id, name: family.name },
            label: { id: label.id, name: label.name },
          },
        ] as const,
    ),
  ),
);

/** Fixed hue per family, from the full vocabulary rather than whatever the sweep has
 *  found so far, so a chip does not change colour when a new category appears. */
export function groupColour(groupId: string): string {
  const index = LABEL_FAMILIES.findIndex((family) => family.id === groupId);
  return index < 0 ? accentColor("gray") : accentCycleColor(index);
}

/** Downloads directory, or null off-desktop. From the OS, not the backend, so the
 *  sweep works before the bundled server is up. */
export async function resolveDownloadsDirectory(): Promise<string | null> {
  if (!canListDirectory) return null;
  try {
    const { downloadDir } = await import("@tauri-apps/api/path");
    return await downloadDir();
  } catch {
    return null;
  }
}

/** Newest first — a folder of 500 downloads is mostly archaeology, so recency wins. */
export function pickRecentPdfs(
  files: DiskFileEntry[],
  limit: number,
): DiskFileEntry[] {
  return files
    .filter((file) => file.name.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => b.lastModified - a.lastModified)
    .slice(0, limit);
}

/** Tally rolled up to sidebar families, biggest first, with the strays under "Other". */
function tally(
  counts: Map<string, ClassificationDemoGroupCount>,
): ClassificationDemoGroupCount[] {
  return [...counts.values()]
    .map((group) => ({
      ...group,
      labels: [...group.labels].sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

function countVerdict(
  counts: Map<string, ClassificationDemoGroupCount>,
  labels: string[],
  unclassifiedName: string,
): void {
  // One document counts once, under its primary label's family: the tally is a
  // breakdown of the sweep, so the parts have to add up to the whole.
  const placement =
    labels.length > 0 ? PLACEMENT_BY_LABEL.get(labels[0]) : undefined;
  const family = placement?.family ?? {
    id: UNCLASSIFIED_GROUP_ID,
    name: unclassifiedName,
  };
  const group = counts.get(family.id) ?? { ...family, count: 0, labels: [] };
  group.count += 1;
  // Unlabelled documents have no type to break down, so "Other" stays a flat slice.
  if (placement) {
    const existing = group.labels.find((l) => l.id === placement.label.id);
    if (existing) existing.count += 1;
    else group.labels.push({ ...placement.label, count: 1 });
  }
  counts.set(family.id, group);
}

/** Classifies one document and stores it; null when it cannot be read at all. The verdict
 *  is written locked, so no policy reclassifies it or escalates it to the AI. */
async function classifyAndAdd(
  file: File,
  deps: ClassificationDemoDeps,
): Promise<string[] | null> {
  let verdict: HeuristicResult;
  try {
    verdict = await classifyFileHeuristically(file, {
      budgetMs: HEURISTIC_BUDGET_MS,
    });
  } catch {
    return null;
  }
  // Storage failing does not invalidate the verdict: the tally still counts the document,
  // it just will not appear in the library.
  await deps
    .addFiles([file], {
      // The sidebar reads IndexedDB, so this still groups in the library without
      // becoming an open file — nothing selected, user's workspace untouched.
      skipWorkspaceDispatch: true,
      selectFiles: false,
      skipUploadTracking: true,
      // The heuristic has already parsed this PDF once; a thumbnail parse would double
      // the work and keep every File in memory for the rest of the session. The library
      // draws thumbnails lazily from storage when the user gets there.
      skipMetadataHydration: true,
      presetClassification: {
        labels: verdict.labels,
        confidence: verdict.confidence,
      },
    })
    .catch(() => []);
  return verdict.labels;
}

/** One sweep over `directory`, skipping documents an earlier sweep took on. Reports
 *  progress as it goes and resolves with the final tally. */
export async function runClassificationDemoSweep(
  directory: string,
  deps: ClassificationDemoDeps,
  options: {
    limit?: number;
    /** Absolute paths an earlier sweep covered; see {@link ClassificationDemoOutcome.sweptPaths}. */
    exclude?: ReadonlySet<string>;
    unclassifiedName?: string;
  } = {},
): Promise<ClassificationDemoOutcome> {
  const limit = options.limit ?? CLASSIFICATION_DEMO_BATCH_SIZE;
  const exclude = options.exclude ?? new Set<string>();
  const unclassifiedName = options.unclassifiedName ?? "Other";
  const counts = new Map<string, ClassificationDemoGroupCount>();
  // One entry per document the sweep classified, which is what the meter charges on.
  // Pages are unknown here: the heuristic reads text without paginating, and the meter
  // treats 0 as "not known" rather than "no pages".
  const metered: { pages: number; bytes: number }[] = [];
  let processed = 0;

  const report = (
    phase: ClassificationDemoPhase,
    total: number,
    listing?: ClassificationDemoProgress["listing"],
  ) =>
    deps.onProgress({
      phase,
      processed,
      total,
      listing,
      groups: tally(counts),
    });

  report("reading", 0);
  // Reads and mounts are gated on the directory being mounted, so this comes first —
  // it also leaves Downloads in the file manager once the trick is over.
  await deps.mountFolder(directory, "Downloads");

  report("gathering", 0);
  const listing = await listDirectory(directory, {
    onProgress: (checked, count) =>
      report("gathering", 0, { checked, total: count }),
  });
  const allPdfs = pickRecentPdfs(listing?.files ?? [], Number.MAX_SAFE_INTEGER);
  const eligible = allPdfs.filter((file) => !exclude.has(file.path));
  const batch = eligible.slice(0, limit);
  const total = batch.length;

  report("processing", total);
  const sweptPaths: string[] = [];
  const read = (index: number): Promise<File | null> =>
    index < batch.length && batch[index].sizeBytes < LARGE_PDF_PARSE_LIMIT
      ? readDiskFile(batch[index]).catch(() => null)
      : Promise.resolve(null);
  // The disk read is a webview-to-Rust round trip and the classification is pdf.js in a
  // worker, so the next document's read overlaps this one's parse instead of waiting.
  let pending = read(0);
  for (let index = 0; index < batch.length; index += 1) {
    if (deps.isCancelled?.()) break;
    const entry = batch[index];
    // Recorded before the attempt, so a document that cannot be read is retired rather
    // than offered again by every follow-up batch for the rest of the flow.
    sweptPaths.push(entry.path);
    const file = await pending;
    pending = read(index + 1);
    // Past the parse limit the thumbnail path refuses too; the bytes would only be
    // copied across the IPC bridge to be dropped.
    if (file && entry.sizeBytes < LARGE_PDF_PARSE_LIMIT) {
      const labels = await classifyAndAdd(file, deps);
      if (labels) {
        processed += 1;
        countVerdict(counts, labels, unclassifiedName);
        metered.push({ pages: 0, bytes: entry.sizeBytes });
      }
    }
    report("processing", total);
    // A macrotask, not a microtask: gives the main thread a turn between documents so
    // the app stays responsive while this runs behind it.
    await new Promise((resolve) => setTimeout(resolve));
  }

  // One call for the batch rather than per document, matching how the upload path meters
  // a run: the sweep is one automation over many inputs.
  if (metered.length > 0) {
    meterAutomationRun({
      automationName: ONBOARDING_METER_NAME,
      operations: [CLASSIFY_STEP],
      inputs: metered,
    });
  }

  report("finished", total);
  return {
    processed,
    groups: tally(counts),
    pdfsInFolder: allPdfs.length,
    remaining: Math.max(0, eligible.length - sweptPaths.length),
    sweptPaths,
  };
}
