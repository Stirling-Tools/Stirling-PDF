package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;

@Slf4j
@Service
@ConditionalOnBooleanProperty("security.jwt.enabled")
public class JWTService implements JWTServiceInterface {

    private static final String JWT_COOKIE_NAME = "STIRLING_JWT";
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final ApplicationProperties.Security securityProperties;
    private final ApplicationProperties.Security.JWT jwtProperties;
    private final KeyPair keyPair;

    public JWTService(ApplicationProperties.Security securityProperties) {
        this.securityProperties = securityProperties;
        this.jwtProperties = securityProperties.getJwt();
        keyPair = Jwts.SIG.RS256.keyPair().build();
    }

    @Override
    public String generateToken(Authentication authentication) {
        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        return generateToken(userDetails.getUsername(), new HashMap<>());
    }

    @Override
    public String generateToken(String username, Map<String, Object> claims) {
        if (!isJwtEnabled()) {
            throw new IllegalStateException("JWT is not enabled");
        }

        return Jwts.builder()
                .claims(claims)
                .subject(username)
                .issuer(jwtProperties.getIssuer())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtProperties.getExpiration()))
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();
    }

    @Override
    public void validateToken(String token) {
        if (!isJwtEnabled()) {
            throw new IllegalStateException("JWT is not enabled");
        }

        try {
            extractAllClaimsFromToken(token);
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
            return Jwts.parser()
                    .verifyWith(keyPair.getPublic())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (SignatureException e) {
            log.warn("Invalid JWT signature: {}", e.getMessage());
            throw new AuthenticationFailureException("Invalid JWT signature", e);
        } catch (MalformedJwtException e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            throw new AuthenticationFailureException("Invalid JWT token", e);
        } catch (ExpiredJwtException e) {
            log.warn("JWT token is expired: {}", e.getMessage());
            throw new AuthenticationFailureException("JWT token is expired", e);
        } catch (UnsupportedJwtException e) {
            log.warn("JWT token is unsupported: {}", e.getMessage());
            throw new AuthenticationFailureException("JWT token is unsupported", e);
        } catch (IllegalArgumentException e) {
            log.warn("JWT claims are empty: {}", e.getMessage());
            throw new AuthenticationFailureException("JWT claims are empty", e);
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
        response.setHeader(AUTHORIZATION_HEADER, BEARER_PREFIX + token);

        ResponseCookie cookie =
                ResponseCookie.from(JWT_COOKIE_NAME, token)
                        .httpOnly(true)
                        .secure(true) // Only send over HTTPS in production
                        .sameSite("Strict")
                        .maxAge(jwtProperties.getExpiration() / 1000) // Convert to seconds
                        .path("/")
                        .build();

        response.addHeader("Set-Cookie", cookie.toString());
    }

    @Override
    public void clearTokenFromResponse(HttpServletResponse response) {
        response.setHeader(AUTHORIZATION_HEADER, "");

        ResponseCookie cookie =
                ResponseCookie.from(JWT_COOKIE_NAME, "")
                        .httpOnly(true)
                        .secure(true)
                        .sameSite("Strict")
                        .maxAge(0)
                        .path("/")
                        .build();

        response.addHeader("Set-Cookie", cookie.toString());
    }

    @Override
    public boolean isJwtEnabled() {
        return securityProperties.isJwtActive()
                && jwtProperties != null
                && jwtProperties.isSettingsValid();
    }
}
