package stirling.software.proprietary.access.service;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.access.model.AccessPermission;
import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.security.model.User;

/** Resolves access to gated resources: owner, then admin, then grant, then default policy. */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class ResourceAccessService {

    private final ResourceGrantRepository grantRepository;
    private final TeamLeadLookup teamLeadLookup;
    private final PrincipalResolver principalResolver;

    @Value("${security.portal.defaultAccess:ADMINS_AND_TEAM_LEADS}")
    private DefaultAccessPolicy portalDefaultPolicy;

    // ---- public checks ----

    /** Whether the user may use the portal / processor. */
    public boolean canAccessPortal(User user) {
        return canUseResource(ResourceType.PORTAL, "", null, portalDefaultPolicy, user);
    }

    /**
     * Portal access for a roster (admin, grant, or default policy). {@code activeTeamLeaderUserIds}
     * must hold ids of users who lead their own active team — the set the ADMINS_AND_TEAM_LEADS
     * default admits, matching {@link #canAccessPortal}.
     */
    public Set<Long> usersWithPortalAccess(
            Collection<User> users, Set<Long> activeTeamLeaderUserIds) {
        Set<PrincipalRef> grantedPrincipals = new HashSet<>();
        for (ResourceGrant g :
                grantRepository.findByResourceTypeAndResourceId(ResourceType.PORTAL, "")) {
            if (permissionSatisfies(g.getPermission(), AccessPermission.USE)) {
                grantedPrincipals.add(new PrincipalRef(g.getPrincipalType(), g.getPrincipalId()));
            }
        }
        Set<Long> leaderIds = activeTeamLeaderUserIds == null ? Set.of() : activeTeamLeaderUserIds;
        Set<Long> allowed = new HashSet<>();
        for (User user : users) {
            if (user != null
                    && user.getId() != null
                    && hasPortalAccess(user, grantedPrincipals, leaderIds)) {
                allowed.add(user.getId());
            }
        }
        return allowed;
    }

    private boolean hasPortalAccess(
            User user, Set<PrincipalRef> grantedPrincipals, Set<Long> leaderIds) {
        if (isAdmin(user)) {
            return true;
        }
        for (PrincipalRef principal : principalResolver.principalsOf(user)) {
            if (grantedPrincipals.contains(principal)) {
                return true;
            }
        }
        if (portalDefaultPolicy == null) {
            return false;
        }
        return switch (portalDefaultPolicy) {
            case ORG_ALL -> principalResolver.allowsDeploymentWideAccess();
            case ADMINS_AND_TEAM_LEADS -> leaderIds.contains(user.getId());
            case EXPLICIT_ONLY -> false;
        };
    }

    /** Whether the user may use a resource, falling back to its default policy. */
    public boolean canUseResource(
            ResourceType type,
            String resourceId,
            PrincipalRef owner,
            DefaultAccessPolicy defaultPolicy,
            User user) {
        if (user == null) {
            return false;
        }
        if (isOwner(owner, user) || isAdmin(user)) {
            return true;
        }
        if (hasGrant(type, normalize(resourceId), user, AccessPermission.USE)) {
            return true;
        }
        return matchesDefault(defaultPolicy, owner, user);
    }

    /** Whether the user may manage (edit/delete/share) a resource. No default-policy fallback. */
    public boolean canManageResource(
            ResourceType type, String resourceId, PrincipalRef owner, User user) {
        if (user == null) {
            return false;
        }
        if (isOwner(owner, user) || isAdmin(user)) {
            return true;
        }
        return hasGrant(type, normalize(resourceId), user, AccessPermission.MANAGE);
    }

    // ---- grant management ----

    @Transactional
    public ResourceGrant grant(
            ResourceType type,
            String resourceId,
            PrincipalType principalType,
            Long principalId,
            AccessPermission permission,
            User grantedBy) {
        String rid = normalize(resourceId);
        ResourceGrant grant =
                grantRepository.findByResourceTypeAndResourceId(type, rid).stream()
                        .filter(
                                g ->
                                        g.getPrincipalType() == principalType
                                                && g.getPrincipalId().equals(principalId))
                        .findFirst()
                        .orElseGet(ResourceGrant::new);
        grant.setResourceType(type);
        grant.setResourceId(rid);
        grant.setPrincipalType(principalType);
        grant.setPrincipalId(principalId);
        grant.setPermission(permission);
        if (grantedBy != null) {
            grant.setGrantedBy(grantedBy);
        }
        return grantRepository.save(grant);
    }

    @Transactional
    public void revoke(Long grantId) {
        grantRepository.deleteById(grantId);
    }

    public List<ResourceGrant> listGrants(ResourceType type, String resourceId) {
        return grantRepository.findByResourceTypeAndResourceId(type, normalize(resourceId));
    }

    /** Every grant a principal holds, for the per-user/per-team manage-access view. */
    public List<ResourceGrant> listGrantsForPrincipal(
            PrincipalType principalType, Long principalId) {
        return grantRepository.findByPrincipalTypeAndPrincipalId(principalType, principalId);
    }

    /** Resource ids of the given type that any of the user's principals holds a grant on. */
    public Set<String> grantedResourceIds(ResourceType type, User user) {
        if (user == null) {
            return Set.of();
        }
        Set<String> ids = new HashSet<>();
        for (PrincipalRef principal : principalResolver.principalsOf(user)) {
            for (ResourceGrant g :
                    grantRepository.findByResourceTypeAndPrincipalTypeAndPrincipalId(
                            type, principal.type(), principal.id())) {
                ids.add(g.getResourceId());
            }
        }
        return ids;
    }

    // ---- internals ----

    private boolean hasGrant(
            ResourceType type, String resourceId, User user, AccessPermission required) {
        Set<PrincipalRef> principals = principalResolver.principalsOf(user);
        for (ResourceGrant g : grantRepository.findByResourceTypeAndResourceId(type, resourceId)) {
            if (!permissionSatisfies(g.getPermission(), required)) {
                continue;
            }
            if (principals.contains(new PrincipalRef(g.getPrincipalType(), g.getPrincipalId()))) {
                return true;
            }
        }
        return false;
    }

    // MANAGE implies USE.
    private boolean permissionSatisfies(AccessPermission held, AccessPermission required) {
        if (required == AccessPermission.USE) {
            return held == AccessPermission.USE || held == AccessPermission.MANAGE;
        }
        return held == AccessPermission.MANAGE;
    }

    private boolean matchesDefault(DefaultAccessPolicy policy, PrincipalRef owner, User user) {
        if (policy == null) {
            return false;
        }
        return switch (policy) {
            // Deployment-wide only where the resolver treats everyone as one org; saas resolvers
            // return false, so ORG_ALL cannot leak a tenant's resource to another tenant's users.
            case ORG_ALL -> principalResolver.allowsDeploymentWideAccess();
            // Admins already pass above; only team leads here, scoped to the owning team.
            case ADMINS_AND_TEAM_LEADS -> matchesTeamLeadDefault(owner, user);
            case EXPLICIT_ONLY -> false;
        };
    }

    // Portal (no owner) admits the leader of the user's active team; a team-owned resource
    // admits only that team's leads; a user-owned resource admits no extra leads.
    private boolean matchesTeamLeadDefault(PrincipalRef owner, User user) {
        if (owner == null) {
            return user.getTeam() != null
                    && user.getTeam().getId() != null
                    && teamLeadLookup.isLeaderOfTeam(user, user.getTeam().getId());
        }
        return owner.type() == PrincipalType.TEAM
                && owner.id() != null
                && teamLeadLookup.isLeaderOfTeam(user, owner.id());
    }

    // Team owners are the owning team's leaders; plain members are not.
    private boolean isOwner(PrincipalRef owner, User user) {
        if (owner == null || owner.id() == null) {
            return false;
        }
        return switch (owner.type()) {
            case USER -> owner.id().equals(user.getId());
            case TEAM -> teamLeadLookup.isLeaderOfTeam(user, owner.id());
        };
    }

    private boolean isAdmin(User user) {
        return user.getAuthorities().stream()
                .anyMatch(a -> Role.ADMIN.getRoleId().equals(a.getAuthority()));
    }

    private String normalize(String resourceId) {
        return resourceId == null ? "" : resourceId;
    }
}
