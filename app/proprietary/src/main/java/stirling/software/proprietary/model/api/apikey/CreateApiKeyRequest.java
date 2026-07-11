package stirling.software.proprietary.model.api.apikey;

/**
 * Create-key request body from the portal. {@code scope} is "personal", "team-lead", or
 * "team-members"; team scoping resolves to the caller's own team server-side. {@code access} is
 * "full" or "processing"; a team-scoped key must be processing-only (full access can't be shared).
 */
public record CreateApiKeyRequest(String name, String scope, String access) {}
