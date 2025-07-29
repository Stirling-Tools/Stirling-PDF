package stirling.software.proprietary.controller.api;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.common.model.FileInfo;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.oauth2.GitHubProvider;
import stirling.software.common.model.oauth2.GoogleProvider;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.dto.TeamWithUserCountDTO;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.SessionEntity;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.DatabaseService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

import static stirling.software.common.util.ProviderUtils.validateProvider;

@Slf4j
@RestController
@RequestMapping("/api/v1/proprietary/ui-data")
@Tag(name = "Proprietary UI Data", description = "APIs for React UI data (Proprietary features)")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class ProprietaryUIDataController {

    private final ApplicationProperties applicationProperties;
    private final AuditConfigurationProperties auditConfig;
    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final SessionRepository sessionRepository;
    private final DatabaseService databaseService;
    private final boolean runningEE;
    private final ObjectMapper objectMapper;


    @GetMapping("/audit-dashboard")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Get audit dashboard data")
    public ResponseEntity<AuditDashboardData> getAuditDashboardData() {
        AuditDashboardData data = new AuditDashboardData();
        data.setAuditEnabled(auditConfig.isEnabled());
        data.setAuditLevel(auditConfig.getAuditLevel());
        data.setAuditLevelInt(auditConfig.getLevel());
        data.setRetentionDays(auditConfig.getRetentionDays());
        data.setAuditLevels(AuditLevel.values());
        data.setAuditEventTypes(AuditEventType.values());
        
        return ResponseEntity.ok(data);
    }

    @GetMapping("/login")
    @Operation(summary = "Get login page data")
    public ResponseEntity<LoginData> getLoginData() {
        LoginData data = new LoginData();
        Map<String, String> providerList = new HashMap<>();
        Security securityProps = applicationProperties.getSecurity();
        OAUTH2 oauth = securityProps.getOauth2();

        if (oauth != null && oauth.getEnabled()) {
            if (oauth.isSettingsValid()) {
                String firstChar = String.valueOf(oauth.getProvider().charAt(0));
                String clientName = oauth.getProvider().replaceFirst(firstChar, firstChar.toUpperCase());
                providerList.put("/oauth2/authorization/" + oauth.getProvider(), clientName);
            }

            Client client = oauth.getClient();
            if (client != null) {
                GoogleProvider google = client.getGoogle();
                if (validateProvider(google)) {
                    providerList.put("/oauth2/authorization/" + google.getName(), google.getClientName());
                }

                GitHubProvider github = client.getGithub();
                if (validateProvider(github)) {
                    providerList.put("/oauth2/authorization/" + github.getName(), github.getClientName());
                }

                KeycloakProvider keycloak = client.getKeycloak();
                if (validateProvider(keycloak)) {
                    providerList.put("/oauth2/authorization/" + keycloak.getName(), keycloak.getClientName());
                }
            }
        }

        SAML2 saml2 = securityProps.getSaml2();
        if (securityProps.isSaml2Active() && 
            applicationProperties.getSystem().getEnableAlphaFunctionality() && 
            applicationProperties.getPremium().isEnabled()) {
            String samlIdp = saml2.getProvider();
            String saml2AuthenticationPath = "/saml2/authenticate/" + saml2.getRegistrationId();
            
            if (!applicationProperties.getPremium().getProFeatures().isSsoAutoLogin()) {
                providerList.put(saml2AuthenticationPath, samlIdp + " (SAML 2)");
            }
        }

        // Remove null entries
        providerList.entrySet().removeIf(entry -> entry.getKey() == null || entry.getValue() == null);
        
        data.setProviderList(providerList);
        data.setLoginMethod(securityProps.getLoginMethod());
        data.setAltLogin(!providerList.isEmpty() && securityProps.isAltLogin());
        
        return ResponseEntity.ok(data);
    }

    @GetMapping("/admin-settings")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @Operation(summary = "Get admin settings data")
    public ResponseEntity<AdminSettingsData> getAdminSettingsData(Authentication authentication) {
        List<User> allUsers = userRepository.findAllWithTeam();
        Iterator<User> iterator = allUsers.iterator();
        Map<String, String> roleDetails = Role.getAllRoleDetails();
        
        Map<String, Boolean> userSessions = new HashMap<>();
        Map<String, Date> userLastRequest = new HashMap<>();
        int activeUsers = 0;
        int disabledUsers = 0;
        
        while (iterator.hasNext()) {
            User user = iterator.next();
            if (user != null) {
                boolean shouldRemove = false;

                // Check if user is an INTERNAL_API_USER
                for (Authority authority : user.getAuthorities()) {
                    if (authority.getAuthority().equals(Role.INTERNAL_API_USER.getRoleId())) {
                        shouldRemove = true;
                        roleDetails.remove(Role.INTERNAL_API_USER.getRoleId());
                        break;
                    }
                }

                // Check if user is part of the Internal team
                if (user.getTeam() != null && user.getTeam().getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
                    shouldRemove = true;
                }

                if (shouldRemove) {
                    iterator.remove();
                    continue;
                }
                
                // Session status and last request time
                int maxInactiveInterval = sessionPersistentRegistry.getMaxInactiveInterval();
                boolean hasActiveSession = false;
                Date lastRequest = null;
                Optional<SessionEntity> latestSession = sessionPersistentRegistry.findLatestSession(user.getUsername());
                
                if (latestSession.isPresent()) {
                    SessionEntity sessionEntity = latestSession.get();
                    Date lastAccessedTime = sessionEntity.getLastRequest();
                    Instant now = Instant.now();
                    Instant expirationTime = lastAccessedTime.toInstant().plus(maxInactiveInterval, ChronoUnit.SECONDS);
                    
                    if (now.isAfter(expirationTime)) {
                        sessionPersistentRegistry.expireSession(sessionEntity.getSessionId());
                    } else {
                        hasActiveSession = !sessionEntity.isExpired();
                    }
                    lastRequest = sessionEntity.getLastRequest();
                } else {
                    lastRequest = new Date(0);
                }
                
                userSessions.put(user.getUsername(), hasActiveSession);
                userLastRequest.put(user.getUsername(), lastRequest);
                
                if (hasActiveSession) activeUsers++;
                if (!user.isEnabled()) disabledUsers++;
            }
        }
        
        // Sort users by active status and last request date
        List<User> sortedUsers = allUsers.stream()
                .sorted((u1, u2) -> {
                    boolean u1Active = userSessions.get(u1.getUsername());
                    boolean u2Active = userSessions.get(u2.getUsername());
                    if (u1Active && !u2Active) return -1;
                    if (!u1Active && u2Active) return 1;
                    
                    Date u1LastRequest = userLastRequest.getOrDefault(u1.getUsername(), new Date(0));
                    Date u2LastRequest = userLastRequest.getOrDefault(u2.getUsername(), new Date(0));
                    return u2LastRequest.compareTo(u1LastRequest);
                })
                .toList();

        List<Team> allTeams = teamRepository.findAll().stream()
                .filter(team -> !team.getName().equals(TeamService.INTERNAL_TEAM_NAME))
                .toList();
        
        AdminSettingsData data = new AdminSettingsData();
        data.setUsers(sortedUsers);
        data.setCurrentUsername(authentication.getName());
        data.setRoleDetails(roleDetails);
        data.setUserSessions(userSessions);
        data.setUserLastRequest(userLastRequest);
        data.setTotalUsers(allUsers.size());
        data.setActiveUsers(activeUsers);
        data.setDisabledUsers(disabledUsers);
        data.setTeams(allTeams);
        data.setMaxPaidUsers(applicationProperties.getPremium().getMaxUsers());
        
        return ResponseEntity.ok(data);
    }

    @GetMapping("/account")
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    @Operation(summary = "Get account page data")
    public ResponseEntity<AccountData> getAccountData(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(401).build();
        }
        
        Object principal = authentication.getPrincipal();
        String username = null;
        boolean isOAuth2Login = false;
        boolean isSaml2Login = false;

        if (principal instanceof UserDetails detailsUser) {
            username = detailsUser.getUsername();
        } else if (principal instanceof OAuth2User oAuth2User) {
            username = oAuth2User.getName();
            isOAuth2Login = true;
        } else if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2User) {
            username = saml2User.name();
            isSaml2Login = true;
        }
        
        if (username == null) {
            return ResponseEntity.status(401).build();
        }
        
        Optional<User> user = userRepository.findByUsernameIgnoreCaseWithSettings(username);
        if (user.isEmpty()) {
            return ResponseEntity.status(404).build();
        }
        
        String settingsJson;
        try {
            settingsJson = objectMapper.writeValueAsString(user.get().getSettings());
        } catch (JsonProcessingException e) {
            log.error("Error converting settings map", e);
            return ResponseEntity.status(500).build();
        }
        
        AccountData data = new AccountData();
        data.setUsername(username);
        data.setRole(user.get().getRolesAsString());
        data.setSettings(settingsJson);
        data.setChangeCredsFlag(user.get().isFirstLogin());
        data.setOAuth2Login(isOAuth2Login);
        data.setSaml2Login(isSaml2Login);
        
        return ResponseEntity.ok(data);
    }

    @GetMapping("/teams")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @Operation(summary = "Get teams list data")
    public ResponseEntity<TeamsData> getTeamsData() {
        List<TeamWithUserCountDTO> allTeamsWithCounts = teamRepository.findAllTeamsWithUserCount();
        List<TeamWithUserCountDTO> teamsWithCounts = allTeamsWithCounts.stream()
                .filter(team -> !team.getName().equals(TeamService.INTERNAL_TEAM_NAME))
                .toList();

        List<Object[]> teamActivities = sessionRepository.findLatestActivityByTeam();
        Map<Long, Date> teamLastRequest = new HashMap<>();
        for (Object[] result : teamActivities) {
            Long teamId = (Long) result[0];
            Date lastActivity = (Date) result[1];
            teamLastRequest.put(teamId, lastActivity);
        }
        
        TeamsData data = new TeamsData();
        data.setTeamsWithCounts(teamsWithCounts);
        data.setTeamLastRequest(teamLastRequest);
        
        return ResponseEntity.ok(data);
    }

    @GetMapping("/teams/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @Operation(summary = "Get team details data")
    public ResponseEntity<TeamDetailsData> getTeamDetailsData(@PathVariable("id") Long id) {
        Team team = teamRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Team not found"));

        if (team.getName().equals(TeamService.INTERNAL_TEAM_NAME)) {
            return ResponseEntity.status(403).build();
        }

        List<User> teamUsers = userRepository.findAllByTeamId(id);
        List<User> allUsers = userRepository.findAllWithTeam();
        List<User> availableUsers = allUsers.stream()
                .filter(user -> (user.getTeam() == null || !user.getTeam().getId().equals(id)) &&
                               (user.getTeam() == null || !user.getTeam().getName().equals(TeamService.INTERNAL_TEAM_NAME)))
                .toList();

        List<Object[]> userSessions = sessionRepository.findLatestSessionByTeamId(id);
        Map<String, Date> userLastRequest = new HashMap<>();
        for (Object[] result : userSessions) {
            String username = (String) result[0];
            Date lastRequest = (Date) result[1];
            userLastRequest.put(username, lastRequest);
        }
        
        TeamDetailsData data = new TeamDetailsData();
        data.setTeam(team);
        data.setTeamUsers(teamUsers);
        data.setAvailableUsers(availableUsers);
        data.setUserLastRequest(userLastRequest);
        
        return ResponseEntity.ok(data);
    }

    @GetMapping("/database")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @Operation(summary = "Get database management data")
    public ResponseEntity<DatabaseData> getDatabaseData() {
        List<FileInfo> backupList = databaseService.getBackupList();
        String dbVersion = databaseService.getH2Version();
        boolean isVersionUnknown = "Unknown".equalsIgnoreCase(dbVersion);
        
        DatabaseData data = new DatabaseData();
        data.setBackupFiles(backupList);
        data.setDatabaseVersion(dbVersion);
        data.setVersionUnknown(isVersionUnknown);
        
        return ResponseEntity.ok(data);
    }

    // Data classes
    @Data
    public static class AuditDashboardData {
        private boolean auditEnabled;
        private AuditLevel auditLevel;
        private int auditLevelInt;
        private int retentionDays;
        private AuditLevel[] auditLevels;
        private AuditEventType[] auditEventTypes;
    }

    @Data
    public static class LoginData {
        private Map<String, String> providerList;
        private String loginMethod;
        private boolean altLogin;
    }

    @Data
    public static class AdminSettingsData {
        private List<User> users;
        private String currentUsername;
        private Map<String, String> roleDetails;
        private Map<String, Boolean> userSessions;
        private Map<String, Date> userLastRequest;
        private int totalUsers;
        private int activeUsers;
        private int disabledUsers;
        private List<Team> teams;
        private int maxPaidUsers;
    }

    @Data
    public static class AccountData {
        private String username;
        private String role;
        private String settings;
        private boolean changeCredsFlag;
        private boolean oAuth2Login;
        private boolean saml2Login;
    }

    @Data
    public static class TeamsData {
        private List<TeamWithUserCountDTO> teamsWithCounts;
        private Map<Long, Date> teamLastRequest;
    }

    @Data
    public static class TeamDetailsData {
        private Team team;
        private List<User> teamUsers;
        private List<User> availableUsers;
        private Map<String, Date> userLastRequest;
    }

    @Data
    public static class DatabaseData {
        private List<FileInfo> backupFiles;
        private String databaseVersion;
        private boolean versionUnknown;
    }
}