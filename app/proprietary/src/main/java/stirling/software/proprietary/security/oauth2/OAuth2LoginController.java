package stirling.software.proprietary.security.oauth2;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import stirling.software.common.model.ApplicationProperties;

/**
 * OAuth2 / OIDC login initiation. Serves {@code GET /oauth2/authorization/{registrationId}} (the
 * Spring-compatible path the frontend and {@code testing/compose/validate-oauth-test.sh} expect) by
 * redirecting to the IdP authorization endpoint. The matching callback is handled by {@link
 * OAuth2CallbackServlet} (a servlet, because quarkus-undertow owns the {@code /login/*} prefix).
 * Spring Security's {@code oauth2Login()} DSL was removed in the migration and {@code quarkus-oidc}
 * is disabled (build-time gated), so the flow is implemented directly.
 */
@ApplicationScoped
@Path("")
public class OAuth2LoginController {

    @ConfigProperty(name = "security.oauth2.enabled", defaultValue = "false")
    boolean oauth2Enabled;

    @ConfigProperty(name = "security.oauth2.client.keycloak.issuer")
    Optional<String> issuer;

    @ConfigProperty(name = "security.oauth2.client.keycloak.clientId")
    Optional<String> clientId;

    @ConfigProperty(
            name = "security.oauth2.client.keycloak.scopes",
            defaultValue = "openid,profile,email")
    String scopes;

    @Inject ApplicationProperties applicationProperties;

    @GET
    @Path("/oauth2/authorization/{registrationId}")
    public Response authorize(
            @PathParam("registrationId") String registrationId, @Context UriInfo uriInfo) {
        if (!oauth2Enabled
                || !"keycloak".equals(registrationId)
                || issuer.isEmpty()
                || clientId.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity("OAuth2 login is not enabled")
                    .build();
        }
        String redirectUri = baseUrl(uriInfo) + "/login/oauth2/code/" + registrationId;
        String authorizeUrl =
                issuer.get()
                        + "/protocol/openid-connect/auth?response_type=code"
                        + "&client_id="
                        + enc(clientId.get())
                        + "&redirect_uri="
                        + enc(redirectUri)
                        + "&scope="
                        + enc(normalizeScopes(scopes))
                        + "&state="
                        + UUID.randomUUID();
        return Response.seeOther(URI.create(authorizeUrl)).build();
    }

    private String baseUrl(UriInfo uriInfo) {
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        if (backendUrl != null && !backendUrl.isBlank()) {
            return backendUrl.replaceAll("/+$", "");
        }
        return uriInfo.getBaseUri().toString().replaceAll("/+$", "");
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    // Accept comma-, space-, or comma+space-separated scope lists - "openid,profile,email" or the
    // human-friendly "openid, profile, email" the settings.yml template ships - and emit a single
    // space-delimited OAuth scope parameter. A naive replace(',', ' ') on the comma+space form
    // produces double spaces, which the IdP parses as empty scope tokens and rejects with
    // invalid_scope.
    private static String normalizeScopes(String scopes) {
        return java.util.Arrays.stream(scopes.split("[,\\s]+"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(java.util.stream.Collectors.joining(" "));
    }
}
