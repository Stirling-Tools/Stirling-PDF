/**
 * Sources fixtures and the wire types api/sources.ts shares with them.
 *
 * A "source" here is a reusable, persisted INPUT CONNECTION: the instantiation
 * of a source definition (a folder watching a directory; later an S3 bucket or a
 * Google Drive folder). Policies reference sources by id, so one connection is
 * configured once and can feed many policies. The Sources overview lists each
 * connection exactly once, with how many policies reference it.
 *
 * The MSW handlers (mocks/handlers/sources.ts) keep an in-memory store seeded
 * from here and serve the REAL backend shape (`/api/v1/sources`, SourceController
 * + SourceOverviewService), so create/delete behave like the live backend within
 * a session. Drop MSW and the same calls hit Stirling unchanged.
 */

/** Overview row status: referenced and enabled, enabled-but-orphaned, or disabled. */
export type SourceStatus = "active" | "unused" | "disabled";

/** A policy that references a source. */
export interface SourcePolicyRef {
  id: string;
  name: string;
}

/** One key/value line summarising a source's config for display. */
export interface SourceDetailRow {
  label: string;
  value: string;
}

/** One row in the Sources overview table. Mirrors the backend `SourceView`. */
export interface SourceView {
  id: string;
  name: string;
  type: string;
  status: SourceStatus;
  referenceCount: number;
  referencingPolicies: SourcePolicyRef[];
  config: SourceDetailRow[];
  /** Per-source document volume, not tracked yet (always null for now). */
  docsTotal: number | null;
}

export interface SourceKpi {
  value: number;
  description: string;
}

export interface SourcesResponse {
  kpis: SourceKpi[];
  sources: SourceView[];
}

/**
 * The wire record for a single source: the create/update body (`id` omitted on
 * create) and what the backend returns from POST/GET. Mirrors the backend
 * `Source` record; `owner`/`teamId` are stamped server-side.
 */
export interface Source {
  id?: string;
  name: string;
  type: string;
  options: Record<string, unknown>;
  enabled: boolean;
  owner?: string | null;
  teamId?: number | null;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixtures + overview builders (consumed by the MSW handlers)              */
/* ──────────────────────────────────────────────────────────────────────── */

/** A stored source, as the backend would persist it (id always assigned). */
export interface StoredSource extends Source {
  id: string;
}

/** Seed connections: two in use, one orphaned, one disabled, to exercise every state. */
export function seedSources(): StoredSource[] {
  return [
    {
      id: "src-claims",
      name: "Claims intake",
      type: "folder",
      options: { directory: "/data/claims-intake", mode: "consume" },
      enabled: true,
      owner: "you@acme.com",
    },
    {
      id: "src-contracts",
      name: "Contracts drop",
      type: "folder",
      options: { directory: "/data/contracts", mode: "snapshot" },
      enabled: true,
      owner: "legal-ops@acme.com",
    },
    {
      id: "src-archive",
      name: "Archive reprocess",
      type: "folder",
      options: { directory: "/data/archive", mode: "consume" },
      enabled: true,
      owner: "data-eng@acme.com",
    },
    {
      id: "src-legacy",
      name: "Legacy share (paused)",
      type: "folder",
      options: { directory: "/mnt/legacy" },
      enabled: false,
      owner: "data-eng@acme.com",
    },
  ];
}

/** Which seeded policies reference each seeded source (drives reference counts). */
export function seedReferences(): Record<string, SourcePolicyRef[]> {
  return {
    "src-claims": [
      { id: "pol_security", name: "Security Policy" },
      { id: "pol_redaction", name: "Redaction Policy" },
    ],
    "src-contracts": [{ id: "pol_contract", name: "Contract Review" }],
    // src-archive and src-legacy are referenced by nothing (orphans).
  };
}

/** Generic key/value view of a source's config; works for any source type. */
function configRows(options: Record<string, unknown>): SourceDetailRow[] {
  return Object.entries(options).map(([key, value]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: String(value),
  }));
}

function deriveStatus(
  source: StoredSource,
  referenceCount: number,
): SourceStatus {
  if (!source.enabled) return "disabled";
  return referenceCount === 0 ? "unused" : "active";
}

/** Combine a stored source with its referencing policies into an overview row. */
export function toSourceView(
  source: StoredSource,
  referencingPolicies: SourcePolicyRef[],
): SourceView {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    status: deriveStatus(source, referencingPolicies.length),
    referenceCount: referencingPolicies.length,
    referencingPolicies,
    config: configRows(source.options),
    docsTotal: null,
  };
}

/** KPI strip: total connections, in-use, orphaned. Mirrors SourceOverviewService. */
export function buildKpis(sources: SourceView[]): SourceKpi[] {
  const total = sources.length;
  const inUse = sources.filter((s) => s.referenceCount > 0).length;
  return [
    { value: total, description: "connections" },
    { value: inUse, description: "referenced by a policy" },
    { value: total - inUse, description: "unused" },
  ];
}
