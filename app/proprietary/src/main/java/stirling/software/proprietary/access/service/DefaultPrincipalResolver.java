package stirling.software.proprietary.access.service;

import java.util.HashSet;
import java.util.Set;

import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.security.model.User;

/** Self-hosted projection: the user, their team, and the single deployment org. */
public class DefaultPrincipalResolver implements PrincipalResolver {

    private final long orgId;

    public DefaultPrincipalResolver(long orgId) {
        this.orgId = orgId;
    }

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
        principals.add(PrincipalRef.org(orgId));
        return principals;
    }
}
