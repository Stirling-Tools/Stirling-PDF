package stirling.software.proprietary.security.service;

import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class JWTService implements JWTServiceInterface {

    private final String secretKey;
    private final long jwtExpiration;

    public JWTService(
            @Value("${security.jwt.secretKey}") String secretKey,
            @Value("${security.jwt.expiration}") long jwtExpiration) {
        if (secretKey == null || secretKey.isEmpty()) {
            throw new IllegalStateException(
                    "JWT secret must be configured via security.jwt.secretKey property");
        }

        byte[] decodedKey = Base64.getDecoder().decode(secretKey);
        if (decodedKey.length < 32) {
            throw new IllegalStateException("JWT secret must be at least 256 bits");
        }

        this.secretKey = secretKey;
        this.jwtExpiration = jwtExpiration;
    }

    @Override
    public String generateToken(UserDetails userDetails) {
        return generateToken(new HashMap<>(), userDetails);
    }

    @Override
    public boolean isTokenValid(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return username.equals(userDetails.getUsername()) && !isTokenExpired(token);
    }

    @Override
    public String extractUsername(String jwt) {
        return extractClaim(jwt, Claims::getSubject);
    }

    private String generateToken(Map<String, Object> extraClaims, UserDetails userDetails) {
        String jwt =
                Jwts.builder()
                        .signWith(getSignInKey())
                        .claims(extraClaims)
                        .subject(userDetails.getUsername())
                        .issuedAt(new Date(System.currentTimeMillis()))
                        .expiration(new Date(System.currentTimeMillis() + jwtExpiration))
                        .compact();
        log.info("JWT: {}", jwt);
        return jwt;
    }

    private boolean isTokenExpired(String token) {
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
        return Jwts.parser()
                .verifyWith(getSignInKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSignInKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
