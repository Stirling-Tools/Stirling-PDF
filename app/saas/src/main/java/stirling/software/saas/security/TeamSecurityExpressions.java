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
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.service.UserService;

/**
 * Security expressions for team-based authorization in saas mode. Wired into
 * {@code @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)")} annotations on {@code
 * SaasTeamController} endpoints.
 *
 * <p>The current user is the {@link User} the authentication filters already attached as the
 * principal. Only a principal that is not a {@link User} is looked up: a guest's raw Jwt via {@link
 * UserService#findBySupabaseId(UUID)}, a bare username via {@link UserService#findByUsername}.
 */
@Component("teamSecurity")
@Profile("saas")
@RequiredArgsConstructor
public class TeamSecurityExpressions {

    private final TeamMembershipRepository membershipRepository;
    private final UserService userService;
    private final UserTeamResolver userTeamResolver;

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
        return userTeamResolver.isLeader(getCurrentUser());
    }

    /** The current authenticated user's team id, or {@code null} if unauthenticated / teamless. */
    public Long currentUserTeamId() {
        return userTeamResolver.teamId(getCurrentUser()).orElse(null);
    }

    /** The current authenticated user's id, or {@code null} if unauthenticated. */
    public Long currentUserId() {
        User currentUser = getCurrentUser();
        return currentUser == null ? null : currentUser.getId();
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
        // Both the JWT and API-key filters attach the resolved User to the token, so prefer it over
        // another lookup. Guests carry a raw Jwt and fall through to the supabase-id path.
        Object principal = authentication.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }
        if (authentication instanceof EnhancedJwtAuthenticationToken jwt) {
            try {
                UUID supabaseId = UUID.fromString(jwt.getSupabaseId());
                return userService.findBySupabaseId(supabaseId).orElse(null);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
        // Username fallback.
        if (principal instanceof String username) {
            Optional<User> byUsername = userService.findByUsername(username);
            return byUsername.orElse(null);
        }
        return null;
    }
}
