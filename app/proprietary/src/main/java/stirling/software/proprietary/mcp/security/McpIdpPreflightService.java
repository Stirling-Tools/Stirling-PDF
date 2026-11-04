package stirling.software.proprietary.mcp.security;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.oauth.McpTokenMinter;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Admin "Test connection": checks what an OAuth-only MCP client (ChatGPT, claude.ai) needs, so the
 * silent ways a setup fails show up as a checklist instead of a client-side error.
 */
@Slf4j
@Service
public class McpIdpPreflightService {

    /** One checked requirement. {@code status} is pass, fail or warn. */
    public record Check(String id, String status, String title, String detail) {

        static Check pass(String id, String title, String detail) {
            return new Check(id, "pass", title, detail);
        }

        static Check fail(String id, String title, String detail) {
            return new Check(id, "fail", title, detail);
        }

        static Check warn(String id, String title, String detail) {
            return new Check(id, "warn", title, detail);
        }
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String RESOURCE_METADATA = "/.well-known/oauth-protected-resource";

    private final ApplicationProperties applicationProperties;
    private final ObjectProvider<McpTokenMinter> tokenMinter;
    private final HttpClient httpClient =
            HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();

    public McpIdpPreflightService(
            ApplicationProperties applicationProperties,
            ObjectProvider<McpTokenMinter> tokenMinter) {
        this.applicationProperties = applicationProperties;
        this.tokenMinter = tokenMinter;
    }

    public Map<String, Object> run() {
        ApplicationProperties.Mcp mcp = applicationProperties.getMcp();
        ApplicationProperties.Mcp.Auth auth = mcp.getAuth();
        List<Check> checks = new ArrayList<>();

        if (!mcp.isEnabled()) {
            checks.add(
                    Check.fail(
                            "enabled",
                            "MCP server is off",
                            "Turn on the MCP server, save, and restart."));
            return summarise(checks, auth);
        }

        String mode = auth.getMode() == null ? "" : auth.getMode().toLowerCase(Locale.ROOT);
        switch (mode) {
            case "builtin" -> checks.addAll(builtinChecks(auth));
            case "apikey" ->
                    checks.add(
                            Check.warn(
                                    "mode",
                                    "API-key mode publishes no OAuth metadata",
                                    "Clients that can send a header (Claude Desktop, Claude Code)"
                                            + " work, but ChatGPT and the claude.ai connector are"
                                            + " OAuth-only. Switch to built-in mode for a browser"
                                            + " sign-in with no IdP."));
            default -> checks.addAll(externalIdpChecks(auth));
        }
        return summarise(checks, auth);
    }

    private List<Check> builtinChecks(ApplicationProperties.Mcp.Auth auth) {
        List<Check> checks = new ArrayList<>();
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            checks.add(
                    Check.fail(
                            "login",
                            "Login is turned off",
                            "Built-in mode signs users in with their Stirling account, so"
                                    + " security.enableLogin must be on."));
        }
        String resourceId = auth.getResourceId() == null ? "" : auth.getResourceId().trim();
        if (resourceId.isBlank()) {
            checks.add(
                    Check.fail(
                            "resource-id",
                            "Connector URL (resource ID) is not set",
                            "Set it to this server's public /mcp URL; tokens are bound to it and"
                                    + " the issuer is derived from it."));
        } else if (!resourceId.endsWith("/mcp")
                && (auth.getBuiltin().getIssuer() == null
                        || auth.getBuiltin().getIssuer().isBlank())) {
            checks.add(
                    Check.warn(
                            "resource-id",
                            "Connector URL does not end in /mcp",
                            "The issuer is derived by stripping /mcp. Set"
                                    + " mcp.auth.builtin.issuer explicitly."));
        } else {
            checks.add(Check.pass("resource-id", "Connector URL is set", resourceId));
        }
        checks.add(registrationCheck(auth.getBuiltin()));
        checks.add(signingKeyCheck());
        checks.add(
                auth.getBuiltin().getRefreshTokenDays() > 0
                        ? Check.pass(
                                "refresh",
                                "Refresh tokens and offline_access are on",
                                "Clients stay connected without signing in again every hour.")
                        : Check.warn(
                                "refresh",
                                "Refresh tokens are off",
                                "ChatGPT requests offline_access; without refresh tokens users"
                                        + " must reconnect when the access token expires."));
        if (!resourceId.isBlank()) {
            checks.add(publicMetadataCheck(resourceId));
        }
        return checks;
    }

    private static Check registrationCheck(ApplicationProperties.Mcp.Auth.Builtin builtin) {
        boolean dcr = builtin.isAllowDynamicRegistration();
        boolean cimd = builtin.isAllowClientMetadataDocuments();
        if (dcr && cimd) {
            return Check.pass(
                    "registration",
                    "Client registration is open",
                    "Clients can register dynamically (RFC 7591) or identify themselves with a"
                            + " client metadata URL.");
        }
        if (dcr || cimd) {
            return Check.warn(
                    "registration",
                    "Only one client registration method is on",
                    "Claude uses dynamic registration and ChatGPT can use a client metadata"
                            + " URL; turning either off locks those clients out.");
        }
        return Check.fail(
                "registration",
                "Client registration is off",
                "No new client can connect. Enable dynamic registration or client metadata"
                        + " documents.");
    }

    private Check signingKeyCheck() {
        McpTokenMinter minter = tokenMinter.getIfAvailable();
        if (minter == null) {
            return Check.warn(
                    "signing-key",
                    "Signing keys not checked",
                    "Save and restart to load the built-in authorization server first.");
        }
        try {
            if (!minter.publicJwks().getKeys().isEmpty()) {
                return Check.pass(
                        "signing-key",
                        "Token signing key is available",
                        "Access tokens are signed with this server's rotating RSA key.");
            }
        } catch (Exception e) {
            log.debug("MCP preflight: signing key lookup failed", e);
        }
        return Check.fail(
                "signing-key",
                "No token signing key",
                "The JWT keystore has no active RSA key, so no access token can be issued.");
    }

    /** Fetches our own metadata through the public URL, as a chat app would. */
    private Check publicMetadataCheck(String resourceId) {
        String url;
        try {
            URI resource = URI.create(resourceId);
            url =
                    resource.getScheme()
                            + "://"
                            + resource.getRawAuthority()
                            + RESOURCE_METADATA
                            + (resource.getRawPath() == null ? "" : resource.getRawPath());
        } catch (Exception e) {
            return Check.fail("public-url", "Connector URL is not a valid URL", resourceId);
        }
        JsonNode doc = getJson(url);
        if (doc == null) {
            return Check.warn(
                    "public-url",
                    "Could not reach this server through its connector URL",
                    "Tried "
                            + url
                            + ". The server may simply be unable to call its own public address"
                            + " (common behind NAT); check it from outside before connecting.");
        }
        JsonNode servers = doc.get("authorization_servers");
        if (servers == null || !servers.isArray() || servers.isEmpty()) {
            return Check.fail(
                    "public-url",
                    "Public metadata does not name an authorization server",
                    "The connector URL may be served by a different instance or proxy.");
        }
        return Check.pass("public-url", "Public metadata is reachable", url);
    }

    private List<Check> externalIdpChecks(ApplicationProperties.Mcp.Auth auth) {
        List<Check> checks = new ArrayList<>();
        String issuer = auth.getIssuerUri() == null ? "" : auth.getIssuerUri().trim();
        if (issuer.isBlank()) {
            checks.add(
                    Check.fail(
                            "issuer",
                            "Issuer URI is not set",
                            "OAuth mode needs an external IdP. Set the issuer, or switch to"
                                    + " built-in mode to use Stirling's own authorization"
                                    + " server."));
            return checks;
        }

        JsonNode metadata = fetchIdpMetadata(issuer);
        if (metadata == null) {
            checks.add(
                    Check.fail(
                            "issuer",
                            "Could not read the IdP's metadata",
                            "Tried "
                                    + issuer
                                    + "/.well-known/openid-configuration and"
                                    + " /.well-known/oauth-authorization-server. Check the URL"
                                    + " is reachable from this server."));
            return checks;
        }
        checks.add(Check.pass("issuer", "IdP metadata is reachable", issuer));

        String registration = text(metadata, "registration_endpoint");
        boolean cimd =
                metadata.has("client_id_metadata_document_supported")
                        && metadata.get("client_id_metadata_document_supported").asBoolean();
        if (registration != null) {
            checks.add(probeRegistration(registration));
        } else if (cimd) {
            checks.add(
                    Check.warn(
                            "registration",
                            "IdP supports client metadata URLs but not dynamic registration",
                            "Clients that rely on dynamic registration, such as Claude, cannot"
                                    + " connect."));
        } else {
            checks.add(
                    Check.fail(
                            "registration",
                            "IdP offers no way for clients to register themselves",
                            "Enable RFC 7591 dynamic registration on the IdP, or switch to"
                                    + " built-in mode."));
        }

        JsonNode methods = metadata.get("code_challenge_methods_supported");
        boolean s256 = methods != null && methods.toString().contains("S256");
        checks.add(
                s256
                        ? Check.pass("pkce", "PKCE S256 is supported", methods.toString())
                        : Check.fail(
                                "pkce",
                                "IdP does not advertise PKCE S256",
                                "MCP clients require it."));

        checks.add(
                Check.warn(
                        "audience",
                        "Verify the audience and scopes are realm-wide defaults",
                        "A dynamically registered client only inherits mappers configured as"
                                + " default client scopes. Tokens must carry aud="
                                + auth.getResourceId()
                                + (applicationProperties.getMcp().isScopesEnabled()
                                        ? " plus the mcp.tools.read and mcp.tools.write scopes."
                                        : ".")));
        checks.add(accountCheck(auth));
        return checks;
    }

    private static Check accountCheck(ApplicationProperties.Mcp.Auth auth) {
        if (!auth.isRequireExistingAccount()) {
            return Check.warn(
                    "account",
                    "Account binding is off",
                    "Any token your IdP signs can use MCP without a local account.");
        }
        if (auth.isAutoProvisionUsers()) {
            return Check.pass(
                    "account",
                    "Unknown subjects are auto-provisioned",
                    "A first-time subject gets a disabled account for an admin to enable,"
                            + " instead of a 403.");
        }
        return Check.warn(
                "account",
                "Every IdP user needs a matching Stirling account",
                "The '"
                        + auth.getUsernameClaim()
                        + "' claim must equal an enabled Stirling username, or the token is"
                        + " rejected with 403. Enable auto-provisioning to soften this.");
    }

    /** Actually try an anonymous registration: most IdPs block it by default. */
    private Check probeRegistration(String registrationEndpoint) {
        try {
            HttpRequest request =
                    HttpRequest.newBuilder(URI.create(registrationEndpoint))
                            .timeout(Duration.ofSeconds(8))
                            .header("Content-Type", "application/json")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            "{\"client_name\":\"Stirling MCP preflight\","
                                                    + "\"redirect_uris\":[\"https://localhost/preflight\"],"
                                                    + "\"grant_types\":[\"authorization_code\"],"
                                                    + "\"response_types\":[\"code\"],"
                                                    + "\"token_endpoint_auth_method\":\"none\"}"))
                            .build();
            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 201) {
                return Check.pass(
                        "registration",
                        "Anonymous dynamic registration works",
                        "A throwaway client registered successfully. Delete it in your IdP if it"
                                + " lingers.");
            }
            return Check.fail(
                    "registration",
                    "IdP refused an anonymous registration (HTTP " + response.statusCode() + ")",
                    "Clients register with no credentials, so this must succeed. "
                            + firstLine(response.body())
                            + " Keycloak's 'Trusted Hosts' anonymous policy blocks this by"
                            + " default.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Check.fail("registration", "Registration probe was interrupted", "");
        } catch (Exception e) {
            return Check.fail(
                    "registration",
                    "Could not reach the registration endpoint",
                    String.valueOf(e.getMessage()));
        }
    }

    private JsonNode fetchIdpMetadata(String issuer) {
        String base = issuer.endsWith("/") ? issuer.substring(0, issuer.length() - 1) : issuer;
        for (String suffix :
                List.of(
                        "/.well-known/openid-configuration",
                        "/.well-known/oauth-authorization-server")) {
            JsonNode doc = getJson(base + suffix);
            if (doc != null) {
                return doc;
            }
        }
        return null;
    }

    private JsonNode getJson(String url) {
        try {
            HttpRequest request =
                    HttpRequest.newBuilder(URI.create(url))
                            .timeout(Duration.ofSeconds(8))
                            .header("Accept", "application/json")
                            .GET()
                            .build();
            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                return MAPPER.readTree(response.body());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.debug("MCP preflight: {} unreachable", url, e);
        }
        return null;
    }

    private Map<String, Object> summarise(List<Check> checks, ApplicationProperties.Mcp.Auth auth) {
        boolean ready = checks.stream().noneMatch(c -> "fail".equals(c.status()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", auth.getMode() == null ? "" : auth.getMode());
        out.put("connectorUrl", auth.getResourceId() == null ? "" : auth.getResourceId().trim());
        out.put("ready", ready);
        out.put("checks", checks);
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.asString().isBlank()
                ? null
                : value.asString();
    }

    private static String firstLine(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        String trimmed = body.strip().replaceAll("\\s+", " ");
        return trimmed.length() > 240 ? trimmed.substring(0, 240) + "..." : trimmed;
    }
}
