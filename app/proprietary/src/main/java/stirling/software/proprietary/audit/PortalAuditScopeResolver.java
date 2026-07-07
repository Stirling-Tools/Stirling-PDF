package stirling.software.proprietary.audit;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Resolves which slice of the audit log the current caller may see.
 *
 * <p>The self-hosted default ({@link DefaultPortalAuditScopeResolver}) grants admins the whole
 * server and denies everyone else. The saas module supplies a {@code @Primary} override that also
 * grants a team leader their own team's events.
 */
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
