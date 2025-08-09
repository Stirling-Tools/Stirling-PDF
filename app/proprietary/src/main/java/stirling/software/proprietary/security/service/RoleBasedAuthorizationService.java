package stirling.software.proprietary.security.service;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
public class RoleBasedAuthorizationService {

    private final UserRepository userRepository;

    /** Gets the current authenticated user */
    public User getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }

        String username = authentication.getName();
        return userRepository.findByUsername(username).orElse(null);
    }

    /** Checks if current user can manage users across all organizations (System Admin) */
    public boolean canManageAllUsers() {
        User currentUser = getCurrentUser();
        return currentUser != null && currentUser.isSystemAdmin();
    }

    /** Checks if current user can manage users within their organization (Org Admin or above) */
    public boolean canManageOrgUsers() {
        User currentUser = getCurrentUser();
        return currentUser != null && currentUser.isOrgAdmin();
    }

    /** Checks if current user can manage team members (Team Lead or above) */
    public boolean canManageTeamUsers() {
        User currentUser = getCurrentUser();
        return currentUser != null && currentUser.isTeamLead();
    }

    /** Checks if current user can manage a specific user */
    public boolean canManageUser(Long userId) {
        User currentUser = getCurrentUser();
        if (currentUser == null) return false;

        User targetUser = userRepository.findById(userId).orElse(null);
        if (targetUser == null) return false;

        return currentUser.canManageUser(targetUser);
    }

    /** Checks if current user can manage a specific team */
    public boolean canManageTeam(Team team) {
        User currentUser = getCurrentUser();
        if (currentUser == null || team == null) return false;

        return currentUser.canManageTeam(team);
    }

    /** Checks if current user can manage teams within their organization */
    public boolean canManageOrgTeams() {
        User currentUser = getCurrentUser();
        return currentUser != null && currentUser.isOrgAdmin();
    }

    /** Checks if current user can create/manage organizations (System Admin only) */
    public boolean canManageOrganizations() {
        return canManageAllUsers();
    }

    /** Checks if current user can assign roles */
    public boolean canAssignRole(Role targetRole) {
        User currentUser = getCurrentUser();
        if (currentUser == null) return false;

        // Users can only assign roles that are lower than or equal to their own
        return currentUser.getUserRole().hasAuthorityOver(targetRole);
    }

    /** Checks if current user can remove a user from their team/organization */
    public boolean canRemoveUserFromTeam(Long userId) {
        return canManageUser(userId);
    }

    /** Checks if current user can add a user to a specific team */
    public boolean canAddUserToTeam(Long userId, Team team) {
        User currentUser = getCurrentUser();
        if (currentUser == null || team == null) return false;

        // Must be able to manage both the user and the target team
        return canManageUser(userId) && currentUser.canManageTeam(team);
    }

    /** Gets the highest role the current user can assign to others */
    public Role getMaxAssignableRole() {
        User currentUser = getCurrentUser();
        if (currentUser == null) return Role.USER;

        return switch (currentUser.getUserRole()) {
            case SYSTEM_ADMIN, ADMIN -> Role.ORG_ADMIN; // System admins can create org admins
            case ORG_ADMIN -> Role.TEAM_LEAD; // Org admins can create team leads
            case TEAM_LEAD -> Role.USER; // Team leads can only create regular users
            default -> Role.USER;
        };
    }

    /** Checks if current user can view organization details */
    public boolean canViewOrganization(Organization organization) {
        User currentUser = getCurrentUser();
        if (currentUser == null || organization == null) return false;

        // System admins can view any org
        if (currentUser.isSystemAdmin()) return true;

        // Org admins and team leads can view their own organization
        Organization userOrg = currentUser.getOrganization();
        return userOrg != null && userOrg.getId().equals(organization.getId());
    }
}
