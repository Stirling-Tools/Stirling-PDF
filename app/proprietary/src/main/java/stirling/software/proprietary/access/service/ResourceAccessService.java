package stirling.software.proprietary.access.service;

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

    @Value("${security.portal.defaultAccess:ADMINS_AND_TEAM_LEADS}")
    private DefaultAccessPolicy portalDefaultPolicy;

    // ---- public checks ----

    /** Whether the user may use the portal / processor. */
    public boolean canAccessPortal(User user) {
        return canUseResource(ResourceType.PORTAL, "", null, portalDefaultPolicy, user);
    }

    /** Whether the user may use a resource, falling back to its default policy. */
    public boolean canUseResource(
            ResourceType type,
            String resourceId,
            Long ownerUserId,
            DefaultAccessPolicy defaultPolicy,
            User user) {
        if (user == null) {
            return false;
        }
        if (isOwner(ownerUserId, user) || isAdmin(user)) {
            return true;
        }
        if (hasGrant(type, normalize(resourceId), user, AccessPermission.USE)) {
            return true;
        }
        return matchesDefault(defaultPolicy, user);
    }

    /** Whether the user may manage (edit/delete/share) a resource. No default-policy fallback. */
    public boolean canManageResource(
            ResourceType type, String resourceId, Long ownerUserId, User user) {
        if (user == null) {
            return false;
        }
        if (isOwner(ownerUserId, user) || isAdmin(user)) {
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

    /** Resource ids of the given type that this user (or their team) holds any grant on. */
    public Set<String> grantedResourceIds(ResourceType type, User user) {
        if (user == null) {
            return Set.of();
        }
        Set<String> ids = new HashSet<>();
        for (ResourceGrant g :
                grantRepository.findByResourceTypeAndPrincipalTypeAndPrincipalId(
                        type, PrincipalType.USER, user.getId())) {
            ids.add(g.getResourceId());
        }
        if (user.getTeam() != null) {
            for (ResourceGrant g :
                    grantRepository.findByResourceTypeAndPrincipalTypeAndPrincipalId(
                            type, PrincipalType.TEAM, user.getTeam().getId())) {
                ids.add(g.getResourceId());
            }
        }
        return ids;
    }

    // ---- internals ----

    private boolean hasGrant(
            ResourceType type, String resourceId, User user, AccessPermission required) {
        Long teamId = user.getTeam() != null ? user.getTeam().getId() : null;
        for (ResourceGrant g : grantRepository.findByResourceTypeAndResourceId(type, resourceId)) {
            if (!permissionSatisfies(g.getPermission(), required)) {
                continue;
            }
            if (g.getPrincipalType() == PrincipalType.USER
                    && g.getPrincipalId().equals(user.getId())) {
                return true;
            }
            if (g.getPrincipalType() == PrincipalType.TEAM
                    && teamId != null
                    && g.getPrincipalId().equals(teamId)) {
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

    private boolean matchesDefault(DefaultAccessPolicy policy, User user) {
        if (policy == null) {
            return false;
        }
        return switch (policy) {
            case ORG_ALL -> true;
            // Admins already pass above; only team leads here.
            case ADMINS_AND_TEAM_LEADS -> teamLeadLookup.isAnyTeamLeader(user);
            case EXPLICIT_ONLY -> false;
        };
    }

    private boolean isOwner(Long ownerUserId, User user) {
        return ownerUserId != null && ownerUserId.equals(user.getId());
    }

    private boolean isAdmin(User user) {
        return user.getAuthorities().stream()
                .anyMatch(a -> Role.ADMIN.getRoleId().equals(a.getAuthority()));
    }

    private String normalize(String resourceId) {
        return resourceId == null ? "" : resourceId;
    }
}
