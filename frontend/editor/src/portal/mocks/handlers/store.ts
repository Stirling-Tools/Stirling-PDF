import { http, HttpResponse, delay } from "msw";
import type {
  StoreFinding,
  StoreListPage,
  StoreListingDetail,
  StoreListingSummary,
  StoreManifest,
  StoreManifestStep,
  StorePreflightReport,
  StorePublishRequest,
  StoreTeamListing,
} from "@portal/api/store";

/**
 * Mock Pipeline store (SaaS host, so paths hang off the http://saas.mock origin Storybook
 * configures). Nine realistic listings drawn from the real policy operation endpoints, a
 * per-viewer star set, the team's own listings, and a preflight that reports findings by the
 * pipeline's shape so the publish flow can show every branch (blocked, warnings, clean).
 */

const SAAS = "http://saas.mock";
const BASE = `${SAAS}/api/v1/store`;

const TEAM_LISTED = new Set(["sp-8k2m4q7x", "sp-3f9d2h1p"]);
const TEAM_REMOVED = new Set(["sp-7n1c5v3b"]);

interface StoredListing extends StoreListingDetail {
  manifest: StoreManifest;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function listing(
  input: Omit<
    StoreListingDetail,
    "slug" | "starred" | "viewer" | "tools" | "minimumStirlingVersion"
  > & {
    minimumStirlingVersion?: string | null;
  },
): StoredListing {
  const tools = input.steps.map((s) => s.operation);
  return {
    ...input,
    slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    tools,
    minimumStirlingVersion: input.minimumStirlingVersion ?? null,
    starred: false,
    viewer: null,
    manifest: {
      manifestSchemaVersion: 1,
      name: input.name,
      description: input.description,
      category: input.category,
      icon: input.icon,
      steps: input.steps,
      requiredOnInstall: input.requiredOnInstall,
      suggestedTrigger: null,
      minimumStirlingVersion: input.minimumStirlingVersion ?? null,
    },
  };
}

function seed(): StoredListing[] {
  return [
    listing({
      storeId: "sp-8k2m4q7x",
      name: "Invoice intake cleanup",
      description:
        "Repairs damaged uploads, runs OCR so every invoice is searchable, then compresses the result before it lands in your archive. Built for high-volume mailbox drops.",
      category: "ingestion",
      icon: "layers",
      starCount: 1284,
      installCount: 3912,
      updatedAt: daysAgo(3),
      firstPublishedAt: daysAgo(120),
      latestChange:
        "Switched OCR to skip pages that already carry a text layer.",
      curated: true,
      needsConnections: false,
      steps: [
        { operation: "/api/v1/misc/repair", parameters: {} },
        {
          operation: "/api/v1/misc/ocr-pdf",
          parameters: { languages: ["eng"], ocrType: "skip-text" },
        },
        {
          operation: "/api/v1/misc/compress-pdf",
          parameters: { optimizeLevel: 5, grayscale: false },
        },
      ],
      requiredOnInstall: [{ kind: "source" }, { kind: "destination" }],
    }),
    listing({
      storeId: "sp-3f9d2h1p",
      name: "Scan to searchable PDF",
      description:
        "Turns scanner output into searchable, flattened PDFs. OCR in English and German, then flatten so annotations cannot be edited downstream.",
      category: "ingestion",
      icon: "scan",
      starCount: 842,
      installCount: 2210,
      updatedAt: daysAgo(9),
      firstPublishedAt: daysAgo(200),
      latestChange: null,
      curated: false,
      needsConnections: false,
      steps: [
        {
          operation: "/api/v1/misc/ocr-pdf",
          parameters: { languages: ["eng", "deu"], ocrType: "force-ocr" },
        },
        {
          operation: "/api/v1/misc/flatten",
          parameters: { flattenOnlyForms: false },
        },
      ],
      requiredOnInstall: [{ kind: "source" }, { kind: "destination" }],
    }),
    listing({
      storeId: "sp-9q4w7e2r",
      name: "Redaction sweep for claims",
      description:
        "Automatic redaction of policy numbers, national ids and card numbers across incoming claims, followed by a sanitize pass that strips metadata, scripts and embedded files.",
      category: "security",
      icon: "shield",
      starCount: 611,
      installCount: 1490,
      updatedAt: daysAgo(1),
      firstPublishedAt: daysAgo(80),
      latestChange: "Added IBAN and sort-code patterns to the automatic pass.",
      curated: true,
      needsConnections: false,
      steps: [
        {
          operation: "/api/v1/security/auto-redact",
          parameters: {
            mode: "automatic",
            convertPDFToImage: true,
            listOfText: "",
          },
        },
        {
          operation: "/api/v1/security/sanitize-pdf",
          parameters: {
            removeJavaScript: true,
            removeEmbeddedFiles: true,
            removeMetadata: true,
          },
        },
      ],
      requiredOnInstall: [
        { kind: "source" },
        { kind: "destination" },
        {
          kind: "parameter",
          stepIndex: 0,
          field: "listOfText",
          reason: "Your own terms to redact",
        },
      ],
    }),
    listing({
      storeId: "sp-5t8y1u3i",
      name: "Contract watermark and timestamp",
      description:
        "Stamps a confidentiality watermark on every page and adds an RFC 3161 timestamp so the signed copy stays verifiable for years.",
      category: "compliance",
      icon: "watermark",
      starCount: 402,
      installCount: 980,
      updatedAt: daysAgo(14),
      firstPublishedAt: daysAgo(150),
      latestChange: null,
      curated: false,
      needsConnections: true,
      minimumStirlingVersion: "2.4.0",
      steps: [
        {
          operation: "/api/v1/security/add-watermark",
          parameters: {
            watermarkType: "text",
            watermarkText: "CONFIDENTIAL",
            opacity: 0.3,
            rotation: 45,
          },
        },
        {
          operation: "/api/v1/security/timestamp-pdf",
          parameters: { tsaUrl: "" },
        },
      ],
      requiredOnInstall: [
        { kind: "source" },
        { kind: "destination" },
        {
          kind: "parameter",
          stepIndex: 1,
          field: "tsaUrl",
          reason: "Your timestamp authority",
        },
      ],
    }),
    listing({
      storeId: "sp-2a6s9d4f",
      name: "Classify and label mail",
      description:
        "AI classification of incoming mail into your document types, then a Purview sensitivity label applied from the result. Needs a Purview connection on install.",
      category: "classification",
      icon: "label",
      starCount: 355,
      installCount: 640,
      updatedAt: daysAgo(6),
      firstPublishedAt: daysAgo(60),
      latestChange:
        "Label mapping now falls back to General when no class matches.",
      curated: false,
      needsConnections: true,
      steps: [
        { operation: "/api/v1/ai/tools/classify-and-label", parameters: {} },
        {
          operation: "/api/v1/integration/purview-apply-label",
          parameters: {
            connectionId: "",
            labelId: "",
            labelName: "General",
            method: "STANDARD",
          },
        },
      ],
      requiredOnInstall: [
        { kind: "source" },
        { kind: "destination" },
        {
          kind: "parameter",
          stepIndex: 1,
          field: "connectionId",
          reason: "Your Purview connection",
        },
        { kind: "parameter", stepIndex: 1, field: "labelId" },
      ],
    }),
    listing({
      storeId: "sp-7n1c5v3b",
      name: "Archive compressor",
      description:
        "Aggressive compression for cold storage. Grayscale conversion and level 8 optimisation cut typical scans by two thirds.",
      category: "retention",
      icon: "folder",
      starCount: 298,
      installCount: 1210,
      updatedAt: daysAgo(30),
      firstPublishedAt: daysAgo(300),
      latestChange: null,
      curated: false,
      needsConnections: false,
      steps: [
        {
          operation: "/api/v1/misc/compress-pdf",
          parameters: { optimizeLevel: 8, grayscale: true },
        },
      ],
      requiredOnInstall: [{ kind: "source" }, { kind: "destination" }],
    }),
    listing({
      storeId: "sp-4g7h2j8k",
      name: "Form flattener",
      description:
        "Flattens filled forms so field values become part of the page and cannot be changed after submission. Pairs well with a signed-forms mailbox.",
      category: "compliance",
      icon: "check",
      starCount: 187,
      installCount: 530,
      updatedAt: daysAgo(21),
      firstPublishedAt: daysAgo(90),
      latestChange: null,
      curated: false,
      needsConnections: false,
      steps: [
        {
          operation: "/api/v1/misc/flatten",
          parameters: { flattenOnlyForms: true },
        },
      ],
      requiredOnInstall: [{ kind: "source" }, { kind: "destination" }],
    }),
    listing({
      storeId: "sp-1z3x6c9v",
      name: "Outbound sanitizer",
      description:
        "Strips JavaScript, embedded files, links and metadata from anything leaving the organisation. A last line of defence before documents go to customers.",
      category: "security",
      icon: "lock",
      starCount: 964,
      installCount: 2875,
      updatedAt: daysAgo(2),
      firstPublishedAt: daysAgo(400),
      latestChange: "Now also removes XMP metadata.",
      curated: true,
      needsConnections: false,
      steps: [
        {
          operation: "/api/v1/security/sanitize-pdf",
          parameters: {
            removeJavaScript: true,
            removeEmbeddedFiles: true,
            removeMetadata: true,
            removeLinks: true,
          },
        },
      ],
      requiredOnInstall: [{ kind: "source" }, { kind: "destination" }],
    }),
    listing({
      storeId: "sp-6b8n2m5q",
      name: "Route scans to the DMS",
      description:
        "OCR, then hand each document to your document management system over its REST API and keep the original untouched. Configure the connection and path on install.",
      category: "routing",
      icon: "route",
      starCount: 143,
      installCount: 310,
      updatedAt: daysAgo(45),
      firstPublishedAt: daysAgo(46),
      latestChange: null,
      curated: false,
      needsConnections: true,
      steps: [
        {
          operation: "/api/v1/misc/ocr-pdf",
          parameters: { languages: ["eng"] },
        },
        {
          operation: "/api/v1/integration/external-api-call",
          parameters: {
            connectionId: "",
            path: "/documents",
            method: "POST",
            bodyMode: "multipart",
            fileFieldName: "file",
            responseMode: "report",
          },
        },
      ],
      requiredOnInstall: [
        { kind: "source" },
        {
          kind: "parameter",
          stepIndex: 1,
          field: "connectionId",
          reason: "Your DMS connection",
        },
      ],
    }),
  ];
}

let store: StoredListing[] = seed();
const starred = new Set<string>(["sp-3f9d2h1p", "sp-1z3x6c9v"]);

function toSummary(item: StoredListing): StoreListingSummary {
  return {
    storeId: item.storeId,
    slug: item.slug,
    name: item.name,
    description: item.description,
    category: item.category,
    icon: item.icon,
    tools: item.tools,
    starCount: item.starCount,
    installCount: item.installCount,
    updatedAt: item.updatedAt,
    curated: item.curated,
    needsConnections: item.needsConnections,
    starred: starred.has(item.storeId),
  };
}

function toDetail(item: StoredListing): StoreListingDetail {
  const teammate = TEAM_LISTED.has(item.storeId);
  return {
    ...toSummary(item),
    firstPublishedAt: item.firstPublishedAt,
    latestChange: item.latestChange,
    steps: item.steps,
    requiredOnInstall: item.requiredOnInstall,
    minimumStirlingVersion: item.minimumStirlingVersion,
    viewer: {
      starred: starred.has(item.storeId),
      isTeammate: teammate,
      ...(teammate ? { author: { displayName: "Priya Natarajan" } } : {}),
    },
  };
}

function visible(): StoredListing[] {
  return store.filter((item) => !TEAM_REMOVED.has(item.storeId));
}

function sortItems(items: StoredListing[], sort: string | null) {
  const sorted = [...items];
  if (sort === "newest")
    sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  else if (sort === "installs")
    sorted.sort((a, b) => b.installCount - a.installCount);
  else sorted.sort((a, b) => b.starCount - a.starCount);
  return sorted;
}

/** Findings shaped by the pipeline the flow is publishing: a name with "secret" in it blocks. */
function preflightFor(body: StorePublishRequest): StorePreflightReport {
  const findings: StoreFinding[] = [
    {
      severity: "info",
      code: "source-stripped",
      title: "Source removed",
      detail: "Installers choose their own source.",
      where: { kind: "input" },
    },
    {
      severity: "info",
      code: "destination-stripped",
      title: "Destination removed",
      detail: "Installers choose their own destination.",
      where: { kind: "output" },
    },
    {
      severity: "info",
      code: "schedule-stripped",
      title: "Schedule removed",
      detail: "Installed copies start paused.",
      where: { kind: "details" },
    },
    {
      severity: "warn",
      code: "connection-required",
      title: "Step needs a connection on install",
      detail:
        "The connection id was cleared. Installers pick their own connection.",
      where: {
        kind: "step",
        stepIndex: 1,
        operation: "/api/v1/security/sanitize-pdf",
      },
    },
  ];
  const blocked = /secret|blocked/i.test(body.name);
  if (blocked) {
    findings.unshift(
      {
        severity: "block",
        code: "credential-in-parameters",
        title: "A parameter looks like a credential",
        detail:
          "Step 1 carries a value that matches an API key pattern. Remove it before publishing.",
        where: {
          kind: "step",
          stepIndex: 0,
          operation: "/api/v1/security/auto-redact",
        },
      },
      {
        severity: "block",
        code: "description-too-short",
        title: "Description is too short",
        detail: "Say what the pipeline does and who it is for.",
        where: { kind: "details" },
      },
    );
  }
  const existing = store.find((item) => item.name === body.name);
  return {
    findings,
    canPublish: !blocked,
    existingStoreId:
      existing && TEAM_LISTED.has(existing.storeId) ? existing.storeId : null,
    manifest: blocked
      ? null
      : {
          manifestSchemaVersion: 1,
          name: body.name,
          description: body.description,
          category: body.category,
          icon: "route",
          steps: [],
          requiredOnInstall: [{ kind: "source" }, { kind: "destination" }],
        },
  };
}

function publishFrom(
  body: StorePublishRequest,
  storeId: string,
  steps: StoreManifestStep[],
): StoredListing {
  const existing = store.find((item) => item.storeId === storeId);
  const next = listing({
    storeId,
    name: body.name,
    description: body.description,
    category: body.category,
    icon: existing?.icon ?? "route",
    starCount: existing?.starCount ?? 0,
    installCount: existing?.installCount ?? 0,
    updatedAt: new Date().toISOString(),
    firstPublishedAt: existing?.firstPublishedAt ?? new Date().toISOString(),
    latestChange: body.whatChanged ?? null,
    curated: false,
    needsConnections: false,
    steps: existing?.steps ?? steps,
    requiredOnInstall: existing?.requiredOnInstall ?? [
      { kind: "source" },
      { kind: "destination" },
    ],
  });
  store = existing
    ? store.map((item) => (item.storeId === storeId ? next : item))
    : [...store, next];
  TEAM_LISTED.add(storeId);
  TEAM_REMOVED.delete(storeId);
  return next;
}

let publishCounter = 0;

export const storeHandlers = [
  http.get(`${BASE}/public/pipelines`, async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const category = url.searchParams.get("category");
    const tools = url.searchParams.get("tools")?.split(",").filter(Boolean);
    const cursor = Number(url.searchParams.get("cursor") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "24");
    let items = visible();
    if (q) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.storeId.toLowerCase().includes(q) ||
          item.tools.some((tool) => tool.toLowerCase().includes(q)),
      );
    }
    if (category) items = items.filter((item) => item.category === category);
    if (tools?.length)
      items = items.filter((item) =>
        tools.every((tool) => item.tools.includes(tool)),
      );
    items = sortItems(items, url.searchParams.get("sort"));
    const page = items.slice(cursor, cursor + limit);
    const body: StoreListPage = {
      items: page.map(toSummary),
      nextCursor: cursor + limit < items.length ? String(cursor + limit) : null,
      total: items.length,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/public/pipelines/:storeId/manifest`, async ({ params }) => {
    const item = store.find((entry) => entry.storeId === params.storeId);
    if (!item) return new HttpResponse(null, { status: 404 });
    await delay(100);
    return HttpResponse.json(item.manifest);
  }),

  http.get(`${BASE}/public/pipelines/:storeId`, async ({ params }) => {
    const item = store.find((entry) => entry.storeId === params.storeId);
    if (!item) return new HttpResponse(null, { status: 404 });
    await delay(150);
    return HttpResponse.json(toDetail(item));
  }),

  http.post(`${BASE}/publish/preflight`, async ({ request }) => {
    const body = (await request.json()) as StorePublishRequest;
    await delay(600);
    return HttpResponse.json(preflightFor(body));
  }),

  http.post(`${BASE}/publish`, async ({ request }) => {
    const body = (await request.json()) as StorePublishRequest;
    await delay(400);
    const report = preflightFor(body);
    const storeId =
      report.existingStoreId ?? `sp-new${(++publishCounter).toString(36)}`;
    return HttpResponse.json(toDetail(publishFrom(body, storeId, [])));
  }),

  http.post(
    `${BASE}/pipelines/:storeId/republish`,
    async ({ params, request }) => {
      const body = (await request.json()) as StorePublishRequest;
      await delay(400);
      return HttpResponse.json(
        toDetail(publishFrom(body, String(params.storeId), [])),
      );
    },
  ),

  http.delete(`${BASE}/pipelines/:storeId`, async ({ params }) => {
    await delay(200);
    TEAM_REMOVED.add(String(params.storeId));
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${BASE}/pipelines/:storeId/star`, async ({ params }) => {
    const item = store.find((entry) => entry.storeId === params.storeId);
    if (!item) return new HttpResponse(null, { status: 404 });
    await delay(150);
    if (!starred.has(item.storeId)) {
      starred.add(item.storeId);
      item.starCount += 1;
    }
    return HttpResponse.json({ starCount: item.starCount, starred: true });
  }),

  http.delete(`${BASE}/pipelines/:storeId/star`, async ({ params }) => {
    const item = store.find((entry) => entry.storeId === params.storeId);
    if (!item) return new HttpResponse(null, { status: 404 });
    await delay(150);
    if (starred.has(item.storeId)) {
      starred.delete(item.storeId);
      item.starCount = Math.max(0, item.starCount - 1);
    }
    return HttpResponse.json({ starCount: item.starCount, starred: false });
  }),

  http.post(`${BASE}/pipelines/:storeId/install`, async ({ params }) => {
    const item = store.find((entry) => entry.storeId === params.storeId);
    if (!item) return new HttpResponse(null, { status: 404 });
    item.installCount += 1;
    return HttpResponse.json({ installCount: item.installCount });
  }),

  http.get(`${BASE}/team/pipelines`, async () => {
    await delay(150);
    const rows: StoreTeamListing[] = store
      .filter(
        (item) =>
          TEAM_LISTED.has(item.storeId) || TEAM_REMOVED.has(item.storeId),
      )
      .map((item) => ({
        storeId: item.storeId,
        name: item.name,
        starCount: item.starCount,
        installCount: item.installCount,
        status: TEAM_REMOVED.has(item.storeId) ? "REMOVED" : "LISTED",
        removedBy: TEAM_REMOVED.has(item.storeId)
          ? item.storeId === "sp-7n1c5v3b"
            ? "STAFF"
            : "TEAM"
          : null,
        updatedAt: item.updatedAt,
        publishedBy: item.storeId === "sp-8k2m4q7x" ? "Priya Natarajan" : "You",
      }));
    return HttpResponse.json(rows);
  }),

  http.get(`${BASE}/starred`, async () => {
    await delay(150);
    return HttpResponse.json(
      visible()
        .filter((item) => starred.has(item.storeId))
        .map(toSummary),
    );
  }),
];

/** Test/story hook: put the store back to its seeded state. */
export function resetStoreMock() {
  store = seed();
  starred.clear();
  starred.add("sp-3f9d2h1p");
  starred.add("sp-1z3x6c9v");
  TEAM_LISTED.clear();
  TEAM_LISTED.add("sp-8k2m4q7x");
  TEAM_LISTED.add("sp-3f9d2h1p");
  TEAM_REMOVED.clear();
  TEAM_REMOVED.add("sp-7n1c5v3b");
}
