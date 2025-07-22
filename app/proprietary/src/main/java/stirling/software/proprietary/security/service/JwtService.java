package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
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

import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;

@Slf4j
@Service
public class JwtService implements JwtServiceInterface {

    private static final String JWT_COOKIE_NAME = "stirling_jwt";
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String ISSUER = "Stirling PDF";
    private static final long EXPIRATION = 3600000;

    private final JwtKeystoreServiceInterface keystoreService;
    private final boolean v2Enabled;

    @Autowired
    public JwtService(
            @Qualifier("v2Enabled") boolean v2Enabled,
            JwtKeystoreServiceInterface keystoreService) {
        this.v2Enabled = v2Enabled;
        this.keystoreService = keystoreService;
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
        KeyPair keyPair = keystoreService.getActiveKeypair();

        var builder =
                Jwts.builder()
                        .claims(claims)
                        .subject(username)
                        .issuer(ISSUER)
                        .issuedAt(new Date())
                        .expiration(new Date(System.currentTimeMillis() + EXPIRATION))
                        .signWith(keyPair.getPrivate(), Jwts.SIG.RS256);

        String keyId = keystoreService.getActiveKeyId();
        if (keyId != null) {
            builder.header().keyId(keyId);
        }

        return builder.compact();
    }

    @Override
    public void validateToken(String token) throws AuthenticationFailureException {
        extractAllClaimsFromToken(token);

        if (isTokenExpired(token)) {
            throw new AuthenticationFailureException("The token has expired");
        }
    }

    @Override
    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    @Override
    public Map<String, Object> extractAllClaims(String token) {
        Claims claims = extractAllClaimsFromToken(token);
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
        final Claims claims = extractAllClaimsFromToken(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaimsFromToken(String token) {
        try {
            // Extract key ID from token header if present
            String keyId = extractKeyIdFromToken(token);
            KeyPair keyPair;

            if (keyId != null) {
                Optional<KeyPair> specificKeyPair = keystoreService.getKeypairByKeyId(keyId);
                if (specificKeyPair.isPresent()) {
                    keyPair = specificKeyPair.get();
                } else {
                    log.warn(
                            "Key ID {} not found in keystore, token may have been signed with a rotated key",
                            keyId);
                    throw new AuthenticationFailureException(
                            "JWT token signed with unknown key ID: " + keyId);
                }
            } else {
                keyPair = keystoreService.getActiveKeypair();
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

    @Override
    public String extractTokenFromRequest(HttpServletRequest request) {
        String authHeader = request.getHeader(AUTHORIZATION_HEADER);

        if (authHeader != null && authHeader.startsWith(BEARER_PREFIX)) {
            return authHeader.substring(BEARER_PREFIX.length());
        }

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
    public void addTokenToResponse(HttpServletResponse response, String token) {
        response.setHeader(AUTHORIZATION_HEADER, Newlines.stripAll(BEARER_PREFIX + token));

        ResponseCookie cookie =
                ResponseCookie.from(JWT_COOKIE_NAME, Newlines.stripAll(token))
                        .httpOnly(true)
                        .secure(true)
                        .sameSite("None")
                        .maxAge(EXPIRATION / 1000)
                        .path("/")
                        .build();

        response.addHeader("Set-Cookie", cookie.toString());
    }

    @Override
    public void clearTokenFromResponse(HttpServletResponse response) {
        response.setHeader(AUTHORIZATION_HEADER, null);

        ResponseCookie cookie =
                ResponseCookie.from(JWT_COOKIE_NAME, "")
                        .httpOnly(true)
                        .secure(true)
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

    private String extractKeyIdFromToken(String token) {
        try {
            return (String)
                    Jwts.parser()
                            .unsecured()
                            .build()
                            .parseUnsecuredClaims(token)
                            .getHeader()
                            .get("kid");
        } catch (Exception e) {
            log.debug("Failed to extract key ID from token header: {}", e.getMessage());
            return null;
        }
    }
}
