package stirling.software.proprietary.security.identity;

import java.util.Optional;

import io.quarkus.security.AuthenticationFailedException;
import io.quarkus.security.identity.AuthenticationRequestContext;
import io.quarkus.security.identity.IdentityProvider;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.runtime.QuarkusPrincipal;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.smallrye.mutiny.Uni;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * Resolves an {@link ApiKeyAuthenticationRequest} (the {@code X-API-KEY} header) to a Quarkus
 * {@link SecurityIdentity} by looking the key up against the user store. Mirrors {@link
 * JwtTokenIdentityProvider}; the {@code ROLE_} prefix is also stripped so
 * {@code @RolesAllowed("ADMIN")} matches.
 */
@Slf4j
@ApplicationScoped
public class ApiKeyIdentityProvider implements IdentityProvider<ApiKeyAuthenticationRequest> {

    private static final String ROLE_PREFIX = "ROLE_";

    @Inject UserService userService;

    @Override
    public Class<ApiKeyAuthenticationRequest> getRequestType() {
        return ApiKeyAuthenticationRequest.class;
    }

    @Override
    public Uni<SecurityIdentity> authenticate(
            ApiKeyAuthenticationRequest request, AuthenticationRequestContext context) {
        return context.runBlocking(() -> buildIdentity(request.getApiKey()));
    }

    private SecurityIdentity buildIdentity(String apiKey) {
        Optional<User> userOpt = userService.getUserByApiKey(apiKey);
        if (userOpt.isEmpty() || !userOpt.get().isEnabled()) {
            throw new AuthenticationFailedException("Invalid API key");
        }
        User user = userOpt.get();
        QuarkusSecurityIdentity.Builder builder =
                QuarkusSecurityIdentity.builder()
                        .setPrincipal(new QuarkusPrincipal(user.getUsername()));
        String roles = user.getRolesAsString();
        if (roles != null) {
            for (String raw : roles.split(",")) {
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
        return builder.build();
    }
}
