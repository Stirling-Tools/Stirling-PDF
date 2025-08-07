package stirling.software.SPDF.controller.api.misc;

import java.util.HashMap;
import java.util.Map;

import org.springframework.context.ApplicationContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;

@RestController
@Tag(name = "Config", description = "Configuration APIs")
@RequestMapping("/api/v1/config")
@RequiredArgsConstructor
@Hidden
public class ConfigController {

    private final ApplicationProperties applicationProperties;
    private final ApplicationContext applicationContext;
    private final EndpointConfiguration endpointConfiguration;

    @GetMapping("/app-config")
    public ResponseEntity<Map<String, Object>> getAppConfig() {
        Map<String, Object> configData = new HashMap<>();

        try {
            // Get AppConfig bean
            AppConfig appConfig = applicationContext.getBean(AppConfig.class);

            // Extract key configuration values from AppConfig
            configData.put("baseUrl", appConfig.getBaseUrl());
            configData.put("contextPath", appConfig.getContextPath());
            configData.put("serverPort", appConfig.getServerPort());

            // Extract values from ApplicationProperties
            configData.put("appName", applicationProperties.getUi().getAppName());
            configData.put("appNameNavbar", applicationProperties.getUi().getAppNameNavbar());
            configData.put("homeDescription", applicationProperties.getUi().getHomeDescription());
            configData.put("languages", applicationProperties.getUi().getLanguages());

            // Security settings
            configData.put("enableLogin", applicationProperties.getSecurity().getEnableLogin());

            // System settings
            configData.put(
                    "enableAlphaFunctionality",
                    applicationProperties.getSystem().getEnableAlphaFunctionality());
            configData.put(
                    "enableAnalytics", applicationProperties.getSystem().getEnableAnalytics());

            // Premium/Enterprise settings
            configData.put("premiumEnabled", applicationProperties.getPremium().isEnabled());

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
            try {
                if (applicationContext.containsBean("runningProOrHigher")) {
                    configData.put(
                            "runningProOrHigher",
                            applicationContext.getBean("runningProOrHigher", Boolean.class));
                }
                if (applicationContext.containsBean("runningEE")) {
                    configData.put(
                            "runningEE", applicationContext.getBean("runningEE", Boolean.class));
                }
                if (applicationContext.containsBean("license")) {
                    configData.put("license", applicationContext.getBean("license", String.class));
                }
                if (applicationContext.containsBean("GoogleDriveEnabled")) {
                    configData.put(
                            "GoogleDriveEnabled",
                            applicationContext.getBean("GoogleDriveEnabled", Boolean.class));
                }
                if (applicationContext.containsBean("SSOAutoLogin")) {
                    configData.put(
                            "SSOAutoLogin",
                            applicationContext.getBean("SSOAutoLogin", Boolean.class));
                }
            } catch (Exception e) {
                // EE features not available, continue without them
            }

            return ResponseEntity.ok(configData);

        } catch (Exception e) {
            // Return basic config if there are any issues
            configData.put("error", "Unable to retrieve full configuration");
            return ResponseEntity.ok(configData);
        }
    }

    @GetMapping("/endpoint-enabled")
    public ResponseEntity<Boolean> isEndpointEnabled(@RequestParam(name = "endpoint") String endpoint) {
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
}
