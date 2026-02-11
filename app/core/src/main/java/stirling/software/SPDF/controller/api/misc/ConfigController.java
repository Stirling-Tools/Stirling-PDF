package stirling.software.SPDF.controller.api.misc;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.context.ApplicationContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.EndpointAvailability;
import stirling.software.SPDF.config.InitialSetup;
import stirling.software.common.annotations.api.ConfigApi;
import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.service.UserServiceInterface;

@ConfigApi
@Hidden
@Slf4j
public class ConfigController {

    private final ApplicationProperties applicationProperties;
    private final ApplicationContext applicationContext;
    private final EndpointConfiguration endpointConfiguration;
    private final ServerCertificateServiceInterface serverCertificateService;
    private final UserServiceInterface userService;
    private final stirling.software.common.service.LicenseServiceInterface licenseService;
    private final stirling.software.SPDF.config.ExternalAppDepConfig externalAppDepConfig;

    public ConfigController(
            ApplicationProperties applicationProperties,
            ApplicationContext applicationContext,
            EndpointConfiguration endpointConfiguration,
            @org.springframework.beans.factory.annotation.Autowired(required = false)
                    ServerCertificateServiceInterface serverCertificateService,
            @org.springframework.beans.factory.annotation.Autowired(required = false)
                    UserServiceInterface userService,
            @org.springframework.beans.factory.annotation.Autowired(required = false)
                    stirling.software.common.service.LicenseServiceInterface licenseService,
            stirling.software.SPDF.config.ExternalAppDepConfig externalAppDepConfig) {
        this.applicationProperties = applicationProperties;
        this.applicationContext = applicationContext;
        this.endpointConfiguration = endpointConfiguration;
        this.serverCertificateService = serverCertificateService;
        this.userService = userService;
        this.licenseService = licenseService;
        this.externalAppDepConfig = externalAppDepConfig;
    }

    /**
     * Get current license type dynamically instead of from cached bean. This ensures the frontend
     * sees updated license status after admin changes the license key.
     */
    private String getCurrentLicenseType() {
        // Use LicenseService for fresh license status if available
        if (licenseService != null) {
            return licenseService.getLicenseTypeName();
        }

        // Fallback to cached bean if service not available
        if (applicationContext.containsBean("license")) {
            return applicationContext.getBean("license", String.class);
        }

        return null;
    }

    /** Check if running Pro or higher (SERVER or ENTERPRISE license) dynamically. */
    private Boolean isRunningProOrHigher() {
        // Use LicenseService for fresh license status if available
        if (licenseService != null) {
            return licenseService.isRunningProOrHigher();
        }

        // Fallback to cached bean
        if (applicationContext.containsBean("runningProOrHigher")) {
            return applicationContext.getBean("runningProOrHigher", Boolean.class);
        }

        return null;
    }

    /** Check if running Enterprise edition dynamically. */
    private Boolean isRunningEE() {
        // Use LicenseService for fresh license status if available
        if (licenseService != null) {
            return licenseService.isRunningEE();
        }

        // Fallback to cached bean
        if (applicationContext.containsBean("runningEE")) {
            return applicationContext.getBean("runningEE", Boolean.class);
        }

        return null;
    }

    @GetMapping("/app-config")
    public ResponseEntity<Map<String, Object>> getAppConfig() {
        Map<String, Object> configData = new HashMap<>();

        try {
            // Add dependency check status
            configData.put("dependenciesReady", externalAppDepConfig.isDependenciesChecked());

            // Get AppConfig bean
            AppConfig appConfig = applicationContext.getBean(AppConfig.class);

            // Extract key configuration values from AppConfig
            // Note: Frontend expects "baseUrl" field name for compatibility
            configData.put("baseUrl", appConfig.getBackendUrl());
            configData.put("contextPath", appConfig.getContextPath());
            configData.put("serverPort", appConfig.getServerPort());

            // Add frontendUrl for mobile scanner QR codes
            String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
            configData.put("frontendUrl", frontendUrl != null ? frontendUrl : "");

            // Add mobile scanner settings
            configData.put(
                    "enableMobileScanner",
                    applicationProperties.getSystem().isEnableMobileScanner());
            configData.put(
                    "mobileScannerConvertToPdf",
                    applicationProperties.getSystem().getMobileScannerSettings().isConvertToPdf());
            configData.put(
                    "mobileScannerImageResolution",
                    applicationProperties
                            .getSystem()
                            .getMobileScannerSettings()
                            .getImageResolution());
            configData.put(
                    "mobileScannerPageFormat",
                    applicationProperties.getSystem().getMobileScannerSettings().getPageFormat());
            configData.put(
                    "mobileScannerStretchToFit",
                    applicationProperties.getSystem().getMobileScannerSettings().isStretchToFit());

            // Extract values from ApplicationProperties
            configData.put("appNameNavbar", applicationProperties.getUi().getAppNameNavbar());
            configData.put("languages", applicationProperties.getUi().getLanguages());
            configData.put("logoStyle", applicationProperties.getUi().getLogoStyle());
            configData.put("defaultLocale", applicationProperties.getSystem().getDefaultLocale());

            // Security settings
            // enableLogin requires both the config flag AND proprietary features to be loaded
            // If userService is null, proprietary module isn't loaded
            // (DISABLE_ADDITIONAL_FEATURES=true or DOCKER_ENABLE_SECURITY=false)
            boolean enableLogin =
                    applicationProperties.getSecurity().isEnableLogin() && userService != null;
            configData.put("enableLogin", enableLogin);
            configData.put(
                    "showSettingsWhenNoLogin",
                    applicationProperties.getSystem().isShowSettingsWhenNoLogin());

            // SSO Provider settings
            boolean enableOAuth =
                    applicationProperties.getSecurity().getOauth2() != null
                            && applicationProperties.getSecurity().getOauth2().getEnabled();
            boolean enableSaml =
                    applicationProperties.getSecurity().getSaml2() != null
                            && applicationProperties.getSecurity().getSaml2().getEnabled();
            configData.put("enableOAuth", enableOAuth);
            configData.put("enableSaml", enableSaml);

            // Mail settings - check both SMTP enabled AND invites enabled
            boolean smtpEnabled = applicationProperties.getMail().isEnabled();
            boolean invitesEnabled = applicationProperties.getMail().isEnableInvites();
            configData.put("enableEmailInvites", smtpEnabled && invitesEnabled);

            // Check if user is admin using UserServiceInterface
            boolean isAdmin = false;
            if (userService != null) {
                try {
                    isAdmin = userService.isCurrentUserAdmin();
                } catch (Exception e) {
                    // If there's an error, isAdmin remains false
                }
            }
            configData.put("isAdmin", isAdmin);

            // Check if this is a new server (version was 0.0.0 before initialization)
            configData.put("isNewServer", InitialSetup.isNewServer());

            // Check if the current user is a first-time user
            boolean isNewUser =
                    false; // Default to false when security is disabled or user not found
            if (userService != null) {
                try {
                    isNewUser = userService.isCurrentUserFirstLogin();
                } catch (Exception e) {
                    // If there's an error, assume not new user for safety
                    isNewUser = false;
                }
            }
            configData.put("isNewUser", isNewUser);

            // System settings
            configData.put(
                    "enableAlphaFunctionality",
                    applicationProperties.getSystem().isEnableAlphaFunctionality());
            configData.put(
                    "enableAnalytics", applicationProperties.getSystem().getEnableAnalytics());
            configData.put("enablePosthog", applicationProperties.getSystem().getEnablePosthog());
            configData.put("enableScarf", applicationProperties.getSystem().getEnableScarf());
            configData.put(
                    "enableDesktopInstallSlide",
                    applicationProperties.getSystem().getEnableDesktopInstallSlide());

            // Premium/Enterprise settings
            configData.put("premiumEnabled", applicationProperties.getPremium().isEnabled());

            // Server certificate settings
            configData.put(
                    "serverCertificateEnabled",
                    serverCertificateService != null && serverCertificateService.isEnabled());

            // Legal settings
            configData.put(
                    "termsAndConditions", applicationProperties.getLegal().getTermsAndConditions());
            configData.put("privacyPolicy", applicationProperties.getLegal().getPrivacyPolicy());
            configData.put("cookiePolicy", applicationProperties.getLegal().getCookiePolicy());
            configData.put("impressum", applicationProperties.getLegal().getImpressum());
            configData.put(
                    "accessibilityStatement",
                    applicationProperties.getLegal().getAccessibilityStatement());

            // Try to get EEAppConfig values if available
            // Get these dynamically to reflect current license status (not cached at startup)
            try {
                Boolean runningProOrHigher = isRunningProOrHigher();
                if (runningProOrHigher != null) {
                    configData.put("runningProOrHigher", runningProOrHigher);
                }

                Boolean runningEE = isRunningEE();
                if (runningEE != null) {
                    configData.put("runningEE", runningEE);
                }

                String licenseType = getCurrentLicenseType();
                if (licenseType != null) {
                    configData.put("license", licenseType);
                }

                if (applicationContext.containsBean("SSOAutoLogin")) {
                    configData.put(
                            "SSOAutoLogin",
                            applicationContext.getBean("SSOAutoLogin", Boolean.class));
                }
            } catch (Exception e) {
                // EE features not available, continue without them
            }

            // Add version and machine info for update checking
            try {
                if (applicationContext.containsBean("appVersion")) {
                    configData.put(
                            "appVersion", applicationContext.getBean("appVersion", String.class));
                }
                if (applicationContext.containsBean("machineType")) {
                    configData.put(
                            "machineType", applicationContext.getBean("machineType", String.class));
                }
                if (applicationContext.containsBean("activeSecurity")) {
                    configData.put(
                            "activeSecurity",
                            applicationContext.getBean("activeSecurity", Boolean.class));
                }
            } catch (Exception e) {
                // Version/machine info not available
            }

            return ResponseEntity.ok(configData);

        } catch (Exception e) {
            // Return basic config if there are any issues
            configData.put("error", "Unable to retrieve full configuration");
            return ResponseEntity.ok(configData);
        }
    }

    @GetMapping("/endpoint-enabled")
    public ResponseEntity<Boolean> isEndpointEnabled(
            @RequestParam(name = "endpoint") String endpoint) {
        boolean enabled = endpointConfiguration.isEndpointEnabled(endpoint);
        return ResponseEntity.ok(enabled);
    }

    @GetMapping("/endpoints-enabled")
    public ResponseEntity<Map<String, Boolean>> areEndpointsEnabled(
            @RequestParam(name = "endpoints") String endpoints) {
        Map<String, Boolean> result = new HashMap<>();
        String[] endpointArray = endpoints.split(",");
        for (String endpoint : endpointArray) {
            String trimmedEndpoint = endpoint.trim();
            result.put(trimmedEndpoint, endpointConfiguration.isEndpointEnabled(trimmedEndpoint));
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/endpoints-availability")
    public ResponseEntity<Map<String, EndpointAvailability>> getEndpointAvailability(
            @RequestParam(name = "endpoints")
                    @Size(min = 1, max = 100, message = "Must provide between 1 and 100 endpoints")
                    List<@NotBlank String> endpoints) {
        Map<String, EndpointAvailability> result = new HashMap<>();
        for (String endpoint : endpoints) {
            String trimmedEndpoint = endpoint.trim();
            result.put(
                    trimmedEndpoint,
                    endpointConfiguration.getEndpointAvailability(trimmedEndpoint));
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/group-enabled")
    public ResponseEntity<Boolean> isGroupEnabled(@RequestParam(name = "group") String group) {
        boolean enabled = endpointConfiguration.isGroupEnabled(group);
        return ResponseEntity.ok(enabled);
    }
}
