package stirling.software.proprietary.security.identity;

import java.util.Collections;
import java.util.Set;

import io.quarkus.security.credential.TokenCredential;
import io.quarkus.security.identity.IdentityProviderManager;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.AuthenticationRequest;
import io.quarkus.security.identity.request.TokenAuthenticationRequest;
import io.quarkus.vertx.http.runtime.security.ChallengeData;
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism;
import io.smallrye.mutiny.Uni;
import io.vertx.ext.web.RoutingContext;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Quarkus HTTP authentication mechanism for {@code Authorization: Bearer <jwt>} credentials. It
 * delegates token validation to {@link JwtTokenIdentityProvider}. When no Bearer token is present
 * it yields no identity (anonymous), so unauthenticated/open paths (e.g. endpoints when login is
 * disabled, or X-API-KEY auth) are not disturbed.
 */
@ApplicationScoped
public class JwtBearerAuthenticationMechanism implements HttpAuthenticationMechanism {

    private static final String BEARER_PREFIX = "Bearer ";

    @Override
    public Uni<SecurityIdentity> authenticate(
            RoutingContext context, IdentityProviderManager identityProviderManager) {
        String token = bearerToken(context);
        if (token == null) {
            return Uni.createFrom().nullItem();
        }
        return identityProviderManager.authenticate(
                new TokenAuthenticationRequest(new TokenCredential(token, "bearer")));
    }

    @Override
    public Uni<ChallengeData> getChallenge(RoutingContext context) {
        return Uni.createFrom().item(new ChallengeData(401, "WWW-Authenticate", "Bearer"));
    }

    @Override
    public Set<Class<? extends AuthenticationRequest>> getCredentialTypes() {
        return Collections.singleton(TokenAuthenticationRequest.class);
    }

    private static String bearerToken(RoutingContext context) {
        String authz = context.request().getHeader("Authorization");
        if (authz != null
                && authz.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            String token = authz.substring(BEARER_PREFIX.length()).trim();
            if (!token.isEmpty()) {
                return token;
            }
        }
        // Browser SSO (OAuth2/SAML) stores the issued app JWT in this cookie rather than an
        // Authorization header.
        io.vertx.core.http.Cookie cookie = context.request().getCookie("stirling_jwt");
        if (cookie != null && cookie.getValue() != null && !cookie.getValue().isBlank()) {
            return cookie.getValue().trim();
        }
        return null;
    }
}
