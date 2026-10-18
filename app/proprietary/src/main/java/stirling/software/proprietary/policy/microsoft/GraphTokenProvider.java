package stirling.software.proprietary.policy.microsoft;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.connectedaccount.OAuthHttp;
import stirling.software.proprietary.policy.remote.ExpiringTokenCache;

import tools.jackson.databind.JsonNode;

@Component
@RequiredArgsConstructor
public class GraphTokenProvider {

    private final GraphEndpoints endpoints;
    private final ConnectedAccountService connectedAccounts;
    private final ExpiringTokenCache cache = new ExpiringTokenCache(Duration.ofMinutes(5));

    public String token(MicrosoftDriveConfig config) throws IOException {
        return switch (config.credential()) {
            case MicrosoftDriveConfig.AccountCredential account ->
                    connectedAccounts.accessToken(account.accountId(), List.of());
            case MicrosoftDriveConfig.AppCredential app -> appToken(app);
        };
    }

    private String appToken(MicrosoftDriveConfig.AppCredential app) throws IOException {
        String key = app.tenantId() + "\n" + app.clientId() + "\n" + sha256(app.clientSecret());
        return cache.get(
                key,
                () -> {
                    Map<String, String> form = new LinkedHashMap<>();
                    form.put("grant_type", "client_credentials");
                    form.put("client_id", app.clientId());
                    form.put("client_secret", app.clientSecret());
                    form.put("scope", endpoints.graphScope());
                    JsonNode body =
                            OAuthHttp.postTokenRequest(endpoints.tokenUrl(app.tenantId()), form);
                    return new ExpiringTokenCache.Token(
                            OAuthHttp.text(body, "access_token"),
                            body.hasNonNull("expires_in") ? body.get("expires_in").asLong() : 3599);
                });
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
