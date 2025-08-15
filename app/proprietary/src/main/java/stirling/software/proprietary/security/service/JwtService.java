package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.spec.InvalidKeySpecException;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import io.github.pixee.security.Newlines;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.SignatureException;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;

@Slf4j
@Service
public class JwtService implements JwtServiceInterface {

    private static final String JWT_COOKIE_NAME = "stirling_jwt";
    private static final String ISSUER = "Stirling PDF";
    private static final long EXPIRATION = 3600000;

    @Value("${stirling.security.jwt.secureCookie:true}")
    private boolean secureCookie;

    private final KeyPersistenceServiceInterface keyPersistenceService;
    private final boolean v2Enabled;

    public JwtService(
            @Qualifier("v2Enabled") boolean v2Enabled,
            KeyPersistenceServiceInterface keyPersistenceService) {
        this.v2Enabled = v2Enabled;
        this.keyPersistenceService = keyPersistenceService;
    }

    @Override
    public String generateToken(Authentication authentication, Map<String, Object> claims) {
        Object principal = authentication.getPrincipal();
        String username = "";

        if (principal instanceof UserDetails) {
            username = ((UserDetails) principal).getUsername();
        } else if (principal instanceof OAuth2User) {
            username = ((OAuth2User) principal).getName();
        } else if (principal instanceof CustomSaml2AuthenticatedPrincipal) {
            username = ((CustomSaml2AuthenticatedPrincipal) principal).getName();
        }

        return generateToken(username, claims);
    }

    @Override
    public String generateToken(String username, Map<String, Object> claims) {
        try {
            JwtVerificationKey activeKey = keyPersistenceService.getActiveKey();
            Optional<KeyPair> keyPairOpt = keyPersistenceService.getKeyPair(activeKey.getKeyId());

            if (keyPairOpt.isEmpty()) {
                throw new RuntimeException("Unable to retrieve key pair for active key");
            }

            KeyPair keyPair = keyPairOpt.get();

            var builder =
                    Jwts.builder()
                            .claims(claims)
                            .subject(username)
                            .issuer(ISSUER)
                            .issuedAt(new Date())
                            .expiration(new Date(System.currentTimeMillis() + EXPIRATION))
                            .signWith(keyPair.getPrivate(), Jwts.SIG.RS256);

            String keyId = activeKey.getKeyId();
            if (keyId != null) {
                builder.header().keyId(keyId);
            }

            return builder.compact();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate token", e);
        }
    }

    @Override
    public void validateToken(String token) throws AuthenticationFailureException {
        extractAllClaims(token);

        if (isTokenExpired(token)) {
            throw new AuthenticationFailureException("The token has expired");
        }
    }

    @Override
    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    @Override
    public Map<String, Object> extractClaims(String token) {
        Claims claims = extractAllClaims(token);
        return new HashMap<>(claims);
    }

    @Override
    public boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    private Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        try {
            String keyId = extractKeyId(token);
            KeyPair keyPair;

            if (keyId != null) {
                Optional<KeyPair> specificKeyPair = keyPersistenceService.getKeyPair(keyId);

                if (specificKeyPair.isPresent()) {
                    keyPair = specificKeyPair.get();
                } else {
                    log.warn(
                            "Key ID {} not found in keystore, token may have been signed with an"
                                    + " expired key",
                            keyId);

                    if (keyId.equals(keyPersistenceService.getActiveKey().getKeyId())) {
                        JwtVerificationKey verificationKey =
                                keyPersistenceService.refreshActiveKeyPair();
                        Optional<KeyPair> refreshedKeyPair =
                                keyPersistenceService.getKeyPair(verificationKey.getKeyId());
                        if (refreshedKeyPair.isPresent()) {
                            keyPair = refreshedKeyPair.get();
                        } else {
                            throw new AuthenticationFailureException(
                                    "Failed to retrieve refreshed key pair");
                        }
                    } else {
                        // Try to use active key as fallback
                        JwtVerificationKey activeKey = keyPersistenceService.getActiveKey();
                        Optional<KeyPair> activeKeyPair =
                                keyPersistenceService.getKeyPair(activeKey.getKeyId());
                        if (activeKeyPair.isPresent()) {
                            keyPair = activeKeyPair.get();
                        } else {
                            throw new AuthenticationFailureException(
                                    "Failed to retrieve active key pair");
                        }
                    }
                }
            } else {
                log.debug("No key ID in token header, trying all available keys");
                // Try all available keys when no keyId is present
                return tryAllKeys(token);
            }

            return Jwts.parser()
                    .verifyWith(keyPair.getPublic())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (SignatureException e) {
            log.warn("Invalid signature: {}", e.getMessage());
            throw new AuthenticationFailureException("Invalid signature", e);
        } catch (MalformedJwtException e) {
            log.warn("Invalid token: {}", e.getMessage());
            throw new AuthenticationFailureException("Invalid token", e);
        } catch (ExpiredJwtException e) {
            log.warn("The token has expired: {}", e.getMessage());
            throw new AuthenticationFailureException("The token has expired", e);
        } catch (UnsupportedJwtException e) {
            log.warn("The token is unsupported: {}", e.getMessage());
            throw new AuthenticationFailureException("The token is unsupported", e);
        } catch (IllegalArgumentException e) {
            log.warn("Claims are empty: {}", e.getMessage());
            throw new AuthenticationFailureException("Claims are empty", e);
        }
    }

    private Claims tryAllKeys(String token) throws AuthenticationFailureException {
        // First try the active key
        try {
            JwtVerificationKey activeKey = keyPersistenceService.getActiveKey();
            PublicKey publicKey =
                    keyPersistenceService.decodePublicKey(activeKey.getVerifyingKey());
            return Jwts.parser()
                    .verifyWith(publicKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (SignatureException
                | NoSuchAlgorithmException
                | InvalidKeySpecException activeKeyException) {
            log.debug("Active key failed, trying all available keys from cache");

            // If active key fails, try all available keys from cache
            List<JwtVerificationKey> allKeys =
                    keyPersistenceService.getKeysEligibleForCleanup(
                            LocalDateTime.now().plusDays(1));

            for (JwtVerificationKey verificationKey : allKeys) {
                try {
                    PublicKey publicKey =
                            keyPersistenceService.decodePublicKey(
                                    verificationKey.getVerifyingKey());
                    return Jwts.parser()
                            .verifyWith(publicKey)
                            .build()
                            .parseSignedClaims(token)
                            .getPayload();
                } catch (SignatureException
                        | NoSuchAlgorithmException
                        | InvalidKeySpecException e) {
                    log.debug(
                            "Key {} failed to verify token, trying next key",
                            verificationKey.getKeyId());
                    // Continue to next key
                }
            }

            throw new AuthenticationFailureException(
                    "Token signature could not be verified with any available key",
                    activeKeyException);
        }
    }

    @Override
    public String extractToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();

        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (JWT_COOKIE_NAME.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }

        return null;
    }

    @Override
    public void addToken(HttpServletResponse response, String token) {
        ResponseCookie cookie =
                ResponseCookie.from(JWT_COOKIE_NAME, Newlines.stripAll(token))
                        .httpOnly(true)
                        .secure(secureCookie)
                        .sameSite("Strict")
                        .maxAge(EXPIRATION / 1000)
                        .path("/")
                        .build();

        response.addHeader("Set-Cookie", cookie.toString());
    }

    @Override
    public void clearToken(HttpServletResponse response) {
        ResponseCookie cookie =
                ResponseCookie.from(JWT_COOKIE_NAME, "")
                        .httpOnly(true)
                        .secure(secureCookie)
                        .sameSite("None")
                        .maxAge(0)
                        .path("/")
                        .build();

        response.addHeader("Set-Cookie", cookie.toString());
    }

    @Override
    public boolean isJwtEnabled() {
        return v2Enabled;
    }

    private String extractKeyId(String token) {
        try {
            PublicKey signingKey =
                    keyPersistenceService.decodePublicKey(
                            keyPersistenceService.getActiveKey().getVerifyingKey());

            String keyId =
                    (String)
                            Jwts.parser()
                                    .verifyWith(signingKey)
                                    .build()
                                    .parse(token)
                                    .getHeader()
                                    .get("kid");
            log.debug("Extracted key ID from token: {}", keyId);
            return keyId;
        } catch (Exception e) {
            log.warn("Failed to extract key ID from token header: {}", e.getMessage());
            return null;
        }
    }
}
