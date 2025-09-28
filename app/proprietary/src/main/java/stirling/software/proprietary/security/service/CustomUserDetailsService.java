package stirling.software.proprietary.security.service;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    private final LoginAttemptService loginAttemptService;

    private final ApplicationProperties.Security securityProperties;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user =
                userRepository
                        .findByUsername(username)
                        .orElseThrow(
                                () ->
                                        new UsernameNotFoundException(
                                                "No user found with username: " + username));

        if (loginAttemptService.isBlocked(username)) {
            throw new LockedException(
                    "Your account has been locked due to too many failed login attempts.");
        }

        // Handle legacy users without authenticationType (from versions < 1.3.0)
        String authTypeStr = user.getAuthenticationType();
        if (authTypeStr == null || authTypeStr.isEmpty()) {
            // Migrate legacy users by detecting authentication type based on password presence
            AuthenticationType detectedType;
            if (user.hasPassword()) {
                // Users with passwords are likely traditional web authentication users
                detectedType = AuthenticationType.WEB;
            } else {
                // Users without passwords are SSO users (OAuth2/SAML2/etc)
                // Choose the appropriate SSO type based on what's enabled
                detectedType = determinePreferredSSOType();
            }

            authTypeStr = detectedType.name();
            // Update the user record to set the detected authentication type
            user.setAuthenticationType(detectedType);
            userRepository.save(user);
        }

        AuthenticationType userAuthenticationType =
                AuthenticationType.valueOf(authTypeStr.toUpperCase());
        if (!user.hasPassword() && userAuthenticationType == AuthenticationType.WEB) {
            throw new IllegalArgumentException("Password must not be null");
        }

        return user;
    }

    /**
     * Determines the preferred SSO authentication type based on what's enabled in the application
     * configuration.
     *
     * @return The preferred AuthenticationType for SSO users
     */
    private AuthenticationType determinePreferredSSOType() {
        // Check what SSO types are enabled and prefer in order: OAUTH2 > SAML2 > fallback to OAUTH2
        boolean oauth2Enabled =
                securityProperties.getOauth2() != null
                        && securityProperties.getOauth2().getEnabled();
        boolean saml2Enabled =
                securityProperties.getSaml2() != null && securityProperties.getSaml2().getEnabled();

        if (oauth2Enabled) {
            return AuthenticationType.OAUTH2;
        } else if (saml2Enabled) {
            return AuthenticationType.SAML2;
        } else {
            // Fallback to OAUTH2 (better than deprecated SSO)
            return AuthenticationType.OAUTH2;
        }
    }
}
