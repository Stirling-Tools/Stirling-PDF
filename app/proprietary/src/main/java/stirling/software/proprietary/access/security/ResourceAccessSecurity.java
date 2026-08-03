package stirling.software.proprietary.access.security;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.security.UserDetails;
import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * {@code @PreAuthorize} bean for portal-access checks. Active in self-hosted and saas. Convention:
 * every portal-exclusive endpoint is gated with
 * {@code @PreAuthorize("@resourceAccess.canUsePortal()")}; endpoints shared with the editor (e.g.
 * the policies API) must NOT be.
 */
@ApplicationScoped("resourceAccess")
@RequiredArgsConstructor
public class ResourceAccessSecurity {

    private final ResourceAccessService accessService;
    private final UserService userService;

    public boolean canUsePortal() {
        User user = currentUser();
        return user != null && accessService.canAccessPortal(user);
    }

    private User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }
        if (principal instanceof UserDetails userDetails) {
            return userService.findByUsername(userDetails.getUsername()).orElse(null);
        }
        if (principal instanceof String username && !"anonymousUser".equals(username)) {
            return userService.findByUsername(username).orElse(null);
        }
        return null;
    }
}
