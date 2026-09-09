package stirling.software.proprietary.mcp.security;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import stirling.software.common.model.ApplicationProperties;

/**
 * Startup sanity-checks for MCP config; {@link McpSecurityConfig} logs the findings at boot so a
 * misconfigured /mcp endpoint shows up in the logs instead of as a later rejected-token 401.
 */
public final class McpConfigValidator {

    public enum Severity {
        WARN,
        INFO
    }

    public record Finding(Severity severity, String message) {}

    private McpConfigValidator() {}

    /** Inspect the resolved MCP config and return ordered findings (most actionable first). */
    public static List<Finding> validate(ApplicationProperties.Mcp mcp) {
        List<Finding> findings = new ArrayList<>();
        ApplicationProperties.Mcp.Auth auth = mcp.getAuth();

        if ("apikey".equalsIgnoreCase(auth.getMode())) {
            findings.add(
                    info(
                            "auth mode = apikey - clients send a Stirling API key via X-API-KEY (or"
                                    + " Authorization: Bearer <key>); no external IdP needed. The key"
                                    + " must belong to a provisioned, enabled account (Account -> API"
                                    + " Keys)."));
            return findings;
        }

        // Anything that isn't exactly "apikey" runs the OAuth chain (mirrors isApiKeyMode()).
        String mode = auth.getMode();
        if (mode != null && !mode.isBlank() && !"oauth".equalsIgnoreCase(mode.trim())) {
            findings.add(
                    warn(
                            "mcp.auth.mode='"
                                    + mode
                                    + "' is not recognized (expected 'oauth' or 'apikey'); it falls"
                                    + " back to the OAuth chain, which rejects every token unless"
                                    + " issuer-uri and resource-id are set. A near-miss like"
                                    + " 'api-key' is NOT treated as API-key mode."));
        }
        findings.add(info("auth mode = oauth - running as an OAuth2 resource server for /mcp."));

        if (isBlank(auth.getIssuerUri())) {
            findings.add(
                    warn(
                            "mcp.auth.issuer-uri is not set: the JWT decoder fails closed and rejects"
                                    + " every token. Set it to your IdP issuer that publishes"
                                    + " /.well-known/openid-configuration (e.g."
                                    + " https://login.microsoftonline.com/<tenant>/v2.0)."));
        } else if (!looksLikeUrl(auth.getIssuerUri())) {
            findings.add(
                    warn(
                            "mcp.auth.issuer-uri='"
                                    + auth.getIssuerUri()
                                    + "' does not look like an http(s) URL."));
        }

        boolean hasResourceId = !isBlank(auth.getResourceId());
        boolean hasAcceptedAudiences =
                auth.getAcceptedAudiences().stream().anyMatch(a -> !isBlank(a));

        if (!hasResourceId && !hasAcceptedAudiences) {
            findings.add(
                    warn(
                            "neither mcp.auth.resource-id nor mcp.auth.accepted-audiences is set: the"
                                    + " audience validator fails closed and rejects every token (RFC"
                                    + " 8707). Set resource-id to this server's public /mcp URL, or"
                                    + " accepted-audiences to the audience your IdP actually mints."));
        } else {
            if (hasResourceId && !looksLikeUrl(auth.getResourceId())) {
                findings.add(
                        warn(
                                "mcp.auth.resource-id='"
                                        + auth.getResourceId()
                                        + "' is not an http(s) URL: the token aud must match it"
                                        + " exactly (scheme, host and port included)."));
            } else if (hasResourceId && !auth.getResourceId().endsWith("/mcp")) {
                findings.add(
                        warn(
                                "mcp.auth.resource-id='"
                                        + auth.getResourceId()
                                        + "' does not end in /mcp: it must match the public URL"
                                        + " clients call and the audience your IdP puts in the"
                                        + " token."));
            }
            if (hasAcceptedAudiences) {
                findings.add(
                        info(
                                "mcp.auth.accepted-audiences="
                                        + auth.getAcceptedAudiences()
                                        + " - tokens whose aud matches any of these are accepted, the"
                                        + " escape hatch for IdPs that can't mint a resource-specific"
                                        + " audience (e.g. an Entra ID app id, or Supabase's"
                                        + " aud=authenticated)."));
            } else {
                findings.add(
                        info(
                                "audience binding is strict (token aud must equal"
                                        + " mcp.auth.resource-id). If your IdP can't mint that - e.g."
                                        + " Entra ID issues aud=<client-id> - set"
                                        + " mcp.auth.accepted-audiences to the audience it actually"
                                        + " emits."));
            }
        }

        if (isBlank(auth.getJwksUri())) {
            findings.add(
                    info(
                            "mcp.auth.jwks-uri not set - signing keys are auto-discovered from the"
                                    + " issuer's OpenID configuration."));
        }

        if ("sub".equalsIgnoreCase(auth.getUsernameClaim()) && auth.isRequireExistingAccount()) {
            findings.add(
                    warn(
                            "mcp.auth.username-claim='sub' with require-existing-account=true: many"
                                    + " IdPs (e.g. Entra ID, Google) set 'sub' to an opaque id that won't"
                                    + " match a Stirling username. Set mcp.auth.username-claim to 'email'"
                                    + " or 'preferred_username', or provision accounts keyed by sub."));
        }

        if (!auth.isRequireExistingAccount()) {
            findings.add(
                    warn(
                            "mcp.auth.require-existing-account=false: any token your IdP signs can"
                                    + " invoke MCP tools even if its subject has no Stirling account. Set"
                                    + " it true unless you intend open access for every IdP-valid"
                                    + " token."));
        }

        if (mcp.isScopesEnabled()) {
            findings.add(
                    info(
                            "mcp.scopes-enabled=true - the IdP must mint 'mcp.tools.read' and"
                                    + " 'mcp.tools.write' scopes or clients are rejected; set"
                                    + " mcp.scopes-enabled=false if it can only issue coarse tokens."));
        }

        List<String> allowed = mcp.getAllowedOperations();
        List<String> blocked = mcp.getBlockedOperations();
        if (allowed != null && !allowed.isEmpty()) {
            findings.add(
                    info(
                            "mcp.allowed-operations is a strict allow-list of "
                                    + allowed.size()
                                    + " operation(s); every other tool is hidden, so a wrong or"
                                    + " typo'd id silently exposes nothing."));
            List<String> shadowed =
                    blocked == null
                            ? List.of()
                            : allowed.stream().filter(blocked::contains).toList();
            if (!shadowed.isEmpty()) {
                findings.add(
                        warn(
                                "mcp operation(s) "
                                        + shadowed
                                        + " are in both allowed-operations and blocked-operations;"
                                        + " blocked wins, so they are hidden."));
            }
        }

        if (findings.stream().noneMatch(f -> f.severity() == Severity.WARN)) {
            findings.add(info("OAuth settings look complete."));
        }

        return findings;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean looksLikeUrl(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    private static Finding warn(String message) {
        return new Finding(Severity.WARN, message);
    }

    private static Finding info(String message) {
        return new Finding(Severity.INFO, message);
    }
}
