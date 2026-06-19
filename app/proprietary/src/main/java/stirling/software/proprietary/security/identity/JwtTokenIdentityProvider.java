package stirling.software.proprietary.security.identity;

import java.util.Map;

import io.quarkus.security.AuthenticationFailedException;
import io.quarkus.security.identity.AuthenticationRequestContext;
import io.quarkus.security.identity.IdentityProvider;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.TokenAuthenticationRequest;
import io.quarkus.security.runtime.QuarkusPrincipal;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.smallrye.mutiny.Uni;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.service.JwtServiceInterface;

/**
 * Validates a Bearer {@link TokenAuthenticationRequest} with the application's {@link
 * JwtServiceInterface} (jjwt + keystore) and produces a Quarkus {@link SecurityIdentity}. This
 * replaces the Spring Security JWT filter that previously populated the SecurityContext; the {@code
 * role} claim (e.g. {@code ROLE_ADMIN}) is mapped to Quarkus roles, with the {@code ROLE_} prefix
 * also stripped so {@code @RolesAllowed("ADMIN")} matches.
 */
@Slf4j
@ApplicationScoped
public class JwtTokenIdentityProvider implements IdentityProvider<TokenAuthenticationRequest> {

    private static final String ROLE_PREFIX = "ROLE_";

    @Inject JwtServiceInterface jwtService;

    @Override
    public Class<TokenAuthenticationRequest> getRequestType() {
        return TokenAuthenticationRequest.class;
    }

    @Override
    public Uni<SecurityIdentity> authenticate(
            TokenAuthenticationRequest request, AuthenticationRequestContext context) {
        String token = request.getToken().getToken();
        // Token validation reads the keystore and parses claims (blocking work), so run it off the
        // IO thread.
        return context.runBlocking(() -> buildIdentity(token));
    }

    private SecurityIdentity buildIdentity(String token) {
        try {
            jwtService.validateToken(token);
            String username = jwtService.extractUsername(token);
            if (username == null || username.isBlank()) {
                throw new AuthenticationFailedException("JWT has no subject");
            }

            QuarkusSecurityIdentity.Builder builder =
                    QuarkusSecurityIdentity.builder().setPrincipal(new QuarkusPrincipal(username));

            Map<String, Object> claims = jwtService.extractClaims(token);
            Object role = claims == null ? null : claims.get("role");
            if (role != null) {
                for (String raw : role.toString().split(",")) {
                    String r = raw.trim();
                    if (r.isEmpty()) {
                        continue;
                    }
                    builder.addRole(r);
                    if (r.startsWith(ROLE_PREFIX)) {
                        builder.addRole(r.substring(ROLE_PREFIX.length()));
                    }
                }
            }
            if (claims != null) {
                builder.addAttribute("claims", claims);
            }
            return builder.build();
        } catch (AuthenticationFailedException e) {
            throw e;
        } catch (Exception e) {
            log.debug("JWT authentication failed: {}", e.getMessage());
            throw new AuthenticationFailedException(e);
        }
    }
}
