package stirling.software.proprietary.security.identity;

import java.util.Collections;
import java.util.Set;

import io.quarkus.security.identity.IdentityProviderManager;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.AuthenticationRequest;
import io.quarkus.vertx.http.runtime.security.ChallengeData;
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism;
import io.smallrye.mutiny.Uni;
import io.vertx.ext.web.RoutingContext;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Quarkus HTTP authentication mechanism for the Stirling {@code X-API-KEY} header. Delegates the
 * key lookup to {@link ApiKeyIdentityProvider}. Yields no identity (anonymous) when the header is
 * absent so the Bearer-JWT path and open/login-disabled endpoints are unaffected. This reproduces
 * the Spring API-key filter that bound the resolved user to the security context.
 */
@ApplicationScoped
public class ApiKeyAuthenticationMechanism implements HttpAuthenticationMechanism {

    private static final String API_KEY_HEADER = "X-API-KEY";

    @Override
    public Uni<SecurityIdentity> authenticate(
            RoutingContext context, IdentityProviderManager identityProviderManager) {
        String apiKey = context.request().getHeader(API_KEY_HEADER);
        if (apiKey == null || apiKey.isBlank()) {
            return Uni.createFrom().nullItem();
        }
        return identityProviderManager.authenticate(new ApiKeyAuthenticationRequest(apiKey.trim()));
    }

    @Override
    public Uni<ChallengeData> getChallenge(RoutingContext context) {
        return Uni.createFrom().item(new ChallengeData(401, null, null));
    }

    @Override
    public Set<Class<? extends AuthenticationRequest>> getCredentialTypes() {
        return Collections.singleton(ApiKeyAuthenticationRequest.class);
    }
}
