package stirling.software.proprietary.security.service;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    private final LoginAttemptService loginAttemptService;

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

        AuthenticationType userAuthenticationType =
                AuthenticationType.valueOf(user.getAuthenticationType().toUpperCase());
        if (!user.hasPassword() && userAuthenticationType == AuthenticationType.WEB) {
            throw new IllegalArgumentException("Password must not be null");
        }

        return user;
    }
}
