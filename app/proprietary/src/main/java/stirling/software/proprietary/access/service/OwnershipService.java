package stirling.software.proprietary.access.service;

import java.util.Set;
import java.util.function.BooleanSupplier;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.access.model.OwnedResource;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

/** Ownership and access checks for {@link OwnedResource}, backed by the resource-grant ACL. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OwnershipService {

    private final ResourceAccessService accessService;
    private final TeamLeadLookup teamLeadLookup;
    private final TeamRepository teamRepository;

    /** Whether the user may use the resource. */
    public boolean canUse(ResourceType type, OwnedResource resource, User user) {
        if (!resource.isEnabled()) {
            return isAdmin(user) || isOwner(resource, user);
        }
        return accessService.canUseResource(
                type,
                String.valueOf(resource.getId()),
                resource.getOwnerUserId(),
                resource.getDefaultAccess(),
                user);
    }

    /** Whether the user may manage the resource. */
    public boolean canManage(ResourceType type, OwnedResource resource, User user) {
        return accessService.canManageResource(
                type, String.valueOf(resource.getId()), resource.getOwnerUserId(), user);
    }

    /**
     * Authorizes the scope and assigns ownership; {@code lockedOverrideBlocks} guards USER scope.
     */
    public void assignOwnership(
            OwnedResource resource,
            OwnerScope scope,
            Long teamId,
            User user,
            BooleanSupplier lockedOverrideBlocks) {
        resource.setScope(scope);
        switch (scope) {
            case USER -> {
                if (lockedOverrideBlocks.getAsBoolean() && !isAdmin(user)) {
                    throw forbidden(
                            "This is locked to the server configuration by an administrator");
                }
                resource.setOwnerUser(user);
            }
            case SERVER -> {
                if (!isAdmin(user)) {
                    throw forbidden("Only administrators can create server-owned resources");
                }
            }
            case TEAM -> {
                if (teamId == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "ownerTeamId is required");
                }
                Team team =
                        teamRepository
                                .findById(teamId)
                                .orElseThrow(() -> notFound("Team not found"));
                if (!isAdmin(user) && !teamLeadLookup.isLeaderOfTeam(user, team.getId())) {
                    throw forbidden("Only admins or team leaders can create team-owned resources");
                }
                resource.setOwnerTeam(team);
            }
        }
    }

    /** Resource ids of the given type the user or their team holds a grant on. */
    public Set<String> grantedResourceIds(ResourceType type, User user) {
        return accessService.grantedResourceIds(type, user);
    }

    public boolean isAdmin(User user) {
        return user.getAuthorities().stream()
                .anyMatch(a -> Role.ADMIN.getRoleId().equals(a.getAuthority()));
    }

    public boolean isOwner(OwnedResource resource, User user) {
        if (resource.getOwnerUserId() != null && resource.getOwnerUserId().equals(user.getId())) {
            return true;
        }
        // Team-owned: the lead of the owning team owns it.
        return resource.getOwnerTeamId() != null
                && teamLeadLookup.isLeaderOfTeam(user, resource.getOwnerTeamId());
    }

    private ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }

    private ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
