package stirling.software.proprietary.access.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/** {@code @PreAuthorize} bean for portal-access checks. Active in self-hosted and saas. */
@Component("resourceAccess")
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
