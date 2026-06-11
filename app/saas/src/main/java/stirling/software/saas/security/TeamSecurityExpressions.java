package stirling.software.saas.security;

import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * Security expressions for team-based authorization in saas mode. Wired into
 * {@code @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)")} annotations on {@code
 * SaasTeamController} endpoints.
 *
 * <p>The current-user resolution uses the saas-mode authentication primitives ({@link
 * EnhancedJwtAuthenticationToken} from a Supabase JWT, or our existing API-key path) and looks the
 * local {@link User} row up via {@link UserService#findBySupabaseId(UUID)}.
 */
@Component("teamSecurity")
@Profile("saas")
@RequiredArgsConstructor
public class TeamSecurityExpressions {

    private final TeamMembershipRepository membershipRepository;
    private final UserService userService;

    /** Whether the current authenticated user is a {@code LEADER} of the given team. */
    public boolean isTeamLeader(Long teamId) {
        User currentUser = getCurrentUser();
        if (currentUser == null) {
            return false;
        }
        return membershipRepository
                .findByTeamIdAndUserId(teamId, currentUser.getId())
                .map(membership -> membership.getRole() == TeamRole.LEADER)
                .orElse(false);
    }

    /** Whether the current authenticated user is a {@code LEADER} of their own team. */
    public boolean isCurrentUserTeamLeader() {
        User currentUser = getCurrentUser();
        if (currentUser == null || currentUser.getTeam() == null) {
            return false;
        }
        return membershipRepository
                .findByTeamIdAndUserId(currentUser.getTeam().getId(), currentUser.getId())
                .map(membership -> membership.getRole() == TeamRole.LEADER)
                .orElse(false);
    }

    /** The current authenticated user's team id, or {@code null} if unauthenticated / teamless. */
    public Long currentUserTeamId() {
        User currentUser = getCurrentUser();
        if (currentUser == null || currentUser.getTeam() == null) {
            return null;
        }
        return currentUser.getTeam().getId();
    }

    /** Whether the current authenticated user is any kind of member of the given team. */
    public boolean isTeamMember(Long teamId) {
        User currentUser = getCurrentUser();
        if (currentUser == null) {
            return false;
        }
        return membershipRepository.existsByTeamIdAndUserId(teamId, currentUser.getId());
    }

    /** Resolve the current user from a saas-mode JWT or API-key authentication. */
    private User getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        if (authentication instanceof EnhancedJwtAuthenticationToken jwt) {
            try {
                UUID supabaseId = UUID.fromString(jwt.getSupabaseId());
                return userService.findBySupabaseId(supabaseId).orElse(null);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
        // API-key path: the principal is the User entity itself.
        Object principal = authentication.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }
        // Username fallback.
        if (principal instanceof String username) {
            Optional<User> byUsername = userService.findByUsername(username);
            return byUsername.orElse(null);
        }
        return null;
    }
}
