package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.security.identity.SecurityIdentity;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.AccountData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.DatabaseData;
import stirling.software.proprietary.controller.api.ProprietaryUIDataController.LoginData;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.DatabaseService;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * MIGRATION (Spring -> Quarkus): {@code ProprietaryUIDataController} endpoints now return JAX-RS
 * {@link Response} (was {@code ResponseEntity}); {@code getAccountData()} takes no argument and
 * reads the caller from the injected {@code SecurityIdentity} (was a Spring {@code Authentication}
 * parameter); and {@code UserRepository} is a Panache repository, so {@code findAll()} returns a
 * {@link PanacheQuery} (stubbed to {@code .list()} here). Assertions are adapted to the JAX-RS
 * status code / entity API.
 */
@ExtendWith(MockitoExtension.class)
class ProprietaryUIDataControllerTest {

    @Mock private SessionPersistentRegistry sessionPersistentRegistry;
    @Mock private UserRepository userRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private SessionRepository sessionRepository;
    @Mock private DatabaseService databaseService;
    @Mock private UserLicenseSettingsService licenseSettingsService;
    @Mock private PersistentAuditEventRepository auditRepository;
    @Mock private MfaService mfaService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private SecurityIdentity securityIdentity;

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
        applicationProperties.getSecurity().getOauth2().setEnabled(false);
        applicationProperties.getSecurity().getSaml2().setEnabled(false);

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
        // securityIdentity is @Inject field injection - wire the mock directly (no CDI container).
        controller.securityIdentity = securityIdentity;
    }

    @SuppressWarnings("unchecked")
    private PanacheQuery<User> queryOf(List<User> users) {
        PanacheQuery<User> query = mock(PanacheQuery.class);
        lenient().when(query.list()).thenReturn(users);
        return query;
    }

    @Test
    void loginDataFlagsFirstTimeSetupWhenNoUsers() {
        PanacheQuery<User> emptyQuery = queryOf(Collections.emptyList());
        when(userRepository.findAll()).thenReturn(emptyQuery);

        Response response = controller.getLoginData();

        assertThat(response.getStatus()).isEqualTo(Response.Status.OK.getStatusCode());
        LoginData body = (LoginData) response.getEntity();
        assertThat(body.isFirstTimeSetup()).isTrue();
        assertThat(body.isShowDefaultCredentials()).isTrue();
        assertThat(body.getLanguages()).containsExactly("en", "de");
        assertThat(body.getDefaultLocale()).isEqualTo("en");
    }

    @Test
    void accountDataReturnsUserSettingsAndMfaFlags() {
        User user = new User();
        user.setUsername("user@example.com");
        Authority authority = new Authority();
        authority.setAuthority(Role.USER.getRoleId());
        user.addAuthority(authority);
        user.setSettings(Map.of("theme", "dark"));

        when(userRepository.findByUsernameIgnoreCaseWithSettings("user@example.com"))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);
        when(mfaService.isMfaRequired(user)).thenReturn(false);

        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn("user@example.com");
        when(securityIdentity.isAnonymous()).thenReturn(false);
        when(securityIdentity.getPrincipal()).thenReturn(principal);

        Response response = controller.getAccountData();

        assertThat(response.getStatus()).isEqualTo(Response.Status.OK.getStatusCode());
        AccountData data = (AccountData) response.getEntity();
        assertThat(data.getUsername()).isEqualTo("user@example.com");
        assertThat(data.isMfaEnabled()).isTrue();
        assertThat(data.isMfaRequired()).isFalse();
        assertThat(data.getSettings()).contains("\"theme\":\"dark\"");
    }

    @Test
    void databaseDataMarksUnknownVersion() {
        when(databaseService.getBackupList()).thenReturn(List.of());
        when(databaseService.getH2Version()).thenReturn("Unknown");

        Response response = controller.getDatabaseData();

        assertThat(response.getStatus()).isEqualTo(Response.Status.OK.getStatusCode());
        DatabaseData data = (DatabaseData) response.getEntity();
        assertThat(data.getBackupFiles()).isEmpty();
        assertThat(data.isVersionUnknown()).isTrue();
    }
}
