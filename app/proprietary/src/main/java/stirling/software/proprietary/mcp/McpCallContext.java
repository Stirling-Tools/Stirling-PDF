package stirling.software.proprietary.mcp;

import java.util.Set;

import tools.jackson.databind.JsonNode;

/** Per-call identity and scopes, plus client capabilities and MRTR answers on 2026-07-28 calls. */
public record McpCallContext(
        String stirlingUserId,
        Set<String> grantedScopes,
        boolean scopesEnabled,
        JsonNode clientCapabilities,
        JsonNode inputResponses) {

    public McpCallContext(String stirlingUserId, Set<String> grantedScopes, boolean scopesEnabled) {
        this(stirlingUserId, grantedScopes, scopesEnabled, null, null);
    }

    public boolean hasScope(String required) {
        if (!scopesEnabled) {
            return true;
        }
        return required == null || required.isBlank() || grantedScopes.contains(required);
    }

    /** True when the client can show a form for us (MRTR {@code elicitation/create}). */
    public boolean canElicitForm() {
        JsonNode elicitation =
                clientCapabilities == null ? null : clientCapabilities.get("elicitation");
        // An empty elicitation object means form mode, per the 2025-11-25 capability rules.
        return elicitation != null
                && elicitation.isObject()
                && (elicitation.isEmpty() || elicitation.has("form"));
    }

    /** True when ChatGPT can show its extended form, which includes a native file picker. */
    public boolean canElicitOpenAiForm() {
        JsonNode extensions =
                clientCapabilities == null ? null : clientCapabilities.get("extensions");
        JsonNode openai = extensions == null ? null : extensions.get("openai/elicitation");
        return openai != null && openai.has("form");
    }

    /** True when the client renders MCP Apps views, so our result card replaces the link text. */
    public boolean rendersApps() {
        JsonNode extensions =
                clientCapabilities == null ? null : clientCapabilities.get("extensions");
        return extensions != null && extensions.has("io.modelcontextprotocol/ui");
    }

    /** The client's answer to the input request with this key, or null. */
    public JsonNode inputResponse(String key) {
        return inputResponses == null ? null : inputResponses.get(key);
    }
}
