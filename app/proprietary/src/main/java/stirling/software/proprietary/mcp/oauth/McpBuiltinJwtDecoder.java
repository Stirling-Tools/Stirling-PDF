package stirling.software.proprietary.mcp.oauth;

import java.security.interfaces.RSAPublicKey;
import java.text.ParseException;
import java.util.List;
import java.util.Optional;

import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import stirling.software.proprietary.security.service.JwtService;

/** Verifies builtin MCP tokens against the app's own keys, resolving the kid locally. */
public class McpBuiltinJwtDecoder implements JwtDecoder {

    private final McpTokenMinter tokenMinter;

    public McpBuiltinJwtDecoder(McpTokenMinter tokenMinter) {
        this.tokenMinter = tokenMinter;
    }

    @Override
    public Jwt decode(String token) throws JwtException {
        SignedJWT signed;
        try {
            signed = SignedJWT.parse(token);
        } catch (ParseException e) {
            throw new BadJwtException("Malformed MCP token", e);
        }
        if (!JWSAlgorithm.RS256.equals(signed.getHeader().getAlgorithm())) {
            throw new BadJwtException("MCP tokens must be signed with RS256");
        }
        String keyId = signed.getHeader().getKeyID();
        if (keyId == null || keyId.isBlank()) {
            throw new BadJwtException("MCP token is missing a key id");
        }
        Optional<RSAPublicKey> publicKey = tokenMinter.publicKey(keyId);
        if (publicKey.isEmpty()) {
            throw new BadJwtException("MCP token was signed with an unknown key");
        }
        try {
            if (!signed.verify(new RSASSAVerifier(publicKey.get()))) {
                throw new BadJwtException("MCP token signature is invalid");
            }
            JWTClaimsSet claims = signed.getJWTClaimsSet();
            if (claims.getExpirationTime() == null || claims.getIssueTime() == null) {
                throw new BadJwtException("MCP token is missing iat/exp");
            }
            // App session tokens share the keys; only tokens minted for MCP are accepted here.
            if (!JwtService.MCP_ACCESS_TOKEN_USE.equals(
                    claims.getClaim(JwtService.TOKEN_USE_CLAIM))) {
                throw new BadJwtException("Not an MCP access token");
            }
            return Jwt.withTokenValue(token)
                    .headers(h -> h.putAll(signed.getHeader().toJSONObject()))
                    .claims(c -> c.putAll(claims.toJSONObject()))
                    .issuedAt(claims.getIssueTime().toInstant())
                    .expiresAt(claims.getExpirationTime().toInstant())
                    .subject(claims.getSubject())
                    .audience(
                            claims.getAudience() == null
                                    ? List.of()
                                    : List.copyOf(claims.getAudience()))
                    .build();
        } catch (BadJwtException e) {
            throw e;
        } catch (Exception e) {
            throw new BadJwtException("Failed to verify MCP token", e);
        }
    }
}
