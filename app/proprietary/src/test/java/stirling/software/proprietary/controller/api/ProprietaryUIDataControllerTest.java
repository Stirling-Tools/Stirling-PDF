package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import com.fasterxml.jackson.databind.ObjectMapper;

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
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

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
        objectMapper = new ObjectMapper();

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
                        mfaService);
    }

    @Test
    void loginDataFlagsFirstTimeSetupWhenNoUsers() {
        when(userRepository.findAll()).thenReturn(Collections.emptyList());

        ResponseEntity<LoginData> response = controller.getLoginData();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        LoginData body = response.getBody();
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

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());

        ResponseEntity<AccountData> response = controller.getAccountData(authentication);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        AccountData data = response.getBody();
        assertThat(data.getUsername()).isEqualTo("user@example.com");
        assertThat(data.isMfaEnabled()).isTrue();
        assertThat(data.isMfaRequired()).isFalse();
        assertThat(data.getSettings()).contains("\"theme\":\"dark\"");
    }

    @Test
    void databaseDataMarksUnknownVersion() {
        when(databaseService.getBackupList()).thenReturn(List.of());
        when(databaseService.getH2Version()).thenReturn("Unknown");

        ResponseEntity<DatabaseData> response = controller.getDatabaseData();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        DatabaseData data = response.getBody();
        assertThat(data.getBackupFiles()).isEmpty();
        assertThat(data.isVersionUnknown()).isTrue();
    }
}
