package stirling.software.saas.security;

import java.util.Optional;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Named;

import lombok.RequiredArgsConstructor;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;

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
// TODO: Migration required - @Profile("saas") had no Quarkus equivalent here; gate bean
// availability via build profile / @IfBuildProfile if saas-only activation is required.
@ApplicationScoped
@Named("teamSecurity")
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
