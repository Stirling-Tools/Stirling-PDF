package stirling.software.saas.security;

import java.util.HashSet;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.access.service.PrincipalResolver;
import stirling.software.proprietary.security.model.User;

/** USER/TEAM only: SaaS has no org concept, so an ORG grant must never match across tenants. */
@Component
@Profile("saas")
public class SaasPrincipalResolver implements PrincipalResolver {

    @Override
    public Set<PrincipalRef> principalsOf(User user) {
        if (user == null) {
            return Set.of();
        }
        Set<PrincipalRef> principals = new HashSet<>();
        principals.add(PrincipalRef.user(user.getId()));
        if (user.getTeam() != null) {
            principals.add(PrincipalRef.team(user.getTeam().getId()));
        }
        return principals;
    }
}
