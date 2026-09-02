package stirling.software.proprietary.audit;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;

/** Resolves which slice of the audit log the caller may see. */
public interface PortalAuditScopeResolver {

    PortalAuditScope resolve();

    /** True when the current authentication carries {@code ROLE_ADMIN}. */
    static boolean hasAdminAuthority() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null
                && auth.getAuthorities().stream()
                        .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
