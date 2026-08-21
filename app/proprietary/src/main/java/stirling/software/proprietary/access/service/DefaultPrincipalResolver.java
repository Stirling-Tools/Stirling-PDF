package stirling.software.proprietary.access.service;

import java.util.HashSet;
import java.util.Set;

import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.security.model.User;

/**
 * Self-hosted projection: the user and their team. One deployment = one org, so ORG_ALL is open.
 */
public class DefaultPrincipalResolver implements PrincipalResolver {

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

    // Self-hosted is a single deployment-wide org, so ORG_ALL admits every authenticated user.
    @Override
    public boolean allowsDeploymentWideAccess() {
        return true;
    }
}
