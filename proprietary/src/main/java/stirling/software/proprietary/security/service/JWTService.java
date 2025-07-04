package stirling.software.proprietary.security.service;

import static org.apache.commons.lang3.StringUtils.*;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

import javax.crypto.SecretKey;

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
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.SignatureException;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Service
@ConditionalOnBooleanProperty("security.jwt.enabled")
public class JWTService implements JWTServiceInterface {

    private static final String JWT_COOKIE_NAME = "STIRLING_JWT_TOKEN";
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final ApplicationProperties.Security securityProperties;

    private SecretKey signingKey;

    public JWTService(ApplicationProperties applicationProperties) {
        this.securityProperties = applicationProperties.getSecurity();
    }

    @PostConstruct
    public void init() {
        if (isJwtEnabled()) {
            try {
                initializeSigningKey();
                log.info("JWT service initialized successfully");
            } catch (Exception e) {
                log.error(
                        "Failed to initialize JWT service. JWT authentication will be disabled.",
                        e);
                throw new RuntimeException("JWT service initialization failed", e);
            }
        } else {
            log.debug("JWT authentication is disabled");
        }
    }

    private void initializeSigningKey() {
        try {
            ApplicationProperties.Security.JWT jwtProperties = securityProperties.getJwt();
            String secretKey = jwtProperties.getSecretKey();

            if (isBlank(secretKey)) {
                log.warn(
                        "JWT secret key is not configured. Generating a temporary key for this session.");
                secretKey = generateTemporaryKey();
            }

            switch (jwtProperties.getAlgorithm()) {
                case "HS256" ->
                        this.signingKey = Keys.hmacShaKeyFor(Base64.getDecoder().decode(secretKey));
                case "RS256" -> // RSA256 algorithm requires a 2048-bit key. Should load RSA key
                        // pairs configuration
                        //                    this.signingKey =
                        // Jwts.SIG.RS256.keyPair().build().getPrivate()
                        log.info("Using RSA algorithm: RS256");
                default -> {
                    log.warn(
                            "Unsupported JWT algorithm: {}. Using default algorithm.",
                            jwtProperties.getAlgorithm());
                    this.signingKey = Keys.hmacShaKeyFor(Base64.getDecoder().decode(secretKey));
                }
            }

            log.info("JWT service initialized with algorithm: {}", jwtProperties.getAlgorithm());
        } catch (Exception e) {
            log.error("Failed to initialize JWT signing key", e);
            throw new RuntimeException("JWT service initialization failed", e);
        }
    }

    private String generateTemporaryKey() {
        try {
            // Generate a secure random key for HMAC-SHA256
            SecureRandom secureRandom = new SecureRandom();
            byte[] key = new byte[32]; // 256 bits
            secureRandom.nextBytes(key);
            return Base64.getEncoder().encodeToString(key);
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate temporary JWT key", e);
        }
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

        ApplicationProperties.Security.JWT jwtProperties = securityProperties.getJwt();

        return Jwts.builder()
                .claims(claims)
                .subject(username)
                .issuer(jwtProperties.getIssuer())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtProperties.getExpiration()))
                .signWith(signingKey)
                .compact();
    }

    @Override
    public boolean validateToken(String token) {
        if (!isJwtEnabled()) {
            return false;
        }

        try {
            Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token);
            return true;
        } catch (SignatureException e) {
            log.debug("Invalid JWT signature: {}", e.getMessage());
        } catch (MalformedJwtException e) {
            log.debug("Invalid JWT token: {}", e.getMessage());
        } catch (ExpiredJwtException e) {
            log.debug("JWT token is expired: {}", e.getMessage());
        } catch (UnsupportedJwtException e) {
            log.debug("JWT token is unsupported: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            log.debug("JWT claims string is empty: {}", e.getMessage());
        }
        return false;
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
        if (!isJwtEnabled()) {
            throw new IllegalStateException("JWT is not enabled");
        }

        return Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
    }

    @Override
    public String extractTokenFromRequest(HttpServletRequest request) {
        // First, try to get token from Authorization header
        String authHeader = request.getHeader(AUTHORIZATION_HEADER);
        if (authHeader != null && authHeader.startsWith(BEARER_PREFIX)) {
            return authHeader.substring(BEARER_PREFIX.length());
        }

        // Fallback to cookie
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
        ApplicationProperties.Security.JWT jwtProperties = securityProperties.getJwt();
        // Add to Authorization header
        response.setHeader(AUTHORIZATION_HEADER, BEARER_PREFIX + token);

        // Add as HTTP-only secure cookie
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
        ApplicationProperties.Security.JWT jwtProperties = securityProperties.getJwt();

        return securityProperties.isJwtActive()
                && jwtProperties != null
                && jwtProperties.isSettingsValid();
    }
}
