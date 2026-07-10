package stirling.software.proprietary.model.api.apikey;

/**
 * Create-key request body from the portal. {@code scope} is "personal", "team-lead", or
 * "team-members"; team scoping resolves to the caller's own team server-side.
 */
public record CreateApiKeyRequest(String name, String scope) {}
