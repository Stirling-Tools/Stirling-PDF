import type { ChipAccent } from "@app/ui";
import type { IntegrationType, OwnerScope } from "@portal/api/integrations";

/** One field in a config's create/edit form. */
export interface IntegrationField {
  key: string;
  label: string;
  /** Rendered as a password input; the backend masks it on read. */
  secret?: boolean;
  placeholder?: string;
  required?: boolean;
}

/**
 * The fields a user fills per tool type. Secret keys are named so the backend
 * SecretMasker recognises them (secretKey/token/apiKey) - masked on read, and
 * kept when the field is left blank on edit. S3 is intentionally absent: those
 * connections are "sources" and managed from the Sources surface.
 */
export const TYPE_FIELDS: Record<
  Extract<IntegrationType, "API" | "MCP">,
  IntegrationField[]
> = {
  API: [
    {
      key: "baseUrl",
      label: "Base URL",
      required: true,
      placeholder: "https://api.example.com",
    },
    { key: "apiKey", label: "API key", secret: true },
  ],
  MCP: [
    {
      key: "url",
      label: "Server URL",
      required: true,
      placeholder: "https://mcp.example.com",
    },
    { key: "token", label: "Auth token (optional)", secret: true },
  ],
};

export const TYPE_LABEL: Record<IntegrationType, string> = {
  API: "API",
  MCP: "MCP",
  S3: "S3",
};

export const TYPE_TONE: Record<IntegrationType, ChipAccent> = {
  API: "default",
  MCP: "premium",
  S3: "neutral",
};

/** Who owns / can use a config. Portal admins create Personal or Org-wide. */
export interface ScopeOption {
  value: Extract<OwnerScope, "USER" | "SERVER">;
  label: string;
  hint: string;
}

export const SCOPE_OPTIONS: ScopeOption[] = [
  {
    value: "USER",
    label: "Personal (just me)",
    hint: "Only you can use it, unless you share it with specific people.",
  },
  {
    value: "SERVER",
    label: "Whole organization",
    hint: "Everyone in the organization can use it.",
  },
];

/**
 * Server-owned configs are meant for everyone, so open them to the org;
 * personal configs stay owner-only until explicitly shared.
 */
export function defaultAccessForScope(
  scope: Extract<OwnerScope, "USER" | "SERVER">,
): "ORG_ALL" | "EXPLICIT_ONLY" {
  return scope === "SERVER" ? "ORG_ALL" : "EXPLICIT_ONLY";
}
