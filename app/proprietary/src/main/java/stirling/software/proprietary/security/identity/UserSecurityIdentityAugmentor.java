package stirling.software.proprietary.security.identity;

import java.util.Optional;

import io.quarkus.security.identity.AuthenticationRequestContext;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.SecurityIdentityAugmentor;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.smallrye.mutiny.Uni;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * Attaches the {@link User} entity as the {@link SecurityIdentity} principal for any authenticated
 * request. Spring exposed the {@code User} directly via {@code Authentication#getPrincipal()} (it
 * implemented {@code UserDetails}), so a lot of the code base does {@code principal instanceof
 * User} (folders, file storage, sessions, audit, UserController). This augmentor restores that for
 * the Quarkus auth paths (JWT Bearer, X-API-KEY, and later OIDC/SAML): it re-loads the user by name
 * and rebuilds the identity with the {@code User} as principal, preserving the roles the {@link
 * JwtTokenIdentityProvider} / {@link ApiKeyIdentityProvider} already assigned. This is the
 * augmentor the {@code // TODO: Migration required} comments across the security/storage code ask
 * for.
 */
@ApplicationScoped
public class UserSecurityIdentityAugmentor implements SecurityIdentityAugmentor {

    @Inject UserService userService;

    @Override
    public Uni<SecurityIdentity> augment(
            SecurityIdentity identity, AuthenticationRequestContext context) {
        if (identity == null || identity.isAnonymous() || identity.getPrincipal() instanceof User) {
            return Uni.createFrom().item(identity);
        }
        return context.runBlocking(() -> withUserPrincipal(identity));
    }

    private SecurityIdentity withUserPrincipal(SecurityIdentity identity) {
        String username = identity.getPrincipal().getName();
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(username);
        if (userOpt.isEmpty()) {
            return identity;
        }
        return QuarkusSecurityIdentity.builder(identity).setPrincipal(userOpt.get()).build();
    }
}
