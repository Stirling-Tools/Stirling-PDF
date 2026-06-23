import { useState } from "react";
import { Button, Card, Chip, StatusBadge } from "@shared/components";
import type { ApiKey } from "@portal/api/infrastructure";
import {
  KEY_LABEL,
  KEY_TONE,
} from "@portal/components/infrastructure/infraFormat";

/** Collapsible row for a single API key: header summary + expandable detail grid. */
export function ApiKeyCard({ apiKey }: { apiKey: ApiKey }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padding="default" className="portal-infra__key">
      <Button
        variant="ghost"
        className="portal-infra__key-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="portal-infra__key-id">
          <span className="portal-infra__cell-strong">{apiKey.name}</span>
          <code className="portal-infra__cell-code">{apiKey.prefix}</code>
        </span>
        <span className="portal-infra__key-head-right">
          <StatusBadge tone={KEY_TONE[apiKey.status]} size="sm">
            {KEY_LABEL[apiKey.status]}
          </StatusBadge>
          <span
            className={"portal-infra__chevron" + (open ? " is-open" : "")}
            aria-hidden
          >
            ›
          </span>
        </span>
      </Button>

      {open && (
        <div className="portal-infra__key-body">
          <dl className="portal-infra__kv">
            <div>
              <dt>Created</dt>
              <dd>{apiKey.created}</dd>
            </div>
            <div>
              <dt>Last used</dt>
              <dd>{apiKey.lastUsed}</dd>
            </div>
            <div>
              <dt>Rate limit</dt>
              <dd className="portal-infra__mono">
                {apiKey.rateLimit.toLocaleString()} req/min
              </dd>
            </div>
            <div>
              <dt>Usage today</dt>
              <dd className="portal-infra__mono">
                {apiKey.usageToday.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Usage this month</dt>
              <dd className="portal-infra__mono">
                {apiKey.usageMonth.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Permissions</dt>
              <dd className="portal-infra__chips">
                {apiKey.permissions.map((p) => (
                  <Chip key={p} accent="blue" size="sm">
                    {p}
                  </Chip>
                ))}
              </dd>
            </div>
            <div className="portal-infra__kv-wide">
              <dt>Allowed IPs</dt>
              <dd className="portal-infra__chips">
                {apiKey.allowedIps.length === 0 ? (
                  <span className="portal-infra__muted">
                    Any IP (no allowlist)
                  </span>
                ) : (
                  apiKey.allowedIps.map((ip) => (
                    <Chip key={ip} accent="neutral" size="sm">
                      <span className="portal-infra__mono">{ip}</span>
                    </Chip>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}
