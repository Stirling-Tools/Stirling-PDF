#!/usr/bin/env python3
"""Generate realistic audit_events seed data for live demos.

Emits H2 SQL that inserts rows into the AUDIT_EVENTS table using ONLY the real
AuditEventType values (see AuditEventType.java). The `data` column is a JSON blob
shaped like the real audit pipeline produces (CustomAuditEventRepository +
AuditService): principal, timestamp, __origin, httpMethod, path, clientIp,
statusCode, latencyMs, status, files[], requestId.

Deterministic (fixed RNG seed) so re-runs produce identical output. Rows are
inserted WITHOUT an ID so H2's IDENTITY column assigns them and its sequence
stays consistent for the app's later real inserts.

Usage:
    python seed_audit_events.py --end 2026-07-07 --days 14 --count 320 --out seed_audit_events.sql
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta, timezone

# The nine real AuditEventType values. Nothing outside this set is ever emitted.
REAL_TYPES = [
    "USER_LOGIN",
    "USER_LOGOUT",
    "USER_FAILED_LOGIN",
    "USER_PROFILE_UPDATE",
    "SETTINGS_CHANGED",
    "FILE_OPERATION",
    "PDF_PROCESS",
    "UI_DATA",
    "HTTP_REQUEST",
]

# Relative weights: a PDF org spends most of its audited volume on processing.
TYPE_WEIGHTS = {
    "PDF_PROCESS": 44,
    "FILE_OPERATION": 15,
    "UI_DATA": 14,
    "HTTP_REQUEST": 8,
    "USER_LOGIN": 6,
    "USER_LOGOUT": 4,
    "USER_PROFILE_UPDATE": 3,
    "SETTINGS_CHANGED": 3,
    "USER_FAILED_LOGIN": 3,
}

# Demo org members. api-service authenticates via API key (origin API).
WEB_USERS = [
    "admin@stirlingpdf.com",
    "alice.chen@acme.com",
    "bob.martin@acme.com",
    "carol.diaz@acme.com",
    "raj.patel@acme.com",
]
API_USER = "api-service@acme.com"
ADMIN_USER = "admin@stirlingpdf.com"
# Usernames that show up only on failed logins (typos / unknown accounts).
FAILED_LOGIN_ACTORS = [
    "bob.martn@acme.com",
    "unknown@acme.com",
    "alice.chen@acme.com",
    "test@acme.com",
]

# Real PDF tool endpoints (mirror the controller @RequestMapping paths).
PDF_ENDPOINTS = [
    "/api/v1/misc/compress-pdf",
    "/api/v1/general/merge-pdfs",
    "/api/v1/general/split-pages",
    "/api/v1/convert/pdf/img",
    "/api/v1/convert/img/pdf",
    "/api/v1/misc/ocr-pdf",
    "/api/v1/general/rotate-pdf",
    "/api/v1/security/add-password",
    "/api/v1/security/remove-password",
    "/api/v1/misc/add-stamp",
    "/api/v1/misc/repair",
    "/api/v1/convert/pdf/word",
    "/api/v1/security/add-watermark",
    "/api/v1/general/remove-pages",
]
FILE_ENDPOINTS = [
    "/api/v1/general/merge-pdfs",
    "/api/v1/general/split-pages",
    "/api/v1/misc/flatten",
    "/api/v1/general/rearrange-pages",
    "/api/v1/misc/extract-images",
]
# GET endpoints classified as UI_DATA by AuditService.isUiDataEndpoint(...).
UI_DATA_ENDPOINTS = [
    "/api/v1/audit/data",
    "/api/v1/audit/stats",
    "/api/v1/user/settings",
    "/api/v1/admin/settings/all",
    "/api/v1/users/list",
    "/api/v1/proprietary/ui-data/team",
]
HTTP_ENDPOINTS = [
    "/api/v1/info/status",
    "/api/v1/pipeline/handleData",
    "/api/v1/convert/pdf/csv",
    "/api/v1/info/uptime",
]

SAMPLE_FILES = [
    ("acme-invoice-8841.pdf", 184320),
    ("MSA-Globex-2026.pdf", 992145),
    ("expense-report-q2.pdf", 421900),
    ("onboarding-packet.pdf", 1560321),
    ("scan-batch-0142.pdf", 3204112),
    ("statement-june.pdf", 88210),
    ("contract-amendment.pdf", 264500),
    ("purchase-order-6610.pdf", 132044),
    ("policy-handbook.pdf", 2044120),
    ("certificate-9001.pdf", 51200),
]


def rng_client_ip(rng: random.Random) -> str:
    pool = [
        f"10.0.{rng.randint(0, 4)}.{rng.randint(2, 250)}",
        f"192.168.{rng.randint(0, 3)}.{rng.randint(2, 250)}",
        f"203.0.113.{rng.randint(2, 250)}",
        f"198.51.100.{rng.randint(2, 250)}",
    ]
    return rng.choices(pool, weights=[45, 25, 20, 10])[0]


def rng_request_id(rng: random.Random) -> str:
    return "".join(rng.choice("0123456789abcdef") for _ in range(16))


def business_time(rng: random.Random, end: datetime, days: int) -> datetime:
    """A timestamp within the window, weighted to weekday business hours."""
    # Skew toward more-recent days so the last 24h / 7d windows look active.
    day_offset = int(rng.triangular(0, days, 0))
    day = end - timedelta(days=day_offset)
    # Nudge weekends to lighter traffic by occasionally rerolling onto a weekday.
    if day.weekday() >= 5 and rng.random() < 0.6:
        day -= timedelta(days=rng.randint(1, 2))
    hour = int(rng.triangular(7, 20, 13))  # peak around 1pm UTC
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    micros = rng.randint(0, 999999)
    return day.replace(
        hour=min(hour, 23), minute=minute, second=second, microsecond=micros
    )


def files_payload(rng: random.Random, n: int) -> list[dict]:
    picks = rng.sample(SAMPLE_FILES, k=min(n, len(SAMPLE_FILES)))
    return [
        {"name": name, "size": size, "type": "application/pdf"} for name, size in picks
    ]


def build_event(rng: random.Random, etype: str, ts: datetime) -> tuple[str, str, dict]:
    """Return (principal, type, data-dict) for one realistic event."""
    iso = ts.astimezone(timezone.utc).isoformat()
    data: dict = {"timestamp": iso}

    if etype == "PDF_PROCESS":
        is_api = rng.random() < 0.25
        principal = API_USER if is_api else rng.choice(WEB_USERS)
        data["__origin"] = "API" if is_api else "WEB"
        data["httpMethod"] = "POST"
        data["path"] = rng.choice(PDF_ENDPOINTS)
        failed = rng.random() < 0.06
        data["statusCode"] = rng.choice([400, 500]) if failed else 200
        data["status"] = "failure" if failed else "success"
        data["latencyMs"] = rng.randint(180, 9200)
        data["files"] = files_payload(rng, rng.randint(1, 3))

    elif etype == "FILE_OPERATION":
        principal = rng.choice(WEB_USERS)
        data["__origin"] = "WEB"
        data["httpMethod"] = "POST"
        data["path"] = rng.choice(FILE_ENDPOINTS)
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(120, 4200)
        data["files"] = files_payload(rng, rng.randint(1, 4))

    elif etype == "UI_DATA":
        principal = rng.choice(WEB_USERS)
        data["__origin"] = "WEB"
        data["httpMethod"] = "GET"
        data["path"] = rng.choice(UI_DATA_ENDPOINTS)
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(8, 340)

    elif etype == "HTTP_REQUEST":
        is_api = rng.random() < 0.4
        principal = API_USER if is_api else rng.choice(WEB_USERS)
        data["__origin"] = "API" if is_api else "WEB"
        data["httpMethod"] = "GET"
        data["path"] = rng.choice(HTTP_ENDPOINTS)
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(10, 900)

    elif etype == "USER_LOGIN":
        principal = rng.choice(WEB_USERS)
        data["__origin"] = "WEB"
        data["httpMethod"] = "POST"
        data["path"] = "/login"
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(60, 480)

    elif etype == "USER_LOGOUT":
        principal = rng.choice(WEB_USERS)
        data["__origin"] = "WEB"
        data["httpMethod"] = "POST"
        data["path"] = "/logout"
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(20, 160)

    elif etype == "USER_FAILED_LOGIN":
        principal = rng.choice(FAILED_LOGIN_ACTORS)
        data["__origin"] = "WEB"
        data["httpMethod"] = "POST"
        data["path"] = "/login"
        data["statusCode"] = 401
        data["status"] = "failure"
        data["latencyMs"] = rng.randint(40, 260)

    elif etype == "USER_PROFILE_UPDATE":
        principal = rng.choice(WEB_USERS)
        data["__origin"] = "WEB"
        data["httpMethod"] = "POST"
        data["path"] = "/api/v1/user/change-settings"
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(40, 520)

    elif etype == "SETTINGS_CHANGED":
        principal = ADMIN_USER
        data["__origin"] = "WEB"
        data["httpMethod"] = "POST"
        data["path"] = rng.choice(
            [
                "/api/v1/admin/settings/update",
                "/api/v1/admin/team/update",
                "/api/v1/admin/settings/audit",
            ]
        )
        data["statusCode"] = 200
        data["status"] = "success"
        data["latencyMs"] = rng.randint(50, 700)

    else:  # defensive: never reached, REAL_TYPES only
        raise ValueError(f"non-real audit type: {etype}")

    # Fields the real pipeline always attaches.
    data["principal"] = principal
    ip = rng_client_ip(rng)
    data["clientIp"] = ip
    data["__ipAddress"] = ip
    data["requestId"] = rng_request_id(rng)
    return principal, etype, data


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--end", default="2026-07-07", help="last day of the window (YYYY-MM-DD)"
    )
    parser.add_argument("--days", type=int, default=14, help="window size in days")
    parser.add_argument("--count", type=int, default=320, help="number of events")
    parser.add_argument(
        "--seed", type=int, default=20260707, help="RNG seed (deterministic)"
    )
    parser.add_argument(
        "--out", default="seed_audit_events.sql", help="output SQL file"
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)
    end = datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    types = list(TYPE_WEIGHTS.keys())
    weights = [TYPE_WEIGHTS[t] for t in types]

    rows = []
    for _ in range(args.count):
        etype = rng.choices(types, weights=weights)[0]
        ts = business_time(rng, end, args.days)
        principal, typ, data = build_event(rng, etype, ts)
        rows.append((ts, principal, typ, data))

    rows.sort(key=lambda r: r[0])  # chronological for readability

    lines = [
        "-- Demo seed data for AUDIT_EVENTS.",
        "-- Generated by scripts/demo/seed_audit_events.py (deterministic).",
        "-- Uses ONLY real AuditEventType values. Rows omit ID so H2 IDENTITY assigns it.",
        "",
    ]
    for ts, principal, typ, data in rows:
        json_blob = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        ts_literal = (
            ts.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f") + "+00"
        )
        lines.append(
            'INSERT INTO "PUBLIC"."AUDIT_EVENTS" ("PRINCIPAL","TYPE","DATA","TIMESTAMP") VALUES ('
            + sql_str(principal)
            + ","
            + sql_str(typ)
            + ","
            + sql_str(json_blob)
            + ", TIMESTAMP WITH TIME ZONE "
            + sql_str(ts_literal)
            + ");"
        )

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    # Distribution summary to stderr-free stdout for the operator.
    counts: dict[str, int] = {}
    for _, _, typ, _ in rows:
        counts[typ] = counts.get(typ, 0) + 1
    print(f"Wrote {len(rows)} events to {args.out}")
    for typ in REAL_TYPES:
        print(f"  {typ:<20} {counts.get(typ, 0)}")


if __name__ == "__main__":
    main()
