package stirling.software.proprietary.security.provider;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetails;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.service.PasswordPolicyService;

/**
 * Custom AuthenticationProvider that extends DaoAuthenticationProvider and performs additional
 * credential checks using PasswordPolicyService before delegating to the standard password/hash
 * verification.
 */
@RequiredArgsConstructor
public class UserAuthenticationProvider extends DaoAuthenticationProvider {

    private final PasswordPolicyService passwordPolicyService;

    @Override
    protected void additionalAuthenticationChecks(
            UserDetails userDetails, UsernamePasswordAuthenticationToken authentication)
            throws AuthenticationException {
        // Validate raw password against password policy before verifying against stored hash
        Object credentials = authentication.getCredentials();
        String rawPassword = credentials == null ? null : credentials.toString();

        // Enforce policy only if a password was actually provided
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new BadCredentialsException("Bad credentials");
        }

        if (!passwordPolicyService.validatePassword(rawPassword)) {
            // Keep the exception message generic to avoid leaking policy details to attackers
            throw new BadCredentialsException("Invalid password");
        }

        super.additionalAuthenticationChecks(userDetails, authentication);
    }
}
