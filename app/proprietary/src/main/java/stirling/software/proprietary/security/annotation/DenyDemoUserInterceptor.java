package stirling.software.proprietary.security.annotation;

import io.quarkus.security.identity.SecurityIdentity;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.enumeration.Role;

/**
 * Enforces {@link DenyDemoUser}: rejects calls made by an identity holding the {@code DEMO_USER}
 * role with 403. Reproduces Spring's {@code @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")}. The
 * {@link io.quarkus.security.runtime.QuarkusSecurityIdentity} carries both the raw {@code
 * ROLE_DEMO_USER} and the prefix-stripped {@code DEMO_USER} (see {@code JwtTokenIdentityProvider}),
 * so either match denies. Anonymous/non-demo identities proceed.
 */
@DenyDemoUser
@Interceptor
@Priority(Interceptor.Priority.APPLICATION + 10)
public class DenyDemoUserInterceptor {

    @Inject SecurityIdentity securityIdentity;

    @AroundInvoke
    Object enforce(InvocationContext context) throws Exception {
        if (securityIdentity != null
                && !securityIdentity.isAnonymous()
                && (securityIdentity.hasRole(Role.DEMO_USER.getRoleId())
                        || securityIdentity.hasRole("DEMO_USER"))) {
            throw new WebApplicationException(
                    "This action is not available for demo accounts", Response.Status.FORBIDDEN);
        }
        return context.proceed();
    }
}
