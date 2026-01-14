package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SettingsApi;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

@SettingsApi
@RequiredArgsConstructor
@Hidden
public class SettingsController {

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;

    @AutoJobPostMapping("/update-enable-analytics")
    @Hidden
    public ResponseEntity<Map<String, Object>> updateApiKey(@RequestParam Boolean enabled)
            throws IOException {
        if (applicationProperties.getSystem().getEnableAnalytics() != null) {
            return ResponseEntity.status(HttpStatus.ALREADY_REPORTED)
                    .body(
                            Map.of(
                                    "message",
                                    "Setting has already been set, To adjust please edit "
                                            + InstallationPathConfig.getSettingsPath()));
        }
        GeneralUtils.saveKeyToSettings("system.enableAnalytics", enabled);
        applicationProperties.getSystem().setEnableAnalytics(enabled);
        return ResponseEntity.ok(Map.of("message", "Updated"));
    }

    @GetMapping("/get-endpoints-status")
    @Hidden
    public ResponseEntity<Map<String, Boolean>> getDisabledEndpoints() {
        return ResponseEntity.ok(endpointConfiguration.getEndpointStatuses());
    }

    // ========== GENERAL SETTINGS ==========

    @GetMapping("/admin/settings/general")
    @Hidden
    public ResponseEntity<Map<String, Object>> getGeneralSettings() {
        Map<String, Object> settings = new HashMap<>();
        settings.put("ui", applicationProperties.getUi());
        settings.put(
                "system",
                Map.of(
                        "defaultLocale", applicationProperties.getSystem().getDefaultLocale(),
                        "showUpdate", applicationProperties.getSystem().isShowUpdate(),
                        "showUpdateOnlyAdmin",
                                applicationProperties.getSystem().isShowUpdateOnlyAdmin(),
                        "customHTMLFiles", applicationProperties.getSystem().isCustomHTMLFiles(),
                        "fileUploadLimit", applicationProperties.getSystem().getFileUploadLimit()));
        return ResponseEntity.ok(settings);
    }

    @PostMapping("/admin/settings/general")
    @Hidden
    public ResponseEntity<String> updateGeneralSettings(@RequestBody Map<String, Object> settings)
            throws IOException {
        // Update UI settings
        if (settings.containsKey("ui")) {
            Map<String, String> ui = (Map<String, String>) settings.get("ui");
            if (ui.containsKey("appNameNavbar")) {
                GeneralUtils.saveKeyToSettings("ui.appNameNavbar", ui.get("appNameNavbar"));
                applicationProperties.getUi().setAppNameNavbar(ui.get("appNameNavbar"));
            }
        }

        // Update System settings
        if (settings.containsKey("system")) {
            Map<String, Object> system = (Map<String, Object>) settings.get("system");
            if (system.containsKey("defaultLocale")) {
                GeneralUtils.saveKeyToSettings("system.defaultLocale", system.get("defaultLocale"));
                applicationProperties
                        .getSystem()
                        .setDefaultLocale((String) system.get("defaultLocale"));
            }
            if (system.containsKey("showUpdate")) {
                GeneralUtils.saveKeyToSettings("system.showUpdate", system.get("showUpdate"));
                applicationProperties.getSystem().setShowUpdate((Boolean) system.get("showUpdate"));
            }
            if (system.containsKey("showUpdateOnlyAdmin")) {
                GeneralUtils.saveKeyToSettings(
                        "system.showUpdateOnlyAdmin", system.get("showUpdateOnlyAdmin"));
                applicationProperties
                        .getSystem()
                        .setShowUpdateOnlyAdmin((Boolean) system.get("showUpdateOnlyAdmin"));
            }
            if (system.containsKey("fileUploadLimit")) {
                GeneralUtils.saveKeyToSettings(
                        "system.fileUploadLimit", system.get("fileUploadLimit"));
                applicationProperties
                        .getSystem()
                        .setFileUploadLimit((String) system.get("fileUploadLimit"));
            }
        }

        return ResponseEntity.ok(
                "General settings updated. Restart required for changes to take effect.");
    }

    // ========== SECURITY SETTINGS ==========

    @GetMapping("/admin/settings/security")
    @Hidden
    public ResponseEntity<Map<String, Object>> getSecuritySettings() {
        Map<String, Object> settings = new HashMap<>();
        ApplicationProperties.Security security = applicationProperties.getSecurity();

        settings.put("enableLogin", security.isEnableLogin());
        settings.put("loginMethod", security.getLoginMethod());
        settings.put("loginAttemptCount", security.getLoginAttemptCount());
        settings.put("loginResetTimeMinutes", security.getLoginResetTimeMinutes());
        settings.put(
                "initialLogin",
                Map.of(
                        "username",
                        security.getInitialLogin().getUsername() != null
                                ? security.getInitialLogin().getUsername()
                                : ""));

        // JWT settings
        ApplicationProperties.Security.Jwt jwt = security.getJwt();
        settings.put(
                "jwt",
                Map.of(
                        "enableKeystore", jwt.isEnableKeystore(),
                        "enableKeyRotation", jwt.isEnableKeyRotation(),
                        "enableKeyCleanup", jwt.isEnableKeyCleanup(),
                        "keyRetentionDays", jwt.getKeyRetentionDays()));

        return ResponseEntity.ok(settings);
    }

    @PostMapping("/admin/settings/security")
    @Hidden
    public ResponseEntity<String> updateSecuritySettings(@RequestBody Map<String, Object> settings)
            throws IOException {
        if (settings.containsKey("enableLogin")) {
            GeneralUtils.saveKeyToSettings("security.enableLogin", settings.get("enableLogin"));
            applicationProperties
                    .getSecurity()
                    .setEnableLogin((Boolean) settings.get("enableLogin"));
        }
        if (settings.containsKey("loginMethod")) {
            GeneralUtils.saveKeyToSettings("security.loginMethod", settings.get("loginMethod"));
            applicationProperties
                    .getSecurity()
                    .setLoginMethod((String) settings.get("loginMethod"));
        }
        if (settings.containsKey("loginAttemptCount")) {
            GeneralUtils.saveKeyToSettings(
                    "security.loginAttemptCount", settings.get("loginAttemptCount"));
            applicationProperties
                    .getSecurity()
                    .setLoginAttemptCount((Integer) settings.get("loginAttemptCount"));
        }
        if (settings.containsKey("loginResetTimeMinutes")) {
            GeneralUtils.saveKeyToSettings(
                    "security.loginResetTimeMinutes", settings.get("loginResetTimeMinutes"));
            applicationProperties
                    .getSecurity()
                    .setLoginResetTimeMinutes(
                            ((Number) settings.get("loginResetTimeMinutes")).longValue());
        }

        // JWT settings
        if (settings.containsKey("jwt")) {
            Map<String, Object> jwt = (Map<String, Object>) settings.get("jwt");
            if (jwt.containsKey("keyRetentionDays")) {
                GeneralUtils.saveKeyToSettings(
                        "security.jwt.keyRetentionDays", jwt.get("keyRetentionDays"));
                applicationProperties
                        .getSecurity()
                        .getJwt()
                        .setKeyRetentionDays((Integer) jwt.get("keyRetentionDays"));
            }
        }

        return ResponseEntity.ok(
                "Security settings updated. Restart required for changes to take effect.");
    }

    // ========== CONNECTIONS SETTINGS (OAuth/SAML) ==========

    @GetMapping("/admin/settings/connections")
    @Hidden
    public ResponseEntity<Map<String, Object>> getConnectionsSettings() {
        Map<String, Object> settings = new HashMap<>();
        ApplicationProperties.Security security = applicationProperties.getSecurity();

        // OAuth2 settings
        ApplicationProperties.Security.OAUTH2 oauth2 = security.getOauth2();
        settings.put(
                "oauth2",
                Map.of(
                        "enabled", oauth2.getEnabled(),
                        "issuer", oauth2.getIssuer() != null ? oauth2.getIssuer() : "",
                        "clientId", oauth2.getClientId() != null ? oauth2.getClientId() : "",
                        "provider", oauth2.getProvider() != null ? oauth2.getProvider() : "",
                        "autoCreateUser", oauth2.getAutoCreateUser(),
                        "blockRegistration", oauth2.getBlockRegistration(),
                        "useAsUsername",
                                oauth2.getUseAsUsername() != null
                                        ? oauth2.getUseAsUsername()
                                        : ""));

        // SAML2 settings
        ApplicationProperties.Security.SAML2 saml2 = security.getSaml2();
        settings.put(
                "saml2",
                Map.of(
                        "enabled", saml2.getEnabled(),
                        "provider", saml2.getProvider() != null ? saml2.getProvider() : "",
                        "autoCreateUser", saml2.getAutoCreateUser(),
                        "blockRegistration", saml2.getBlockRegistration(),
                        "registrationId", saml2.getRegistrationId()));

        return ResponseEntity.ok(settings);
    }

    @PostMapping("/admin/settings/connections")
    @Hidden
    public ResponseEntity<String> updateConnectionsSettings(
            @RequestBody Map<String, Object> settings) throws IOException {
        // OAuth2 settings
        if (settings.containsKey("oauth2")) {
            Map<String, Object> oauth2 = (Map<String, Object>) settings.get("oauth2");
            if (oauth2.containsKey("enabled")) {
                GeneralUtils.saveKeyToSettings("security.oauth2.enabled", oauth2.get("enabled"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setEnabled((Boolean) oauth2.get("enabled"));
            }
            if (oauth2.containsKey("issuer")) {
                GeneralUtils.saveKeyToSettings("security.oauth2.issuer", oauth2.get("issuer"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setIssuer((String) oauth2.get("issuer"));
            }
            if (oauth2.containsKey("clientId")) {
                GeneralUtils.saveKeyToSettings("security.oauth2.clientId", oauth2.get("clientId"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setClientId((String) oauth2.get("clientId"));
            }
            if (oauth2.containsKey("clientSecret")) {
                GeneralUtils.saveKeyToSettings(
                        "security.oauth2.clientSecret", oauth2.get("clientSecret"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setClientSecret((String) oauth2.get("clientSecret"));
            }
            if (oauth2.containsKey("provider")) {
                GeneralUtils.saveKeyToSettings("security.oauth2.provider", oauth2.get("provider"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setProvider((String) oauth2.get("provider"));
            }
            if (oauth2.containsKey("autoCreateUser")) {
                GeneralUtils.saveKeyToSettings(
                        "security.oauth2.autoCreateUser", oauth2.get("autoCreateUser"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setAutoCreateUser((Boolean) oauth2.get("autoCreateUser"));
            }
            if (oauth2.containsKey("blockRegistration")) {
                GeneralUtils.saveKeyToSettings(
                        "security.oauth2.blockRegistration", oauth2.get("blockRegistration"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setBlockRegistration((Boolean) oauth2.get("blockRegistration"));
            }
            if (oauth2.containsKey("useAsUsername")) {
                GeneralUtils.saveKeyToSettings(
                        "security.oauth2.useAsUsername", oauth2.get("useAsUsername"));
                applicationProperties
                        .getSecurity()
                        .getOauth2()
                        .setUseAsUsername((String) oauth2.get("useAsUsername"));
            }
        }

        // SAML2 settings
        if (settings.containsKey("saml2")) {
            Map<String, Object> saml2 = (Map<String, Object>) settings.get("saml2");
            if (saml2.containsKey("enabled")) {
                GeneralUtils.saveKeyToSettings("security.saml2.enabled", saml2.get("enabled"));
                applicationProperties
                        .getSecurity()
                        .getSaml2()
                        .setEnabled((Boolean) saml2.get("enabled"));
            }
            if (saml2.containsKey("provider")) {
                GeneralUtils.saveKeyToSettings("security.saml2.provider", saml2.get("provider"));
                applicationProperties
                        .getSecurity()
                        .getSaml2()
                        .setProvider((String) saml2.get("provider"));
            }
            if (saml2.containsKey("autoCreateUser")) {
                GeneralUtils.saveKeyToSettings(
                        "security.saml2.autoCreateUser", saml2.get("autoCreateUser"));
                applicationProperties
                        .getSecurity()
                        .getSaml2()
                        .setAutoCreateUser((Boolean) saml2.get("autoCreateUser"));
            }
            if (saml2.containsKey("blockRegistration")) {
                GeneralUtils.saveKeyToSettings(
                        "security.saml2.blockRegistration", saml2.get("blockRegistration"));
                applicationProperties
                        .getSecurity()
                        .getSaml2()
                        .setBlockRegistration((Boolean) saml2.get("blockRegistration"));
            }
        }

        return ResponseEntity.ok(
                "Connection settings updated. Restart required for changes to take effect.");
    }

    // ========== PRIVACY SETTINGS ==========

    @GetMapping("/admin/settings/privacy")
    @Hidden
    public ResponseEntity<Map<String, Object>> getPrivacySettings() {
        Map<String, Object> settings = new HashMap<>();

        settings.put("enableAnalytics", applicationProperties.getSystem().getEnableAnalytics());
        settings.put("googleVisibility", applicationProperties.getSystem().isGooglevisibility());
        settings.put("metricsEnabled", applicationProperties.getMetrics().isEnabled());

        return ResponseEntity.ok(settings);
    }

    @PostMapping("/admin/settings/privacy")
    @Hidden
    public ResponseEntity<String> updatePrivacySettings(@RequestBody Map<String, Object> settings)
            throws IOException {
        if (settings.containsKey("enableAnalytics")) {
            GeneralUtils.saveKeyToSettings(
                    "system.enableAnalytics", settings.get("enableAnalytics"));
            applicationProperties
                    .getSystem()
                    .setEnableAnalytics((Boolean) settings.get("enableAnalytics"));
        }
        if (settings.containsKey("googleVisibility")) {
            GeneralUtils.saveKeyToSettings(
                    "system.googlevisibility", settings.get("googleVisibility"));
            applicationProperties
                    .getSystem()
                    .setGooglevisibility((Boolean) settings.get("googleVisibility"));
        }
        if (settings.containsKey("metricsEnabled")) {
            GeneralUtils.saveKeyToSettings("metrics.enabled", settings.get("metricsEnabled"));
            applicationProperties.getMetrics().setEnabled((Boolean) settings.get("metricsEnabled"));
        }

        return ResponseEntity.ok(
                "Privacy settings updated. Restart required for changes to take effect.");
    }

    // ========== ADVANCED SETTINGS ==========

    @GetMapping("/admin/settings/advanced")
    @Hidden
    public ResponseEntity<Map<String, Object>> getAdvancedSettings() {
        Map<String, Object> settings = new HashMap<>();

        settings.put("endpoints", applicationProperties.getEndpoints());
        settings.put(
                "enableAlphaFunctionality",
                applicationProperties.getSystem().isEnableAlphaFunctionality());
        settings.put("maxDPI", applicationProperties.getSystem().getMaxDPI());
        settings.put("enableUrlToPDF", applicationProperties.getSystem().isEnableUrlToPDF());
        settings.put("customPaths", applicationProperties.getSystem().getCustomPaths());
        settings.put(
                "tempFileManagement", applicationProperties.getSystem().getTempFileManagement());

        return ResponseEntity.ok(settings);
    }

    @PostMapping("/admin/settings/advanced")
    @Hidden
    public ResponseEntity<String> updateAdvancedSettings(@RequestBody Map<String, Object> settings)
            throws IOException {
        if (settings.containsKey("enableAlphaFunctionality")) {
            GeneralUtils.saveKeyToSettings(
                    "system.enableAlphaFunctionality", settings.get("enableAlphaFunctionality"));
            applicationProperties
                    .getSystem()
                    .setEnableAlphaFunctionality(
                            (Boolean) settings.get("enableAlphaFunctionality"));
        }
        if (settings.containsKey("maxDPI")) {
            GeneralUtils.saveKeyToSettings("system.maxDPI", settings.get("maxDPI"));
            applicationProperties.getSystem().setMaxDPI((Integer) settings.get("maxDPI"));
        }
        if (settings.containsKey("enableUrlToPDF")) {
            GeneralUtils.saveKeyToSettings("system.enableUrlToPDF", settings.get("enableUrlToPDF"));
            applicationProperties
                    .getSystem()
                    .setEnableUrlToPDF((Boolean) settings.get("enableUrlToPDF"));
        }

        return ResponseEntity.ok(
                "Advanced settings updated. Restart required for changes to take effect.");
    }
}
