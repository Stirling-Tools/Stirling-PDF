package stirling.software.proprietary.access.service;

import java.util.Set;
import java.util.stream.Collectors;

import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.security.model.User;

/** Projects a user onto the set of principals they act as. */
public interface PrincipalResolver {

    /** Every principal the user acts as; empty for a null user. */
    Set<PrincipalRef> principalsOf(User user);

    /**
     * Whether this deployment treats every authenticated user as one org, so the {@code ORG_ALL}
     * default policy admits anyone. Self-hosted: true. Multi-tenant saas: false, so an {@code
     * ORG_ALL} resource can't leak across tenants. Defaults to false (deny) for safety.
     */
    default boolean allowsDeploymentWideAccess() {
        return false;
    }

    /** Canonical wire tokens for the engine, e.g. "user:12". */
    default Set<String> principalTokens(User user) {
        return principalsOf(user).stream().map(PrincipalRef::token).collect(Collectors.toSet());
    }
}
