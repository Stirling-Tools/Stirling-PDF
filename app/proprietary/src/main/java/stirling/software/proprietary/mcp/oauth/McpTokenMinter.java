package stirling.software.proprietary.mcp.oauth;

import java.security.KeyPair;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;

import io.jsonwebtoken.Jwts;

import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.service.JwtService;
import stirling.software.proprietary.security.service.KeyPersistenceServiceInterface;

/** Signs MCP access tokens with the app's rotating RSA keys, so builtin mode needs no keys. */
@Component
@Conditional(McpBuiltinModeCondition.class)
public class McpTokenMinter {

    public static final String GRANT_ID_CLAIM = "grant_id";

    private final KeyPersistenceServiceInterface keyPersistenceService;

    public McpTokenMinter(KeyPersistenceServiceInterface keyPersistenceService) {
        this.keyPersistenceService = keyPersistenceService;
    }

    public String mintAccessToken(
            String issuer,
            String username,
            String audience,
            String scope,
            String clientId,
            long grantId,
            int lifetimeMinutes) {
        JwtVerificationKey activeKey = keyPersistenceService.getActiveKey();
        if (activeKey == null) {
            throw new IllegalStateException("No active signing key available for MCP tokens");
        }
        KeyPair keyPair =
                keyPersistenceService
                        .getKeyPair(activeKey.getKeyId())
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "Signing keypair unavailable; MCP builtin mode"
                                                        + " requires the JWT keystore"));

        Instant now = Instant.now();
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("scope", scope == null ? "" : scope);
        claims.put("client_id", clientId);
        claims.put(GRANT_ID_CLAIM, grantId);
        // Marks the token so the app's session filter refuses it.
        claims.put(JwtService.TOKEN_USE_CLAIM, JwtService.MCP_ACCESS_TOKEN_USE);

        var builder =
                Jwts.builder()
                        .claims(claims)
                        .subject(username)
                        .issuer(issuer)
                        .audience()
                        .add(audience)
                        .and()
                        .issuedAt(Date.from(now))
                        .expiration(Date.from(now.plusSeconds(lifetimeMinutes * 60L)))
                        .signWith(keyPair.getPrivate(), Jwts.SIG.RS256);
        builder.header().keyId(activeKey.getKeyId());
        return builder.compact();
    }

    /**
     * JWKS with the active key; verifiers refetch on an unknown kid, so rotation stays seamless.
     */
    public JWKSet publicJwks() {
        JwtVerificationKey activeKey = keyPersistenceService.getActiveKey();
        if (activeKey == null) {
            return new JWKSet(List.of());
        }
        Optional<RSAPublicKey> rsa = publicKey(activeKey.getKeyId());
        if (rsa.isEmpty()) {
            return new JWKSet(List.of());
        }
        JWK jwk =
                new RSAKey.Builder(rsa.get())
                        .keyID(activeKey.getKeyId())
                        .keyUse(KeyUse.SIGNATURE)
                        .algorithm(JWSAlgorithm.RS256)
                        .build();
        return new JWKSet(List.of(jwk));
    }

    /** Public key for a kid, for local verification without an HTTP round-trip to ourselves. */
    public Optional<RSAPublicKey> publicKey(String keyId) {
        return keyPersistenceService
                .getKeyPair(keyId)
                .map(KeyPair::getPublic)
                .filter(RSAPublicKey.class::isInstance)
                .map(RSAPublicKey.class::cast);
    }
}
