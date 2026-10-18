package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.microsoft.GraphEndpoints;

import tools.jackson.databind.JsonNode;

/**
 * Connects a Microsoft work, school or personal account through the server's Entra app (a web
 * platform redirect URI and a client secret). The grant covers the user's own files only: delegated
 * {@code Files.ReadWrite.All}, which reaches their OneDrive and every SharePoint library they can
 * open, with no tenant-wide admin consent beyond what the tenant's own policy requires.
 */
@Component
@RequiredArgsConstructor
public class MicrosoftOAuthClient implements CloudOAuthClient {

    static final String DEFAULT_SCOPES = "offline_access User.Read Files.ReadWrite.All";

    /** What a token handed to the browser may do: read files, never write them. */
    public static final String BROWSER_SCOPE = "Files.Read.All";

    // Consented up front so the read-only browser scope can later be minted without a prompt.
    private static final String SIGN_IN_SCOPES =
            "openid profile email " + DEFAULT_SCOPES + " " + BROWSER_SCOPE;

    private final ApplicationProperties applicationProperties;
    private final GraphEndpoints endpoints;

    @Override
    public CloudProvider provider() {
        return CloudProvider.MICROSOFT;
    }

    @Override
    public boolean available() {
        ApplicationProperties.Premium.ProFeatures.Microsoft app = app();
        return app.isEnabled()
                && app.isAllowAccountConnections()
                && !app.getClientId().isBlank()
                && !app.getClientSecret().isBlank();
    }

    @Override
    public String authorizationUrl(String state, String codeChallenge, String redirectUri) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("client_id", app().getClientId());
        query.put("response_type", "code");
        query.put("response_mode", "query");
        query.put("redirect_uri", redirectUri);
        query.put("scope", SIGN_IN_SCOPES);
        query.put("state", state);
        query.put("code_challenge", codeChallenge);
        query.put("code_challenge_method", "S256");
        query.put("prompt", "select_account");
        return endpoints.authorizeUrl(tenant()) + "?" + OAuthHttp.form(query);
    }

    @Override
    public OAuthTokens exchangeCode(String code, String codeVerifier, String redirectUri)
            throws IOException {
        Map<String, String> form = credentials();
        form.put("grant_type", "authorization_code");
        form.put("code", code);
        form.put("code_verifier", codeVerifier);
        form.put("redirect_uri", redirectUri);
        form.put("scope", SIGN_IN_SCOPES);
        JsonNode body = OAuthHttp.postTokenRequest(endpoints.tokenUrl(tenant()), form);
        JsonNode claims = OAuthHttp.idTokenClaims(OAuthHttp.text(body, "id_token"));
        String objectId = OAuthHttp.text(claims, "oid");
        if (objectId == null) {
            objectId = OAuthHttp.text(claims, "sub");
        }
        if (objectId == null) {
            throw new IOException("Microsoft returned no account identity");
        }
        String email = OAuthHttp.text(claims, "preferred_username");
        if (email == null) {
            email = OAuthHttp.text(claims, "email");
        }
        return OAuthHttp.tokens(
                body,
                new OAuthTokens.AccountIdentity(
                        objectId,
                        OAuthHttp.text(claims, "tid"),
                        email,
                        OAuthHttp.text(claims, "name")));
    }

    @Override
    public OAuthTokens refresh(String refreshToken, List<String> scopes) throws IOException {
        Map<String, String> form = credentials();
        form.put("grant_type", "refresh_token");
        form.put("refresh_token", refreshToken);
        form.put(
                "scope",
                scopes == null || scopes.isEmpty()
                        ? DEFAULT_SCOPES
                        : "offline_access " + String.join(" ", scopes));
        return OAuthHttp.tokens(
                OAuthHttp.postTokenRequest(endpoints.tokenUrl(tenant()), form), null);
    }

    /** Entra has no endpoint to revoke one delegated grant; disconnecting forgets it locally. */
    @Override
    public void revoke(String refreshToken) {}

    private Map<String, String> credentials() {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("client_id", app().getClientId());
        form.put("client_secret", app().getClientSecret());
        return form;
    }

    private String tenant() {
        String tenant = app().getTenant();
        return tenant == null || tenant.isBlank() ? "common" : tenant.trim();
    }

    private ApplicationProperties.Premium.ProFeatures.Microsoft app() {
        return applicationProperties.getPremium().getProFeatures().getMicrosoft();
    }
}
