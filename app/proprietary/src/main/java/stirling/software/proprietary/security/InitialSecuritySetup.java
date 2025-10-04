package stirling.software.proprietary.security;

import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
@Component
@RequiredArgsConstructor
public class InitialSecuritySetup {

    @Value("${v2:false}")
    private boolean v2Enabled = false;

    private final UserService userService;
    private final TeamService teamService;
    private final ApplicationProperties applicationProperties;
    private final DatabaseServiceInterface databaseService;

    @PostConstruct
    public void init() {
        try {

            if (!userService.hasUsers()) {
                if (databaseService.hasBackup()) {
                    databaseService.importDatabase();
                } else {
                    initializeAdminUser();
                }
            }

            configureJWTSettings();
            assignUsersToDefaultTeamIfMissing();
            initializeInternalApiUser();
        } catch (IllegalArgumentException | SQLException | UnsupportedProviderException e) {
            log.error("Failed to initialize security setup.", e);
            System.exit(1);
        }
    }

    private void configureJWTSettings() {
        ApplicationProperties.Security.Jwt jwtProperties =
                applicationProperties.getSecurity().getJwt();

        boolean jwtEnabled = jwtProperties.isEnabled();
        if (!v2Enabled || !jwtEnabled) {
            log.debug(
                    "V2 enabled: {}, JWT enabled: {} - disabling all JWT features",
                    v2Enabled,
                    jwtEnabled);

            jwtProperties.setKeyCleanup(false);
        }
    }

    private void assignUsersToDefaultTeamIfMissing() {
        Team defaultTeam = teamService.getOrCreateDefaultTeam();
        Team internalTeam = teamService.getOrCreateInternalTeam();
        List<User> usersWithoutTeam = userService.getUsersWithoutTeam();

        for (User user : usersWithoutTeam) {
            if (user.getUsername().equalsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
                user.setTeam(internalTeam);
            } else {
                user.setTeam(defaultTeam);
            }
        }

        userService.saveAll(usersWithoutTeam); // batch save
        if (usersWithoutTeam != null && !usersWithoutTeam.isEmpty()) {
            log.info(
                    "Assigned {} user(s) without a team to the default team.",
                    usersWithoutTeam.size());
        }
    }

    private void initializeAdminUser() throws SQLException, UnsupportedProviderException {
        String initialUsername =
                applicationProperties.getSecurity().getInitialLogin().getUsername();
        String initialPassword =
                applicationProperties.getSecurity().getInitialLogin().getPassword();
        if (initialUsername != null
                && !initialUsername.isEmpty()
                && initialPassword != null
                && !initialPassword.isEmpty()
                && userService.findByUsernameIgnoreCase(initialUsername).isEmpty()) {

            Team team = teamService.getOrCreateDefaultTeam();
            userService.saveUser(
                    initialUsername, initialPassword, team, Role.ADMIN.getRoleId(), false);
            log.info("Admin user created: {}", initialUsername);
        } else {
            createDefaultAdminUser();
        }
    }

    private void createDefaultAdminUser() throws SQLException, UnsupportedProviderException {
        String defaultUsername = "admin";
        String defaultPassword = "stirling";

        if (userService.findByUsernameIgnoreCase(defaultUsername).isEmpty()) {
            Team team = teamService.getOrCreateDefaultTeam();
            userService.saveUser(
                    defaultUsername, defaultPassword, team, Role.ADMIN.getRoleId(), true);
            log.info("Default admin user created: {}", defaultUsername);
        }
    }

    private void initializeInternalApiUser()
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
            Team team = teamService.getOrCreateInternalTeam();
            userService.saveUser(
                    Role.INTERNAL_API_USER.getRoleId(),
                    UUID.randomUUID().toString(),
                    team,
                    Role.INTERNAL_API_USER.getRoleId(),
                    false);
            userService.addApiKeyToUser(Role.INTERNAL_API_USER.getRoleId());
            log.info("Internal API user created: {}", Role.INTERNAL_API_USER.getRoleId());
        } else {
            Optional<User> internalApiUserOpt =
                    userService.findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId());
            if (internalApiUserOpt.isPresent()) {
                User internalApiUser = internalApiUserOpt.get();
                // move to team internal API user
                if (!internalApiUser.getTeam().getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
                    log.info(
                            "Moving internal API user to team: {}", TeamService.INTERNAL_TEAM_NAME);
                    Team internalTeam = teamService.getOrCreateInternalTeam();

                    userService.changeUserTeam(internalApiUser, internalTeam);
                }
            }
        }
        userService.syncCustomApiUser(applicationProperties.getSecurity().getCustomGlobalAPIKey());
    }
}
