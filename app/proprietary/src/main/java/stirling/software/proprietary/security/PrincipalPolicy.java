package stirling.software.proprietary.security;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import stirling.software.common.model.enumeration.Role;

/** Authorization predicates for endpoints that must only be callable by a real user. */
@Component("principalPolicy")
public class PrincipalPolicy {

    public boolean isHumanUser(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getName())
                && !Role.INTERNAL_API_USER.getRoleId().equals(authentication.getName())
                && authentication.getAuthorities().stream()
                        .noneMatch(
                                authority ->
                                        Role.INTERNAL_API_USER
                                                .getRoleId()
                                                .equals(authority.getAuthority()));
    }
}
