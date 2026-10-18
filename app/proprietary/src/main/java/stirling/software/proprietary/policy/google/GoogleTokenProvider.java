package stirling.software.proprietary.policy.google;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.connectedaccount.OAuthHttp;
import stirling.software.proprietary.policy.remote.ExpiringTokenCache;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
@RequiredArgsConstructor
public class GoogleTokenProvider {

    static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final GoogleEndpoints endpoints;
    private final ConnectedAccountService connectedAccounts;
    private final ExpiringTokenCache cache = new ExpiringTokenCache(Duration.ofMinutes(5));

    public String token(GoogleDriveConfig config) throws IOException {
        return switch (config.credential()) {
            case GoogleDriveConfig.AccountCredential account ->
                    connectedAccounts.accessToken(account.accountId(), List.of());
            case GoogleDriveConfig.ServiceAccountCredential service -> serviceToken(service);
        };
    }

    private String serviceToken(GoogleDriveConfig.ServiceAccountCredential service)
            throws IOException {
        String key =
                service.clientEmail()
                        + "|"
                        + service.subject()
                        + "|"
                        + Integer.toHexString(service.privateKeyPem().hashCode());
        return cache.get(
                key,
                () -> {
                    Map<String, String> form = new LinkedHashMap<>();
                    form.put("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
                    form.put("assertion", assertion(service));
                    JsonNode body = OAuthHttp.postTokenRequest(endpoints.tokenUrl(), form);
                    return new ExpiringTokenCache.Token(
                            OAuthHttp.text(body, "access_token"),
                            body.hasNonNull("expires_in") ? body.get("expires_in").asLong() : 3599);
                });
    }

    String assertion(GoogleDriveConfig.ServiceAccountCredential service) throws IOException {
        long now = Instant.now().getEpochSecond();
        ObjectNode header = JSON.createObjectNode();
        header.put("alg", "RS256");
        header.put("typ", "JWT");
        ObjectNode claims = JSON.createObjectNode();
        claims.put("iss", service.clientEmail());
        claims.put("scope", DRIVE_SCOPE);
        claims.put("aud", endpoints.tokenUrl());
        claims.put("iat", now);
        claims.put("exp", now + 3600);
        if (service.subject() != null) {
            claims.put("sub", service.subject());
        }
        String signingInput = base64(header.toString()) + "." + base64(claims.toString());
        try {
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(privateKey(service.privateKeyPem()));
            signer.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            return signingInput
                    + "."
                    + Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IOException("the service account's private key could not be used", e);
        }
    }

    private static PrivateKey privateKey(String pem) throws GeneralSecurityException {
        String body =
                pem.replace("-----BEGIN PRIVATE KEY-----", "")
                        .replace("-----END PRIVATE KEY-----", "")
                        .replaceAll("\\s", "");
        return KeyFactory.getInstance("RSA")
                .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
    }

    private static String base64(String json) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}
