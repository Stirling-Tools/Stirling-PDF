package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.LoginLandingView;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
@Slf4j
public class LoginLandingService {

    public static final String LOGIN_LANDING_VIEW_KEY = "loginLandingView";

    private final UserRepository userRepository;
    private final DatabaseServiceInterface databaseService;

    public LoginLandingView getLandingView(User user) {
        if (user == null || user.getId() == null) {
            return LoginLandingView.EDITOR;
        }
        return userRepository
                .findByIdWithSettings(user.getId())
                .map(User::getSettings)
                .map(settings -> settings.get(LOGIN_LANDING_VIEW_KEY))
                .flatMap(LoginLandingView::parse)
                .orElse(LoginLandingView.EDITOR);
    }

    @Transactional
    public void setLandingView(String username, LoginLandingView view)
            throws SQLException, UnsupportedProviderException {
        User user =
                userRepository
                        .findByUsernameIgnoreCaseWithSettings(username)
                        .orElseThrow(
                                () -> new UsernameNotFoundException("User not found: " + username));
        Map<String, String> settings = user.getSettings();
        if (settings == null) {
            settings = new HashMap<>();
            user.setSettings(settings);
        }
        settings.put(LOGIN_LANDING_VIEW_KEY, view.value());
        userRepository.save(user);
        databaseService.exportDatabase();
        log.debug("Set landing view to {} for user {}", view.value(), username);
    }
}
