import { FileId, StirlingFileStub } from "@app/types/fileContext";

// Seam for settling a stored record against wherever it came from. Core owns
// when a record is reconciled - on open, and when a source reports a change -
// and nothing about what "current" means. The no-ops here are the answer
// wherever IndexedDB is the only truth, which is every build but the desktop
// app.

/** The workbench access a reconciler needs to settle a record in place. */
export interface ReconcilePort {
  getStub(fileId: FileId): StirlingFileStub | undefined;
  listStubs(): StirlingFileStub[];
  /** Publish bytes for a record already in state. */
  putFile(fileId: FileId, file: File): void;
  updateStub(fileId: FileId, updates: Partial<StirlingFileStub>): void;
  dropFile(fileId: FileId): void;
}

/** What to do with a stored record before the workbench serves it. */
export interface OpenDecision {
  /** Bytes fresher than the ones storage holds. */
  file?: File;
  updates?: Partial<StirlingFileStub>;
  /** The record's source is gone and it held nothing the source did not. */
  drop?: boolean;
  /** Whether the cached page data now describes bytes that have moved on. */
  contentReplaced?: boolean;
  /** Runs once the bytes and the updates are both in state. Anything that asks
   *  the user belongs here: answering against a record still being published
   *  loses the answer to the publish that lands after it. */
  afterPublish?: () => void;
}

/** Of a stub update, the fields worth mirroring into storage because they
 *  describe the record's source rather than its content. Null where a record
 *  has no source and the stored copy is written whole. */
export function persistedSourceFields(
  _updates: Partial<StirlingFileStub>,
): Partial<StirlingFileStub> | null {
  return null;
}

/** Source-link fields a derived file inherits from the file it was made from,
 *  given that deriving it wrote nothing back to that source. */
export function inheritedSourceLink(
  _sourceStub: StirlingFileStub,
): Partial<StirlingFileStub> {
  return {};
}

/** Fields recording the source a newly added file was read from, keyed by the
 *  quickKey the open dialog registered it under. Empty where files have no
 *  source outside the app. */
export async function sourceLinkForNewFile(
  _quickKey: string,
): Promise<Partial<StirlingFileStub>> {
  return {};
}

/** Settle one stored record against its source before the workbench serves it. */
export async function reconcileBeforeOpen(
  _stub: StirlingFileStub,
  _port: ReconcilePort,
): Promise<OpenDecision> {
  return {};
}

/** Something changed at these source locations; settle every open record that
 *  came from one of them. */
export async function reconcileOpenFiles(
  _locations: string[],
  _port: ReconcilePort,
): Promise<void> {}

/** A record was just written back to the source it came from.
 *  @param applyUpdates stamps late-arriving fields, e.g. a re-read baseline. */
export function noteFileSaved(
  _fileId: FileId,
  _updates: Partial<StirlingFileStub>,
  _applyUpdates: (updates: Partial<StirlingFileStub>) => void,
): void {}

/** A record is leaving the workbench; abandon anything pending against it. */
export function forgetFile(_fileId: FileId): void {}
