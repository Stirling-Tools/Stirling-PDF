import { http, HttpResponse, delay } from "msw";
import type {
  Output,
  OutputKpi,
  OutputPolicyRef,
  OutputStatus,
  OutputView,
  OutputsResponse,
} from "@portal/api/outputs";

/**
 * Stateful mock for the Outputs surface so the portal works fully offline with
 * mocks on. Mirrors the real backend shape (`/api/v1/outputs`, OutputController +
 * OutputOverviewService): create/delete mutate an in-memory store, and delete of
 * a still-referenced output returns 409. With mocks OFF these calls fall through
 * to the real backend instead.
 */

interface StoredOutput extends Output {
  id: string;
}

function seedOutputs(): StoredOutput[] {
  return [
    {
      id: "out-archive",
      name: "Archive folder",
      type: "folder",
      options: { directory: "/data/archive-out" },
      enabled: true,
      owner: "data-eng@acme.com",
    },
    {
      id: "out-processed",
      name: "Processed bucket",
      type: "s3",
      options: { connectionId: "1", prefix: "processed/" },
      enabled: true,
      owner: "you@acme.com",
    },
  ];
}

/** Which seeded pipelines reference each seeded output (drives reference counts). */
const references: Record<string, OutputPolicyRef[]> = {
  "out-archive": [{ id: "plc-archive", name: "Archive compressor" }],
};

let store: StoredOutput[] = seedOutputs();

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `out_${Date.now().toString(36)}_${idCounter}`;
}

function refsFor(id: string): OutputPolicyRef[] {
  return references[id] ?? [];
}

function configRows(options: Record<string, unknown>) {
  return Object.entries(options).map(([key, value]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: String(value),
  }));
}

function deriveStatus(
  output: StoredOutput,
  referenceCount: number,
): OutputStatus {
  if (!output.enabled) return "disabled";
  return referenceCount === 0 ? "unused" : "active";
}

function toView(output: StoredOutput): OutputView {
  const refs = refsFor(output.id);
  return {
    id: output.id,
    name: output.name,
    type: output.type,
    status: deriveStatus(output, refs.length),
    referenceCount: refs.length,
    referencingPolicies: refs,
    config: configRows(output.options),
  };
}

function buildKpis(views: OutputView[]): OutputKpi[] {
  const total = views.length;
  const inUse = views.filter((v) => v.referenceCount > 0).length;
  return [
    { value: total, description: "destinations" },
    { value: inUse, description: "referenced by a policy" },
    { value: total - inUse, description: "unused" },
  ];
}

function buildOverview(): OutputsResponse {
  const outputs = store
    .map(toView)
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount || a.name.localeCompare(b.name),
    );
  return { kpis: buildKpis(outputs), outputs };
}

export const outputsHandlers = [
  http.get("/api/v1/outputs", async () => {
    await delay(120);
    return HttpResponse.json(buildOverview());
  }),

  http.get("/api/v1/outputs/:id", async ({ params }) => {
    await delay(120);
    const output = store.find((o) => o.id === params.id);
    if (!output) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(output);
  }),

  http.post("/api/v1/outputs", async ({ request }) => {
    await delay(120);
    const incoming = (await request.json()) as Output;
    const existing = incoming.id
      ? store.find((o) => o.id === incoming.id)
      : undefined;
    const id = existing?.id ?? nextId();
    const saved: StoredOutput = {
      ...incoming,
      id,
      owner: existing?.owner ?? "you@acme.com",
    };
    store = existing
      ? store.map((o) => (o.id === id ? saved : o))
      : [...store, saved];
    return HttpResponse.json(saved);
  }),

  http.delete("/api/v1/outputs/:id", async ({ params }) => {
    await delay(120);
    const id = String(params.id);
    const output = store.find((o) => o.id === id);
    if (!output) return new HttpResponse(null, { status: 404 });
    const refs = refsFor(id);
    if (refs.length > 0) {
      return HttpResponse.json(
        {
          detail: `Output is referenced by ${refs.length} policy(ies): ${refs
            .map((r) => r.name)
            .join(", ")}`,
        },
        { status: 409 },
      );
    }
    store = store.filter((o) => o.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
