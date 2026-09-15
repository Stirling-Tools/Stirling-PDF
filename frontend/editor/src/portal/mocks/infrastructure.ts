/**
 * Infrastructure surface fixtures and the types api/infrastructure.ts shares
 * with them. api/infrastructure.ts imports the types; the MSW handlers in
 * mocks/handlers/ serve the fixture data over the intercepted apiClient.local.json() calls.
 * Components never reach into this module directly.
 *
 * Everything here is tier-scaled deterministically: free sees the least of every list, enterprise the lot.
 *
 * Once a real backend exists the MSW handlers stop being registered and these
 * fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";
import type {
  ApiKey,
  ApiKeysResponse,
  AuditEvent,
  AuditLogResponse,
  AuditSummary,
} from "@portal/api/infrastructure";

/* ──────────────────────────────────────────────────────────────────────── */
/*  API Keys                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

const API_KEYS_ALL: ApiKey[] = [
  {
    id: "key-1",
    name: "Production · ingest",
    prefix: "sk_a3f81b2c",
    created: "2026-03-02",
    lastUsed: "2026-07-10 09:14",
    status: "active",
    usageToday: 84210,
    usageMonth: 2410933,
    usageTotal: 2410933,
  },
  {
    id: "key-2",
    name: "Nightly batch",
    prefix: "sk_77be0f42",
    created: "2026-01-18",
    lastUsed: "2026-07-10 08:33",
    status: "active",
    usageToday: 6120,
    usageMonth: 188400,
    usageTotal: 188400,
  },
  {
    id: "key-3",
    name: "CI pipeline",
    prefix: "sk_d9013ab7",
    created: "2025-08-09",
    lastUsed: "2026-07-04 17:02",
    status: "active",
    usageToday: 0,
    usageMonth: 14200,
    usageTotal: 14200,
  },
  {
    id: "key-4",
    name: "Sandbox · webhook tester",
    prefix: "sk_2c4a91de",
    created: "2026-05-30",
    lastUsed: "Never",
    status: "revoked",
    usageToday: 0,
    usageMonth: 0,
    usageTotal: 0,
  },
];

export function apiKeysFor(tier: Tier): ApiKeysResponse {
  const keys =
    tier === "free"
      ? API_KEYS_ALL.slice(0, 1)
      : tier === "pro"
        ? API_KEYS_ALL.slice(0, 3)
        : API_KEYS_ALL;
  return { keys };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Audit Logs                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

// Mirrors what the real backend (PortalInfraAuditService) returns: audit_events
// mapped from real AuditEventType values to the tab's categories. Only real
// types appear - there is no audited "elevation" event, so that category is
// absent (its summary metric reads 0), matching the backend.
const AUDIT_EVENTS_ALL: AuditEvent[] = [
  {
    id: "8841",
    timestamp: "2026-07-07 18:59:31",
    category: "processing",
    action: "Compress PDF",
    actor: "alice.chen@acme.com",
    target: "acme-invoice-8841.pdf",
    status: "success",
    latencyMs: 842,
  },
  {
    id: "8840",
    timestamp: "2026-07-07 18:40:50",
    category: "auth",
    action: "User signed in",
    actor: "carol.diaz@acme.com",
    target: "Web session",
    status: "success",
    latencyMs: 128,
  },
  {
    id: "8839",
    timestamp: "2026-07-07 18:22:07",
    category: "security",
    action: "Add password",
    actor: "bob.martin@acme.com",
    target: "MSA-Globex-2026.pdf",
    status: "success",
    latencyMs: 1203,
  },
  {
    id: "8838",
    timestamp: "2026-07-07 17:58:44",
    category: "config",
    action: "Admin settings changed",
    actor: "admin@stirlingpdf.com",
    target: "/api/v1/admin/settings/update",
    status: "info",
    latencyMs: 210,
  },
  {
    id: "8837",
    timestamp: "2026-07-07 17:31:12",
    category: "processing",
    action: "Merge PDFs",
    actor: "raj.patel@acme.com",
    target: "onboarding-packet.pdf",
    status: "success",
    latencyMs: 2199,
  },
  {
    id: "8836",
    timestamp: "2026-07-07 17:04:55",
    category: "auth",
    action: "Failed sign-in attempt",
    actor: "bob.martn@acme.com",
    target: "Web session",
    status: "danger",
    latencyMs: 96,
  },
  {
    id: "8835",
    timestamp: "2026-07-07 16:47:29",
    category: "processing",
    action: "OCR PDF",
    actor: "api-service@acme.com",
    target: "scan-batch-0142.pdf",
    status: "success",
    latencyMs: 8421,
  },
  {
    id: "8834",
    timestamp: "2026-07-07 16:20:03",
    category: "security",
    action: "Add watermark",
    actor: "carol.diaz@acme.com",
    target: "policy-handbook.pdf",
    status: "success",
    latencyMs: 640,
  },
  {
    id: "8833",
    timestamp: "2026-07-07 15:58:41",
    category: "config",
    action: "Profile settings updated",
    actor: "alice.chen@acme.com",
    target: "/api/v1/user/change-settings",
    status: "info",
    latencyMs: 175,
  },
  {
    id: "8832",
    timestamp: "2026-07-07 15:29:18",
    category: "processing",
    action: "Split pages",
    actor: "bob.martin@acme.com",
    target: "statement-june.pdf",
    status: "success",
    latencyMs: 410,
  },
  {
    id: "8831",
    timestamp: "2026-07-07 15:02:37",
    category: "processing",
    action: "Compress PDF",
    actor: "api-service@acme.com",
    target: "purchase-order-6610.pdf",
    status: "danger",
    latencyMs: 1203,
  },
  {
    id: "8830",
    timestamp: "2026-07-07 14:41:50",
    category: "security",
    action: "Remove password",
    actor: "raj.patel@acme.com",
    target: "certificate-9001.pdf",
    status: "success",
    latencyMs: 980,
  },
  {
    id: "8829",
    timestamp: "2026-07-07 14:15:22",
    category: "processing",
    action: "PDF to Image",
    actor: "carol.diaz@acme.com",
    target: "contract-amendment.pdf",
    status: "warning",
    latencyMs: 1560,
  },
  {
    id: "8828",
    timestamp: "2026-07-07 13:52:09",
    category: "auth",
    action: "User signed out",
    actor: "alice.chen@acme.com",
    target: "Web session",
    status: "success",
    latencyMs: 42,
  },
  {
    id: "8827",
    timestamp: "2026-07-07 13:30:44",
    category: "config",
    action: "Admin settings changed",
    actor: "admin@stirlingpdf.com",
    target: "/api/v1/admin/team/update",
    status: "info",
    latencyMs: 320,
  },
  {
    id: "8826",
    timestamp: "2026-07-07 13:03:58",
    category: "processing",
    action: "Extract images",
    actor: "raj.patel@acme.com",
    target: "expense-report-q2.pdf",
    status: "success",
    latencyMs: 2200,
  },
  {
    id: "8825",
    timestamp: "2026-07-07 12:38:11",
    category: "auth",
    action: "User signed in",
    actor: "bob.martin@acme.com",
    target: "Web session",
    status: "success",
    latencyMs: 110,
  },
  {
    id: "8824",
    timestamp: "2026-07-07 12:11:47",
    category: "security",
    action: "Add watermark",
    actor: "alice.chen@acme.com",
    target: "MSA-Globex-2026.pdf",
    status: "success",
    latencyMs: 705,
  },
];

export function auditLogFor(tier: Tier): AuditLogResponse {
  const events =
    tier === "free"
      ? AUDIT_EVENTS_ALL.slice(0, 6)
      : tier === "pro"
        ? AUDIT_EVENTS_ALL.slice(0, 12)
        : AUDIT_EVENTS_ALL;

  // Summary is derived from the returned events, exactly like the backend
  // (PortalInfraAuditService) computes it - so mocks and real data reconcile.
  const summary: AuditSummary = {
    totalEvents: events.length,
    policy: events.filter((e) => e.category === "policy").length,
    processing: events.filter((e) => e.category === "processing").length,
    elevation: events.filter((e) => e.category === "elevation").length,
    config: events.filter((e) => e.category === "config").length,
  };
  // The mock represents the admin (whole-server) view, so export is offered.
  return { summary, events, fullServer: true };
}
