/**
 * Runtime accessors over the generated docs manifest. This is the only module
 * that imports the (large) JSON, so lazy-loading the docs view keeps it in its
 * own chunk. Regenerate the JSON with `npm run docs:sync`.
 */
// Imported as a raw string (not a JSON module) so tsc doesn't infer a ~half-MB
// literal type; parsed once here into the typed manifest.
import manifestRaw from "@portal/generated/docsManifest.json?raw";
import type {
  DocEntry,
  DocsManifest,
  DocsNavSection,
} from "@portal/docs/manifest/transform";

const manifest = JSON.parse(manifestRaw) as DocsManifest;

/** Provenance of the current manifest (repo + ref it was generated from). */
export const docsSource = manifest.source;

/** The auto-sorted nav tree (sections → items). */
export function loadDocsNav(): DocsNavSection[] {
  return manifest.nav;
}

/** A single doc by id, or undefined if it isn't in the manifest. */
export function loadDoc(id: string): DocEntry | undefined {
  return manifest.docs[id];
}

/** Every doc, for building the search index. */
export function allDocs(): DocEntry[] {
  return Object.values(manifest.docs);
}

/** The first doc id (first item of the first section) — the default landing. */
export function firstDocId(): string | undefined {
  return manifest.nav[0]?.items[0]?.id;
}
