package stirling.software.proprietary.security.service;

import lombok.Builder;
import lombok.Getter;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.AuthenticationType;

/**
 * Carries all attributes required to create or update a user account, including credentials,
 * SSO/provider details, team association, role and MFA configuration. Used by the security service
 * layer to persist or update users.
 *
 * <p>Defaults:
 *
 * <ul>
 *   <li>password: null
 *   <li>ssoProviderId: null
 *   <li>ssoProvider: null
 *   <li>authenticationType: {@code AuthenticationType.WEB}
 *   <li>teamId: null
 *   <li>team: null
 *   <li>role: {@code Role.USER.getRoleId()}
 *   <li>firstLogin: false
 *   <li>enabled: true
 *   <li>requireMfa: false
 *   <li>mfaEnabled: false
 *   <li>mfaSecret: null
 *   <li>mfaLastUsedStep: null
 * </ul>
 */
@Getter
@Builder(builderClassName = "Builder")
public class SaveUserRequest {
    private final String username;
    @Builder.Default private final String password = null;
    @Builder.Default private final String ssoProviderId = null;
    @Builder.Default private final String ssoProvider = null;
    @Builder.Default private final AuthenticationType authenticationType = AuthenticationType.WEB;
    @Builder.Default private final Long teamId = null;
    @Builder.Default private final Team team = null;
    @Builder.Default private final String role = Role.USER.getRoleId();
    @Builder.Default private final boolean firstLogin = false;
    @Builder.Default private final boolean enabled = true;
    @Builder.Default private final boolean requireMfa = false;
    @Builder.Default private final boolean mfaEnabled = false;
    @Builder.Default private final String mfaSecret = null;
    @Builder.Default private final Long mfaLastUsedStep = null;
}
