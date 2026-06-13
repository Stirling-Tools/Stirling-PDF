package stirling.software.proprietary.controller.api;

import static stirling.software.common.util.ProviderUtils.validateProvider;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;

import io.quarkus.security.identity.SecurityIdentity;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
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
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.annotation.DenyDemoUser;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.SessionEntity;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.dto.AdminUserSummary;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@ApplicationScoped
@Path("/api/v1/proprietary/ui-data")
@ProprietaryUiDataApi
public class ProprietaryUIDataController {

    private final ApplicationProperties applicationProperties;
    private final AuditConfigurationProperties auditConfig;
    private final SessionPersistentRegistry sessionPersistentRegistry;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final SessionRepository sessionRepository;
    private final DatabaseServiceInterface databaseService;
    private final boolean runningEE;
    private final ObjectMapper objectMapper;
    private final UserLicenseSettingsService licenseSettingsService;
    private final PersistentAuditEventRepository auditRepository;
    private final MfaService mfaService;
    private final LoginAttemptService loginAttemptService;

    @Inject SecurityIdentity securityIdentity;

    @Inject
    public ProprietaryUIDataController(
            ApplicationProperties applicationProperties,
            AuditConfigurationProperties auditConfig,
            SessionPersistentRegistry sessionPersistentRegistry,
            UserRepository userRepository,
            TeamRepository teamRepository,
            SessionRepository sessionRepository,
            DatabaseServiceInterface databaseService,
            ObjectMapper objectMapper,
            @Named("runningEE") boolean runningEE,
            UserLicenseSettingsService licenseSettingsService,
            PersistentAuditEventRepository auditRepository,
            MfaService mfaService,
            LoginAttemptService loginAttemptService) {
        this.applicationProperties = applicationProperties;
        this.auditConfig = auditConfig;
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
        this.sessionRepository = sessionRepository;
        this.databaseService = databaseService;
        this.objectMapper = objectMapper;
        this.runningEE = runningEE;
        this.licenseSettingsService = licenseSettingsService;
        this.auditRepository = auditRepository;
        this.mfaService = mfaService;
        this.loginAttemptService = loginAttemptService;
    }

    /**
     * Get the backend base URL for SAML/OAuth redirects. Uses system.backendUrl from config if set,
     * otherwise defaults to http://localhost:8080
     */
    private String getBackendBaseUrl() {
        String backendUrl = applicationProperties.getSystem().getBackendUrl();

        // If backendUrl is configured, use it
        if (backendUrl != null && !backendUrl.trim().isEmpty()) {
            return backendUrl.trim();
        }

        // For development, default to localhost:8080 (backend port)
        return "http://localhost:8080";
    }

    @GET
    @Path("/audit-dashboard")
    @RolesAllowed("ADMIN")
    @EnterpriseEndpoint
    @Operation(summary = "Get audit dashboard data")
    public Response getAuditDashboardData() {
        AuditDashboardData data = new AuditDashboardData();
        data.setAuditEnabled(auditConfig.isEnabled());
        data.setAuditLevel(auditConfig.getAuditLevel());
        data.setAuditLevelInt(auditConfig.getLevel());
        data.setRetentionDays(auditConfig.getRetentionDays());
        data.setAuditLevels(AuditLevel.values());
        data.setAuditEventTypes(AuditEventType.values());
        // Metadata capture settings (independent flags)
        data.setCaptureFileHash(auditConfig.isCaptureFileHash());
        data.setCapturePdfAuthor(auditConfig.isCapturePdfAuthor());
        data.setCaptureOperationResults(auditConfig.isCaptureOperationResults());
        // pdfMetadataEnabled: true if any metadata flag is enabled (file hash or PDF author)
        data.setPdfMetadataEnabled(
                auditConfig.isCaptureFileHash() || auditConfig.isCapturePdfAuthor());

        return Response.ok(data).build();
    }

    @GET
    @Path("/login")
    @Operation(summary = "Get login page data")
    public Response getLoginData() {
        LoginData data = new LoginData();
        Map<String, String> providerList = new HashMap<>();
        Security securityProps = applicationProperties.getSecurity();

        // Add enableLogin flag so frontend doesn't need to call /app-config
        data.setEnableLogin(securityProps.isEnableLogin());
        data.setSsoAutoLogin(applicationProperties.getPremium().getProFeatures().isSsoAutoLogin());

        // Check if this is first-time setup with default credentials
        // The isFirstLogin flag captures: default username/password usage and unchanged state
        boolean isFirstTimeSetup = false;
        boolean showDefaultCredentials = false;

        List<User> allUsers = userRepository.findAll().list();
        List<User> realUsers =
                allUsers.stream()
                        .filter(
                                user ->
                                        !Role.INTERNAL_API_USER
                                                .getRoleId()
                                                .equals(user.getUsername()))
                        .toList();
        long userCount = realUsers.size();

        if (userCount == 0) {
            isFirstTimeSetup = true;
            showDefaultCredentials = true;
        } else if (userCount == 1) {
            Optional<User> adminUser = userRepository.findByUsernameIgnoreCase("admin");

            if (adminUser.isPresent() && Boolean.TRUE.equals(adminUser.get().getIsFirstLogin())) {
                isFirstTimeSetup = true;
                showDefaultCredentials = true;
            }
        }

        data.setFirstTimeSetup(isFirstTimeSetup);
        data.setShowDefaultCredentials(showDefaultCredentials);

        OAUTH2 oauth = securityProps.getOauth2();

        // Only add OAuth2 providers if loginMethod allows it
        if (oauth != null
                && oauth.getEnabled()
                && securityProps.isOauth2Active()) { // This checks loginMethod
            if (oauth.isSettingsValid()) {
                String firstChar = String.valueOf(oauth.getProvider().charAt(0));
                String clientName =
                        oauth.getProvider().replaceFirst(firstChar, firstChar.toUpperCase());
                providerList.put("/oauth2/authorization/" + oauth.getProvider(), clientName);
            }

            Client client = oauth.getClient();
            if (client != null) {
                GoogleProvider google = client.getGoogle();
                if (validateProvider(google)) {
                    providerList.put(
                            "/oauth2/authorization/" + google.getName(), google.getClientName());
                }

                GitHubProvider github = client.getGithub();
                if (validateProvider(github)) {
                    providerList.put(
                            "/oauth2/authorization/" + github.getName(), github.getClientName());
                }

                KeycloakProvider keycloak = client.getKeycloak();
                if (validateProvider(keycloak)) {
                    providerList.put(
                            "/oauth2/authorization/" + keycloak.getName(),
                            keycloak.getClientName());
                }
            }

            // The detailed Keycloak provider config (issuer/clientId/clientSecret) is read directly
            // from MicroProfile config by the custom OAuth2 flow (OAuth2LoginController /
            // OAuth2CallbackServlet) rather than bound into ApplicationProperties, so the
            // object-tree
            // checks above never see it. Detect it from config the same way the flow does -
            // otherwise
            // the login page offers no SSO button even though the backend is fully wired for the
            // round-trip.
            Config mpConfig = ConfigProvider.getConfig();
            if (nonBlank(mpConfig, "security.oauth2.client.keycloak.issuer")
                    && nonBlank(mpConfig, "security.oauth2.client.keycloak.clientId")) {
                String keycloakName =
                        mpConfig.getOptionalValue(
                                        "security.oauth2.client.keycloak.clientName", String.class)
                                .filter(name -> !name.isBlank())
                                .orElse("Keycloak");
                providerList.putIfAbsent("/oauth2/authorization/keycloak", keycloakName);
            }
        }

        SAML2 saml2 = securityProps.getSaml2();
        // Only add SAML2 providers if loginMethod allows it
        if (securityProps.isSaml2Active() && applicationProperties.getPremium().isEnabled()) {
            String samlIdp = saml2.getProvider();
            String saml2AuthenticationPath = "/saml2/authenticate/" + saml2.getRegistrationId();

            // For SAML, we need to use the backend URL directly, not a relative path
            // This ensures Spring Security generates the correct ACS URL
            String backendUrl = getBackendBaseUrl();
            String fullSamlPath = backendUrl + saml2AuthenticationPath;

            providerList.put(fullSamlPath, samlIdp + " (SAML 2)");
        }

        // Remove null entries
        providerList
                .entrySet()
                .removeIf(entry -> entry.getKey() == null || entry.getValue() == null);

        data.setProviderList(providerList);
        data.setLoginMethod(securityProps.getLoginMethod());
        data.setAltLogin(!providerList.isEmpty() && securityProps.isAltLogin());

        // Add language configuration for login page
        data.setLanguages(applicationProperties.getUi().getLanguages());
        data.setDefaultLocale(applicationProperties.getSystem().getDefaultLocale());

        return Response.ok(data).build();
    }

    private static boolean nonBlank(Config config, String key) {
        return config.getOptionalValue(key, String.class)
                .filter(value -> !value.isBlank())
                .isPresent();
    }

    @GET
    @Path("/admin-settings")
    @RolesAllowed("ADMIN")
    @Operation(summary = "Get admin settings data")
    public Response getAdminSettingsData() {
        List<User> allUsers = userRepository.findAllWithTeam();
        Iterator<User> iterator = allUsers.iterator();
        Map<String, String> roleDetails = Role.getAllRoleDetails();

        Map<String, Boolean> userSessions = new HashMap<>();
        Map<String, Date> userLastRequest = new HashMap<>();
        Map<String, Map<String, String>> userSettings = new HashMap<>();
        int activeUsers = 0;
        int disabledUsers = 0;

        while (iterator.hasNext()) {
            User user = iterator.next();
            if (user != null) {
                String username = user.getUsername();
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
                if (user.getTeam() != null
                        && TeamService.INTERNAL_TEAM_NAME.equals(user.getTeam().getName())) {
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
                Optional<SessionEntity> latestSession =
                        sessionPersistentRegistry.findLatestSession(username);

                if (latestSession.isPresent()) {
                    SessionEntity sessionEntity = latestSession.get();
                    Instant lastAccessedTime =
                            Optional.ofNullable(sessionEntity.getLastRequest())
                                    .orElse(Instant.EPOCH);
                    Instant now = Instant.now();
                    Instant expirationTime =
                            lastAccessedTime.plus(maxInactiveInterval, ChronoUnit.SECONDS);

                    if (now.isAfter(expirationTime)) {
                        sessionPersistentRegistry.expireSession(sessionEntity.getSessionId());
                    } else {
                        hasActiveSession = !sessionEntity.isExpired();
                    }
                    lastRequest = Date.from(lastAccessedTime);
                } else {
                    lastRequest = new Date(0);
                }

                User userWithSettings =
                        userRepository.findByIdWithSettings(user.getId()).orElse(user);

                // Mask mfaSecret if present in settings
                Map<String, String> originalSettings = userWithSettings.getSettings();
                Map<String, String> settingsCopy =
                        originalSettings != null
                                ? new HashMap<>(originalSettings)
                                : new HashMap<>();
                if (settingsCopy.containsKey("mfaSecret")) {
                    settingsCopy.put("mfaSecret", "********");
                }
                userSettings.put(username, settingsCopy);
                userSessions.put(username, hasActiveSession);
                userLastRequest.put(username, lastRequest);

                if (hasActiveSession) activeUsers++;
                if (!user.isEnabled()) disabledUsers++;
            }
        }

        // Sort users by active status and last request date
        List<User> sortedUsers =
                allUsers.stream()
                        .sorted(
                                (u1, u2) -> {
                                    boolean u1Active = userSessions.get(u1.getUsername());
                                    boolean u2Active = userSessions.get(u2.getUsername());
                                    if (u1Active && !u2Active) return -1;
                                    if (!u1Active && u2Active) return 1;

                                    Date u1LastRequest =
                                            userLastRequest.getOrDefault(
                                                    u1.getUsername(), new Date(0));
                                    Date u2LastRequest =
                                            userLastRequest.getOrDefault(
                                                    u2.getUsername(), new Date(0));
                                    return u2LastRequest.compareTo(u1LastRequest);
                                })
                        .toList();

        List<Team> allTeams =
                teamRepository.findAll().stream()
                        .filter(team -> !TeamService.INTERNAL_TEAM_NAME.equals(team.getName()))
                        .toList();

        // Calculate license limits
        int maxAllowedUsers = licenseSettingsService.calculateMaxAllowedUsers();
        long availableSlots = licenseSettingsService.getAvailableUserSlots();
        int grandfatheredCount = licenseSettingsService.getDisplayGrandfatheredCount();
        int licenseMaxUsers = licenseSettingsService.getSettings().getLicenseMaxUsers();
        boolean premiumEnabled = applicationProperties.getPremium().isEnabled();

        // Convert User entities to AdminUserSummary DTOs to exclude sensitive fields
        List<AdminUserSummary> userSummaries =
                sortedUsers.stream().map(this::convertUserToSummary).toList();

        AdminSettingsData data = new AdminSettingsData();
        data.setUsers(userSummaries);
        data.setCurrentUsername(securityIdentity.getPrincipal().getName());
        data.setRoleDetails(roleDetails);
        data.setUserSessions(userSessions);
        data.setUserLastRequest(userLastRequest);
        data.setTotalUsers(allUsers.size());
        data.setActiveUsers(activeUsers);
        data.setDisabledUsers(disabledUsers);
        data.setTeams(allTeams);
        data.setMaxPaidUsers(applicationProperties.getPremium().getMaxUsers());
        data.setMaxAllowedUsers(maxAllowedUsers);
        data.setAvailableSlots(availableSlots);
        data.setGrandfatheredUserCount(grandfatheredCount);
        data.setLicenseMaxUsers(licenseMaxUsers);
        data.setPremiumEnabled(premiumEnabled);
        data.setMailEnabled(applicationProperties.getMail().isEnabled());
        data.setUserSettings(userSettings);
        data.setLockedUsers(loginAttemptService.getAllBlockedUsers());

        return Response.ok(data).build();
    }

    @GET
    @Path("/account")
    @DenyDemoUser
    @Operation(summary = "Get account page data")
    public Response getAccountData() {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }

        // TODO: Migration required - Spring distinguished UserDetails / OAuth2User /
        // CustomSaml2AuthenticatedPrincipal off authentication.getPrincipal() to set the
        // oAuth2Login / saml2Login flags. Under Quarkus the auth mechanism is exposed via
        // SecurityIdentity attributes (e.g. quarkus-oidc IdToken / SAML augmentor). Until OAuth2/
        // SAML are wired to quarkus-oidc, only the username is resolved and the login-type flags
        // default to false.
        String username = securityIdentity.getPrincipal().getName();
        boolean isOAuth2Login = false;
        boolean isSaml2Login = false;

        if (username == null) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }

        Optional<User> user = userRepository.findByUsernameIgnoreCaseWithSettings(username);
        if (user.isEmpty()) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }

        String settingsJson;
        try {
            settingsJson = objectMapper.writeValueAsString(user.get().getSettings());
        } catch (JacksonException e) {
            log.error("Error converting settings map", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }

        AccountData data = new AccountData();
        data.setUsername(username);
        data.setRole(user.get().getRolesAsString());
        data.setSettings(settingsJson);
        data.setChangeCredsFlag(user.get().isFirstLogin() || user.get().isForcePasswordChange());
        data.setOAuth2Login(isOAuth2Login);
        data.setSaml2Login(isSaml2Login);
        data.setMfaEnabled(mfaService.isMfaEnabled(user.get()));
        data.setMfaRequired(mfaService.isMfaRequired(user.get()));

        return Response.ok(data).build();
    }

    @GET
    @Path("/teams")
    @RolesAllowed("ADMIN")
    @Operation(summary = "Get teams list data")
    public Response getTeamsData() {
        List<TeamWithUserCountDTO> allTeamsWithCounts = teamRepository.findAllTeamsWithUserCount();
        List<TeamWithUserCountDTO> teamsWithCounts =
                allTeamsWithCounts.stream()
                        .filter(team -> !TeamService.INTERNAL_TEAM_NAME.equals(team.getName()))
                        .toList();

        List<Object[]> teamActivities = sessionRepository.findLatestActivityByTeam();
        Map<Long, Date> teamLastRequest = new HashMap<>();
        for (Object[] result : teamActivities) {
            Long teamId = (Long) result[0];
            Instant instant = (Instant) result[1];
            Date lastActivity = instant != null ? Date.from(instant) : null;
            teamLastRequest.put(teamId, lastActivity);
        }

        TeamsData data = new TeamsData();
        data.setTeamsWithCounts(teamsWithCounts);
        data.setTeamLastRequest(teamLastRequest);

        return Response.ok(data).build();
    }

    @GET
    @Path("/teams/{id}")
    @RolesAllowed("ADMIN")
    @Operation(summary = "Get team details data")
    public Response getTeamDetailsData(@PathParam("id") Long id) {
        Team team =
                teamRepository
                        .findByIdOptional(id)
                        .orElseThrow(() -> new RuntimeException("Team not found"));

        if (TeamService.INTERNAL_TEAM_NAME.equals(team.getName())) {
            return Response.status(Response.Status.FORBIDDEN).build();
        }

        List<User> teamUsers = userRepository.findAllByTeamId(id);
        List<User> allUsers = userRepository.findAllWithTeam();
        List<User> availableUsers =
                allUsers.stream()
                        .filter(
                                user ->
                                        (user.getTeam() == null
                                                        || !user.getTeam().getId().equals(id))
                                                && (user.getTeam() == null
                                                        || !TeamService.INTERNAL_TEAM_NAME.equals(
                                                                user.getTeam().getName())))
                        .toList();

        List<Object[]> userSessions = sessionRepository.findLatestSessionByTeamId(id);
        Map<String, Date> userLastRequest = new HashMap<>();
        for (Object[] result : userSessions) {
            String username = (String) result[0];
            Instant instant = (Instant) result[1];
            Date lastRequest = instant != null ? Date.from(instant) : null;
            userLastRequest.put(username, lastRequest);
        }

        TeamDetailsData data = new TeamDetailsData();
        data.setTeam(team);
        data.setTeamUsers(teamUsers);
        data.setAvailableUsers(availableUsers);
        data.setUserLastRequest(userLastRequest);

        return Response.ok(data).build();
    }

    @GET
    @Path("/database")
    @RolesAllowed("ADMIN")
    @Operation(summary = "Get database management data")
    public Response getDatabaseData() {
        List<FileInfo> backupList = databaseService.getBackupList();
        String dbVersion = databaseService.getH2Version();
        boolean isVersionUnknown = "Unknown".equalsIgnoreCase(dbVersion);

        DatabaseData data = new DatabaseData();
        data.setBackupFiles(backupList);
        data.setDatabaseVersion(dbVersion);
        data.setVersionUnknown(isVersionUnknown);

        return Response.ok(data).build();
    }

    /**
     * Convert User entity to AdminUserSummary DTO, excluding sensitive fields like password and
     * apiKey.
     */
    private AdminUserSummary convertUserToSummary(User user) {
        AdminUserSummary summary = new AdminUserSummary();
        summary.setId(user.getId());
        summary.setUsername(user.getUsername());
        summary.setEmail(user.getUsername()); // Use username as email for consistency
        summary.setRoleName(user.getRoleName());
        summary.setRolesAsString(user.getRolesAsString());
        summary.setEnabled(user.isEnabled());
        summary.setIsFirstLogin(user.isFirstLogin());
        summary.setAuthenticationType(user.getAuthenticationType());
        summary.setCreatedAt(user.getCreatedAt());
        summary.setUpdatedAt(user.getUpdatedAt());

        // Map team if present
        if (user.getTeam() != null) {
            AdminUserSummary.TeamSummary teamSummary = new AdminUserSummary.TeamSummary();
            teamSummary.setId(user.getTeam().getId());
            teamSummary.setName(user.getTeam().getName());
            summary.setTeam(teamSummary);
        }

        return summary;
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
        private boolean pdfMetadataEnabled;
        private boolean captureFileHash;
        private boolean capturePdfAuthor;
        private boolean captureOperationResults;
    }

    @Data
    public static class LoginData {
        private Boolean enableLogin;
        private boolean ssoAutoLogin;
        private Map<String, String> providerList;
        private String loginMethod;
        private boolean altLogin;
        private boolean firstTimeSetup;
        private boolean showDefaultCredentials;
        private List<String> languages;
        private String defaultLocale;
    }

    @Data
    public static class AdminSettingsData {
        private List<AdminUserSummary> users;
        private String currentUsername;
        private Map<String, String> roleDetails;
        private Map<String, Boolean> userSessions;
        private Map<String, Date> userLastRequest;
        private int totalUsers;
        private int activeUsers;
        private int disabledUsers;
        private List<Team> teams;
        private int maxPaidUsers;
        private int maxAllowedUsers;
        private long availableSlots;
        private int grandfatheredUserCount;
        private int licenseMaxUsers;
        private boolean premiumEnabled;
        private boolean mailEnabled;
        private Map<String, Map<String, String>> userSettings;
        private List<String> lockedUsers;
    }

    @Data
    public static class AccountData {
        private String username;
        private String role;
        private String settings;
        private boolean changeCredsFlag;
        private boolean oAuth2Login;
        private boolean saml2Login;
        private boolean mfaEnabled;
        private boolean mfaRequired;
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
