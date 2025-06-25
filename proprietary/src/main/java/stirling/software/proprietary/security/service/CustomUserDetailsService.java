package stirling.software.proprietary.security.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import static org.springframework.security.core.userdetails.User.builder;

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
        if (!user.hasPassword()) {
            throw new IllegalArgumentException("Password must not be null");
        }

        return builder()
            .username(user.getUsername())
            .password(user.getPassword())
            .disabled(!user.isEnabled())
            .authorities(user.getAuthorities())
            .build();
    }

}
