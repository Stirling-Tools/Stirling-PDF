package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.google.GoogleEndpoints;

import tools.jackson.databind.JsonNode;

@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuthClient implements CloudOAuthClient {

    private static final Set<String> DRIVE_SCOPES = Set.of("drive", "drive.file", "drive.readonly");
    private static final HttpClient HTTP =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private final ApplicationProperties applicationProperties;
    private final GoogleEndpoints endpoints;

    @Override
    public CloudProvider provider() {
        return CloudProvider.GOOGLE;
    }

    @Override
    public boolean available() {
        return app().accountConnectionsReady();
    }

    @Override
    public String authorizationUrl(String state, String codeChallenge, String redirectUri) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("client_id", app().getClientId());
        query.put("response_type", "code");
        query.put("redirect_uri", redirectUri);
        query.put("scope", "openid email profile " + driveScope());
        query.put("access_type", "offline");
        query.put("prompt", "consent");
        query.put("include_granted_scopes", "true");
        query.put("state", state);
        query.put("code_challenge", codeChallenge);
        query.put("code_challenge_method", "S256");
        return endpoints.authorizeUrl() + "?" + OAuthHttp.form(query);
    }

    @Override
    public OAuthTokens exchangeCode(String code, String codeVerifier, String redirectUri)
            throws IOException {
        JsonNode body =
                OAuthHttp.postTokenRequest(
                        endpoints.tokenUrl(),
                        OAuthHttp.authorizationCodeGrant(
                                app().getClientId(),
                                app().getClientSecret(),
                                code,
                                codeVerifier,
                                redirectUri));
        JsonNode claims = OAuthHttp.idTokenClaims(OAuthHttp.text(body, "id_token"));
        String subject = OAuthHttp.text(claims, "sub");
        if (subject == null) {
            throw new IOException("Google returned no account identity");
        }
        return OAuthHttp.tokens(
                body,
                new OAuthTokens.AccountIdentity(
                        subject,
                        null,
                        OAuthHttp.text(claims, "email"),
                        OAuthHttp.text(claims, "name")));
    }

    @Override
    public OAuthTokens refresh(String refreshToken, List<String> scopes) throws IOException {
        return OAuthHttp.tokens(
                OAuthHttp.postTokenRequest(
                        endpoints.tokenUrl(),
                        OAuthHttp.refreshGrant(
                                app().getClientId(), app().getClientSecret(), refreshToken)),
                null);
    }

    @Override
    public void revoke(String refreshToken) {
        try {
            HTTP.send(
                    HttpRequest.newBuilder(URI.create(endpoints.revokeUrl()))
                            .timeout(Duration.ofSeconds(10))
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            OAuthHttp.form(Map.of("token", refreshToken))))
                            .build(),
                    HttpResponse.BodyHandlers.discarding());
        } catch (IOException e) {
            log.debug("Google token revocation failed: {}", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    String driveScope() {
        String configured = app().getAccountScope();
        String scope =
                configured == null || !DRIVE_SCOPES.contains(configured.trim())
                        ? "drive"
                        : configured.trim();
        return "https://www.googleapis.com/auth/" + scope;
    }

    private ApplicationProperties.Premium.ProFeatures.GoogleDrive app() {
        return applicationProperties.getPremium().getProFeatures().getGoogleDrive();
    }
}
