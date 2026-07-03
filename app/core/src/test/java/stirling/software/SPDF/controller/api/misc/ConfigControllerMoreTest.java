package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.ExternalAppDepConfig;
import stirling.software.common.configuration.AppConfig;
import stirling.software.common.configuration.interfaces.ShowAdminInterface;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.service.UserServiceInterface;

/**
 * Exercises getAppConfig and the dynamic license/EE helpers, which the original
 * ConfigControllerTest does not cover. Uses a real ApplicationProperties so the full method body
 * runs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConfigController extra coverage")
class ConfigControllerMoreTest {

    @Mock private ApplicationContext applicationContext;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private ServerCertificateServiceInterface serverCertificateService;
    @Mock private UserServiceInterface userService;
    @Mock private ShowAdminInterface showAdmin;
    @Mock private LicenseServiceInterface licenseService;
    @Mock private ExternalAppDepConfig externalAppDepConfig;
    @Mock private AppConfig appConfig;
    @Mock private Environment environment;

    private ApplicationProperties applicationProperties;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        when(appConfig.getBackendUrl()).thenReturn("http://localhost:8080");
        when(appConfig.getContextPath()).thenReturn("/");
        when(appConfig.getServerPort()).thenReturn("8080");
        when(applicationContext.getBean(AppConfig.class)).thenReturn(appConfig);
        lenient().when(applicationContext.getEnvironment()).thenReturn(environment);
        lenient().when(externalAppDepConfig.isDependenciesChecked()).thenReturn(true);
    }

    private ConfigController newController() {
        return new ConfigController(
                applicationProperties,
                applicationContext,
                endpointConfiguration,
                serverCertificateService,
                userService,
                showAdmin,
                licenseService,
                externalAppDepConfig);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> bodyOf(ResponseEntity<Map<String, Object>> resp) {
        return resp.getBody();
    }

    @Nested
    @DisplayName("getAppConfig")
    class GetAppConfig {

        @Test
        @DisplayName("returns wired config values with all services present")
        void returnsConfigWithServices() {
            when(licenseService.isRunningProOrHigher()).thenReturn(true);
            when(licenseService.isRunningEE()).thenReturn(false);
            when(licenseService.getLicenseTypeName()).thenReturn("ENTERPRISE");
            when(userService.isCurrentUserAdmin()).thenReturn(true);
            when(userService.isCurrentUserFirstLogin()).thenReturn(false);
            when(serverCertificateService.isEnabled()).thenReturn(true);
            applicationProperties.getSecurity().setEnableLogin(true);

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("dependenciesReady", true);
            assertThat(body).containsEntry("baseUrl", "http://localhost:8080");
            assertThat(body).containsEntry("serverPort", "8080");
            assertThat(body).containsEntry("enableLogin", true);
            assertThat(body).containsEntry("isAdmin", true);
            assertThat(body).containsEntry("runningProOrHigher", true);
            assertThat(body).containsEntry("license", "ENTERPRISE");
            assertThat(body).containsEntry("serverCertificateEnabled", true);
            assertThat(body).containsKey("timestampTsaPresets");
        }

        @Test
        @DisplayName("login disabled when userService is null (proprietary not loaded)")
        void loginDisabledWhenNoUserService() {
            userService = null;
            licenseService = null;
            serverCertificateService = null;
            applicationProperties.getSecurity().setEnableLogin(true);

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("enableLogin", false);
            assertThat(body).containsEntry("isAdmin", false);
            assertThat(body).containsEntry("isNewUser", false);
            assertThat(body).containsEntry("serverCertificateEnabled", false);
        }

        @Test
        @DisplayName("falls back to context beans when license service is null")
        void licenseFallsBackToContextBeans() {
            licenseService = null;
            when(applicationContext.containsBean("runningProOrHigher")).thenReturn(true);
            when(applicationContext.getBean("runningProOrHigher", Boolean.class)).thenReturn(true);
            when(applicationContext.containsBean("runningEE")).thenReturn(true);
            when(applicationContext.getBean("runningEE", Boolean.class)).thenReturn(true);
            when(applicationContext.containsBean("license")).thenReturn(true);
            when(applicationContext.getBean("license", String.class)).thenReturn("SERVER");
            when(applicationContext.containsBean("SSOAutoLogin")).thenReturn(true);
            when(applicationContext.getBean("SSOAutoLogin", Boolean.class)).thenReturn(true);

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("runningProOrHigher", true);
            assertThat(body).containsEntry("runningEE", true);
            assertThat(body).containsEntry("license", "SERVER");
            assertThat(body).containsEntry("SSOAutoLogin", true);
        }

        @Test
        @DisplayName("includes Google Drive backend settings when enabled")
        void googleDriveEnabled() {
            ApplicationProperties.Premium.ProFeatures.GoogleDrive gd =
                    applicationProperties.getPremium().getProFeatures().getGoogleDrive();
            gd.setEnabled(true);
            gd.setClientId("cid");
            gd.setApiKey("key");
            gd.setAppId("aid");

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("googleDriveEnabled", true);
            assertThat(body).containsEntry("googleDriveClientId", "cid");
            assertThat(body).containsEntry("googleDriveApiKey", "key");
        }

        @Test
        @DisplayName("includes version/machine info beans when available")
        void versionAndMachineBeans() {
            when(applicationContext.containsBean("appVersion")).thenReturn(true);
            when(applicationContext.getBean("appVersion", String.class)).thenReturn("9.9.9");
            when(applicationContext.containsBean("machineType")).thenReturn(true);
            when(applicationContext.getBean("machineType", String.class)).thenReturn("Docker");
            when(applicationContext.containsBean("activeSecurity")).thenReturn(true);
            when(applicationContext.getBean("activeSecurity", Boolean.class)).thenReturn(true);

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("appVersion", "9.9.9");
            assertThat(body).containsEntry("machineType", "Docker");
            assertThat(body).containsEntry("activeSecurity", true);
        }

        @Test
        @DisplayName("isCurrentUserAdmin exception leaves isAdmin false")
        void adminCheckExceptionSwallowed() {
            when(userService.isCurrentUserAdmin()).thenThrow(new RuntimeException("boom"));
            when(userService.isCurrentUserFirstLogin()).thenThrow(new RuntimeException("boom"));
            applicationProperties.getSecurity().setEnableLogin(true);

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("isAdmin", false);
            assertThat(body).containsEntry("isNewUser", false);
        }

        @Test
        @DisplayName("returns basic config with error key when AppConfig bean lookup fails")
        void returnsErrorConfigOnException() {
            when(applicationContext.getBean(AppConfig.class))
                    .thenThrow(new RuntimeException("no bean"));

            HttpServletRequest request = mock(HttpServletRequest.class);
            ResponseEntity<Map<String, Object>> resp = newController().getAppConfig(request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = bodyOf(resp);
            assertThat(body).containsEntry("error", "Unable to retrieve full configuration");
        }
    }
}
