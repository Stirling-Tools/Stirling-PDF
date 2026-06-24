package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.AccountData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.AdminSettingsData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.AuditDashboardData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.LoginData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.TeamDetailsData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.TeamsData;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.model.dto.TeamWithUserCountDTO;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("ProprietaryUIDataController (additional coverage)")
class ProprietaryUIDataControllerMoreTest {

    @Mock private SessionPersistentRegistry sessionPersistentRegistry;
    @Mock private UserRepository userRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private SessionRepository sessionRepository;
    @Mock private DatabaseServiceInterface databaseService;
    @Mock private UserLicenseSettingsService licenseSettingsService;
    @Mock private PersistentAuditEventRepository auditRepository;
    @Mock private MfaService mfaService;
    @Mock private LoginAttemptService loginAttemptService;

    private ApplicationProperties applicationProperties;
    private AuditConfigurationProperties auditConfig;
    private ObjectMapper objectMapper;

    private ProprietaryUIDataController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getUi().setLanguages(List.of("en", "de"));
        applicationProperties.getSystem().setDefaultLocale("en");
        applicationProperties.getSecurity().setEnableLogin(true);

        auditConfig = new AuditConfigurationProperties(applicationProperties);
        objectMapper = JsonMapper.builder().build();

        controller =
                new ProprietaryUIDataController(
                        applicationProperties,
                        auditConfig,
                        sessionPersistentRegistry,
                        userRepository,
                        teamRepository,
                        sessionRepository,
                        databaseService,
                        objectMapper,
                        false,
                        licenseSettingsService,
                        auditRepository,
                        mfaService,
                        loginAttemptService);
    }

    private static User normalUser(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        Authority authority = new Authority();
        authority.setAuthority(Role.USER.getRoleId());
        user.addAuthority(authority);
        return user;
    }

    @Nested
    @DisplayName("getAuditDashboardData")
    class AuditDashboard {

        @Test
        @DisplayName("returns audit configuration snapshot")
        void returnsSnapshot() {
            ResponseEntity<AuditDashboardData> response = controller.getAuditDashboardData();

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            AuditDashboardData data = response.getBody();
            assertThat(data.getAuditLevels()).isNotEmpty();
            assertThat(data.getAuditEventTypes()).isNotEmpty();
            // pdfMetadataEnabled mirrors file-hash or pdf-author capture flags
            assertThat(data.isPdfMetadataEnabled())
                    .isEqualTo(auditConfig.isCaptureFileHash() || auditConfig.isCapturePdfAuthor());
        }
    }

    @Nested
    @DisplayName("getLoginData")
    class Login {

        @Test
        @DisplayName("flags first-time setup when only the admin exists with first-login")
        void singleAdminFirstLogin() {
            User admin = normalUser(1L, "admin");
            admin.setFirstLogin(true);
            when(userRepository.findAll()).thenReturn(List.of(admin));
            when(userRepository.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(admin));

            ResponseEntity<LoginData> response = controller.getLoginData();

            LoginData data = response.getBody();
            assertThat(data.isFirstTimeSetup()).isTrue();
            assertThat(data.isShowDefaultCredentials()).isTrue();
        }

        @Test
        @DisplayName("does not flag setup when a normal user exists")
        void normalUserNoSetup() {
            when(userRepository.findAll()).thenReturn(List.of(normalUser(1L, "bob")));

            ResponseEntity<LoginData> response = controller.getLoginData();

            LoginData data = response.getBody();
            assertThat(data.isFirstTimeSetup()).isFalse();
            assertThat(data.getProviderList()).isEmpty();
        }
    }

    @Nested
    @DisplayName("getAccountData")
    class Account {

        @Test
        @DisplayName("returns 401 when authentication is null")
        void nullAuth() {
            ResponseEntity<AccountData> response = controller.getAccountData(null);

            assertThat(response.getStatusCode().value()).isEqualTo(401);
        }

        @Test
        @DisplayName("returns 401 when principal type is unrecognized")
        void unknownPrincipal() {
            Authentication auth =
                    new UsernamePasswordAuthenticationToken("plain-string", null, List.of());

            ResponseEntity<AccountData> response = controller.getAccountData(auth);

            assertThat(response.getStatusCode().value()).isEqualTo(401);
        }

        @Test
        @DisplayName("returns 404 when the user is not found")
        void userNotFound() {
            User user = normalUser(1L, "ghost@example.com");
            when(userRepository.findByUsernameIgnoreCaseWithSettings("ghost@example.com"))
                    .thenReturn(Optional.empty());
            Authentication auth =
                    new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());

            ResponseEntity<AccountData> response = controller.getAccountData(auth);

            assertThat(response.getStatusCode().value()).isEqualTo(404);
        }

        @Test
        @DisplayName("resolves an OAuth2 principal and flags oauth login")
        void oauth2Principal() {
            User user = normalUser(2L, "oauthuser");
            user.setSettings(Map.of("k", "v"));
            when(userRepository.findByUsernameIgnoreCaseWithSettings("oauthuser"))
                    .thenReturn(Optional.of(user));
            lenient().when(mfaService.isMfaEnabled(user)).thenReturn(false);
            lenient().when(mfaService.isMfaRequired(user)).thenReturn(false);

            OAuth2User oAuth2User =
                    new DefaultOAuth2User(List.of(), Map.of("sub", "oauthuser"), "sub");
            Authentication auth =
                    new UsernamePasswordAuthenticationToken(oAuth2User, null, List.of());

            ResponseEntity<AccountData> response = controller.getAccountData(auth);

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            assertThat(response.getBody().isOAuth2Login()).isTrue();
        }

        @Test
        @DisplayName("resolves a SAML2 principal and flags saml login")
        void saml2Principal() {
            User user = normalUser(3L, "samluser");
            when(userRepository.findByUsernameIgnoreCaseWithSettings("samluser"))
                    .thenReturn(Optional.of(user));
            lenient().when(mfaService.isMfaEnabled(user)).thenReturn(false);
            lenient().when(mfaService.isMfaRequired(user)).thenReturn(false);

            CustomSaml2AuthenticatedPrincipal principal =
                    new CustomSaml2AuthenticatedPrincipal(
                            "samluser", Map.of(), "nameId", List.of());
            Authentication auth =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of());

            ResponseEntity<AccountData> response = controller.getAccountData(auth);

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            assertThat(response.getBody().isSaml2Login()).isTrue();
        }
    }

    @Nested
    @DisplayName("getAdminSettingsData")
    class AdminSettings {

        @Test
        @DisplayName("aggregates users, teams and license limits")
        void aggregates() {
            User user = normalUser(1L, "bob");
            when(userRepository.findAllWithTeam())
                    .thenReturn(new java.util.ArrayList<>(List.of(user)));
            when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(3600);
            when(sessionPersistentRegistry.findLatestSession("bob")).thenReturn(Optional.empty());
            when(userRepository.findByIdWithSettings(1L)).thenReturn(Optional.of(user));
            when(teamRepository.findAll()).thenReturn(List.of());

            when(licenseSettingsService.calculateMaxAllowedUsers()).thenReturn(10);
            when(licenseSettingsService.getAvailableUserSlots()).thenReturn(5L);
            when(licenseSettingsService.getDisplayGrandfatheredCount()).thenReturn(0);
            UserLicenseSettings settings = org.mockito.Mockito.mock(UserLicenseSettings.class);
            when(settings.getLicenseMaxUsers()).thenReturn(10);
            when(licenseSettingsService.getSettings()).thenReturn(settings);
            when(loginAttemptService.getAllBlockedUsers()).thenReturn(List.of());

            Authentication auth = new UsernamePasswordAuthenticationToken("bob", null, List.of());

            ResponseEntity<AdminSettingsData> response = controller.getAdminSettingsData(auth);

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            AdminSettingsData data = response.getBody();
            assertThat(data.getCurrentUsername()).isEqualTo("bob");
            assertThat(data.getTotalUsers()).isEqualTo(1);
            assertThat(data.getUsers()).hasSize(1);
            assertThat(data.getMaxAllowedUsers()).isEqualTo(10);
        }
    }

    @Nested
    @DisplayName("getTeamsData")
    class Teams {

        @Test
        @DisplayName("returns non-internal teams with counts and last activity")
        void returnsTeams() {
            TeamWithUserCountDTO team = new TeamWithUserCountDTO(1L, "Engineering", 4L);
            when(teamRepository.findAllTeamsWithUserCount()).thenReturn(List.of(team));
            when(sessionRepository.findLatestActivityByTeam()).thenReturn(Collections.emptyList());

            ResponseEntity<TeamsData> response = controller.getTeamsData();

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            assertThat(response.getBody().getTeamsWithCounts()).hasSize(1);
        }
    }

    @Nested
    @DisplayName("getTeamDetailsData")
    class TeamDetails {

        @Test
        @DisplayName("returns details for a normal team")
        void normalTeam() {
            Team team = new Team();
            team.setId(5L);
            team.setName("Engineering");
            when(teamRepository.findById(5L)).thenReturn(Optional.of(team));
            when(userRepository.findAllByTeamId(5L)).thenReturn(List.of());
            when(userRepository.findAllWithTeam()).thenReturn(List.of());
            when(sessionRepository.findLatestSessionByTeamId(5L))
                    .thenReturn(Collections.emptyList());

            ResponseEntity<TeamDetailsData> response = controller.getTeamDetailsData(5L);

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            assertThat(response.getBody().getTeam().getName()).isEqualTo("Engineering");
        }

        @Test
        @DisplayName("returns 403 for the internal team")
        void internalTeamForbidden() {
            Team team = new Team();
            team.setId(6L);
            team.setName(
                    stirling.software.proprietary.security.service.TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(6L)).thenReturn(Optional.of(team));

            ResponseEntity<TeamDetailsData> response = controller.getTeamDetailsData(6L);

            assertThat(response.getStatusCode().value()).isEqualTo(403);
        }

        @Test
        @DisplayName("throws when the team does not exist")
        void teamMissing() {
            when(teamRepository.findById(99L)).thenReturn(Optional.empty());

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () -> controller.getTeamDetailsData(99L))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Team not found");
        }
    }

    @Nested
    @DisplayName("getDatabaseData")
    class Database {

        @Test
        @DisplayName("reports a known version as not unknown")
        void knownVersion() {
            when(databaseService.getBackupList()).thenReturn(List.of());
            when(databaseService.getH2Version()).thenReturn("2.2.224");

            ResponseEntity<ProprietaryUIDataController.DatabaseData> response =
                    controller.getDatabaseData();

            assertThat(response.getBody().getDatabaseVersion()).isEqualTo("2.2.224");
            assertThat(response.getBody().isVersionUnknown()).isFalse();
        }
    }
}
