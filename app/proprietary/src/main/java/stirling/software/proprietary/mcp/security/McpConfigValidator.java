package stirling.software.proprietary.mcp.security;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import stirling.software.common.model.ApplicationProperties;

/**
 * Startup sanity-checks for MCP configuration. Produces human-readable findings that {@link
 * McpSecurityConfig} logs once at boot, so a misconfigured /mcp endpoint is obvious from the logs
 * before a client ever connects - instead of only surfacing later as a rejected-token 401.
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

        if (isBlank(auth.getResourceId())) {
            findings.add(
                    warn(
                            "mcp.auth.resource-id is not set: the audience validator rejects every"
                                    + " token (RFC 8707). Set it to this server's public /mcp URL (e.g."
                                    + " https://your-host/mcp)."));
        } else if (!auth.getResourceId().endsWith("/mcp")) {
            findings.add(
                    warn(
                            "mcp.auth.resource-id='"
                                    + auth.getResourceId()
                                    + "' does not end in /mcp: it must match the public URL clients"
                                    + " call and the audience your IdP puts in the token."));
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

        if (mcp.isScopesEnabled()) {
            findings.add(
                    info(
                            "mcp.scopes-enabled=true - the IdP must mint 'mcp.tools.read' and"
                                    + " 'mcp.tools.write' scopes or clients are rejected; set"
                                    + " mcp.scopes-enabled=false if it can only issue coarse tokens."));
        }

        if (findings.stream().noneMatch(f -> f.severity() == Severity.WARN)) {
            findings.add(info("OAuth settings look complete (issuer + resource-id set)."));
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
