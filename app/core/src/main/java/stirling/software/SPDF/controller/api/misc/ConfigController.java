package stirling.software.SPDF.controller.api.misc;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.microprofile.config.ConfigProvider;

import io.swagger.v3.oas.annotations.Hidden;
import io.vertx.core.http.HttpServerRequest;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.EndpointAvailability;
import stirling.software.SPDF.config.InitialSetup;
import stirling.software.SPDF.controller.api.security.TimestampController;
import stirling.software.common.annotations.api.ConfigApi;
import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.SpringContextHolder;

@ConfigApi
@Path("/api/v1/config")
@ApplicationScoped
@Hidden
@Slf4j
public class ConfigController {

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;
    private final stirling.software.SPDF.config.ExternalAppDepConfig externalAppDepConfig;

    // @Autowired(required=false) -> Instance<T> for optional (possibly-absent) CDI beans.
    private final Instance<ServerCertificateServiceInterface> serverCertificateService;
    private final Instance<UserServiceInterface> userService;
    private final Instance<stirling.software.common.service.LicenseServiceInterface> licenseService;

    @Inject
    public ConfigController(
            ApplicationProperties applicationProperties,
            EndpointConfiguration endpointConfiguration,
            Instance<ServerCertificateServiceInterface> serverCertificateService,
            Instance<UserServiceInterface> userService,
            Instance<stirling.software.common.service.LicenseServiceInterface> licenseService,
            stirling.software.SPDF.config.ExternalAppDepConfig externalAppDepConfig) {
        this.applicationProperties = applicationProperties;
        this.endpointConfiguration = endpointConfiguration;
        this.serverCertificateService = serverCertificateService;
        this.userService = userService;
        this.licenseService = licenseService;
        this.externalAppDepConfig = externalAppDepConfig;
    }

    private ServerCertificateServiceInterface serverCertificateService() {
        return serverCertificateService.isResolvable() ? serverCertificateService.get() : null;
    }

    private UserServiceInterface userService() {
        return userService.isResolvable() ? userService.get() : null;
    }

    private stirling.software.common.service.LicenseServiceInterface licenseService() {
        return licenseService.isResolvable() ? licenseService.get() : null;
    }

    /**
     * Get current license type dynamically instead of from cached bean. This ensures the frontend
     * sees updated license status after admin changes the license key.
     */
    private String getCurrentLicenseType() {
        // Use LicenseService for fresh license status if available
        stirling.software.common.service.LicenseServiceInterface license = licenseService();
        if (license != null) {
            return license.getLicenseTypeName();
        }

        // Fallback to cached bean if service not available
        return SpringContextHolder.getBean("license");
    }

    /** Check if running Pro or higher (SERVER or ENTERPRISE license) dynamically. */
    private Boolean isRunningProOrHigher() {
        // Use LicenseService for fresh license status if available
        stirling.software.common.service.LicenseServiceInterface license = licenseService();
        if (license != null) {
            return license.isRunningProOrHigher();
        }

        // Fallback to cached bean
        return SpringContextHolder.getBean("runningProOrHigher");
    }

    /**
     * Resolve the frontend URL the client should advertise to phones / share-link recipients.
     * Priority: explicit system.frontendUrl, then the Host the user is already using to reach this
     * server (works for Docker, reverse proxies, and bare-metal LANs), then a detected site-local
     * IPv4, then empty.
     */
    // visible for testing
    String resolveFrontendUrl(HttpServerRequest request, AppConfig appConfig) {
        String configured = applicationProperties.getSystem().getFrontendUrl();
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        if (request != null && request.authority() != null) {
            String host = request.authority().host();
            if (host != null && !host.isBlank() && !isLoopbackHost(host)) {
                String scheme = request.scheme();
                // Vert.x HostAndPort.port() returns -1 when the authority carries no explicit port;
                // fall back to the scheme default so the comparison/URL stays correct.
                int port = request.authority().port();
                if (port <= 0) {
                    port = "https".equals(scheme) ? 443 : 80;
                }
                boolean defaultPort =
                        ("http".equals(scheme) && port == 80)
                                || ("https".equals(scheme) && port == 443);
                return defaultPort ? scheme + "://" + host : scheme + "://" + host + ":" + port;
            }
        }
        String localIp = GeneralUtils.getLocalNetworkIp();
        if (localIp != null) {
            String scheme = appConfig.getBackendUrl().startsWith("https") ? "https" : "http";
            return scheme + "://" + localIp + ":" + resolveEffectiveServerPort(appConfig);
        }
        return "";
    }

    /**
     * The port the embedded server is actually listening on. With {@code server.port=0} (an
     * ephemeral port, which the desktop bundle uses to dodge port clashes) the configured value
     * stays {@code "0"} while Spring publishes the real bound port as {@code local.server.port}
     * once the server is up. Advertised URLs (the mobile-scanner QR, share links) must carry the
     * real port - a literal {@code :0} is unreachable and browsers reject it as ERR_UNSAFE_PORT.
     */
    // visible for testing
    String resolveEffectiveServerPort(AppConfig appConfig) {
        String configured = appConfig.getServerPort();
        if (configured == null || "0".equals(configured.trim())) {
            // TODO: Migration required - Spring exposed the real bound ephemeral port as the
            // "local.server.port" property. Quarkus binds via quarkus.http.port and does not
            // publish "local.server.port" by default; verify the actual bound port is surfaced
            // under this key (or update the key) when server.port=0 is used by the desktop bundle.
            String actual =
                    ConfigProvider.getConfig()
                            .getOptionalValue("local.server.port", String.class)
                            .orElse(null);
            if (actual != null && !actual.isBlank()) {
                return actual;
            }
        }
        return configured;
    }

    private static boolean isLoopbackHost(String host) {
        return "localhost".equalsIgnoreCase(host)
                || "127.0.0.1".equals(host)
                || "::1".equals(host)
                || "0:0:0:0:0:0:0:1".equals(host);
    }

    /** Check if running Enterprise edition dynamically. */
    private Boolean isRunningEE() {
        // Use LicenseService for fresh license status if available
        stirling.software.common.service.LicenseServiceInterface license = licenseService();
        if (license != null) {
            return license.isRunningEE();
        }

        // Fallback to cached bean
        return SpringContextHolder.getBean("runningEE");
    }

    @GET
    @Path("/app-config")
    public Response getAppConfig(@Context HttpServerRequest request) {
        Map<String, Object> configData = new HashMap<>();

        try {
            // Add dependency check status
            configData.put("dependenciesReady", externalAppDepConfig.isDependenciesChecked());

            // Get AppConfig bean
            AppConfig appConfig = SpringContextHolder.getBean(AppConfig.class);

            // Extract key configuration values from AppConfig
            // Note: Frontend expects "baseUrl" field name for compatibility
            configData.put("baseUrl", appConfig.getBackendUrl());
            configData.put("contextPath", appConfig.getContextPath());
            configData.put("serverPort", resolveEffectiveServerPort(appConfig));

            String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
            configData.put("frontendUrl", resolveFrontendUrl(request, appConfig));

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

            // User preference defaults
            configData.put(
                    "defaultHideUnavailableTools",
                    applicationProperties.getUi().isDefaultHideUnavailableTools());
            configData.put(
                    "defaultHideUnavailableConversions",
                    applicationProperties.getUi().isDefaultHideUnavailableConversions());

            // Hide disabled tools settings
            configData.put(
                    "hideDisabledToolsGoogleDrive",
                    applicationProperties.getUi().getHideDisabledTools().isGoogleDrive());
            configData.put(
                    "hideDisabledToolsMobileQRScanner",
                    applicationProperties.getUi().getHideDisabledTools().isMobileQRScanner());

            // Google Drive backend settings (only if enabled)
            ApplicationProperties.Premium.ProFeatures.GoogleDrive googleDrive =
                    applicationProperties.getPremium().getProFeatures().getGoogleDrive();
            if (googleDrive.isEnabled()) {
                configData.put("googleDriveEnabled", true);
                configData.put("googleDriveClientId", googleDrive.getClientId());
                configData.put("googleDriveApiKey", googleDrive.getApiKey());
                configData.put("googleDriveAppId", googleDrive.getAppId());
            }

            // Security settings
            // enableLogin requires both the config flag AND proprietary features to be loaded
            // If userService is null, proprietary module isn't loaded
            // (DISABLE_ADDITIONAL_FEATURES=true or DOCKER_ENABLE_SECURITY=false)
            UserServiceInterface user = userService();
            boolean enableLogin =
                    applicationProperties.getSecurity().isEnableLogin() && user != null;
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

            // Storage settings
            boolean storageEnabled = enableLogin && applicationProperties.getStorage().isEnabled();
            boolean sharingEnabled =
                    storageEnabled && applicationProperties.getStorage().getSharing().isEnabled();
            boolean frontendUrlConfigured = frontendUrl != null && !frontendUrl.trim().isEmpty();
            boolean shareLinksEnabled =
                    sharingEnabled
                            && applicationProperties.getStorage().getSharing().isLinkEnabled()
                            && frontendUrlConfigured;
            boolean shareEmailEnabled =
                    sharingEnabled
                            && applicationProperties.getStorage().getSharing().isEmailEnabled()
                            && applicationProperties.getMail().isEnabled();
            boolean groupSigningEnabled =
                    storageEnabled && applicationProperties.getStorage().getSigning().isEnabled();
            configData.put("storageEnabled", storageEnabled);
            configData.put("storageSharingEnabled", sharingEnabled);
            configData.put("storageShareLinksEnabled", shareLinksEnabled);
            configData.put("storageShareEmailEnabled", shareEmailEnabled);
            configData.put("storageGroupSigningEnabled", groupSigningEnabled);

            // Check if user is admin using UserServiceInterface
            boolean isAdmin = false;
            if (user != null) {
                try {
                    isAdmin = user.isCurrentUserAdmin();
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
            if (user != null) {
                try {
                    isNewUser = user.isCurrentUserFirstLogin();
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

            // AI Engine settings
            configData.put("aiEngineEnabled", applicationProperties.getAiEngine().isEnabled());

            // Timestamp TSA settings — single source of truth for presets + admin URLs
            ApplicationProperties.Security.Timestamp tsConfig =
                    applicationProperties.getSecurity().getTimestamp();
            configData.put("timestampDefaultTsaUrl", tsConfig.getDefaultTsaUrl());
            configData.put("timestampCustomTsaUrls", tsConfig.getCustomTsaUrls());
            configData.put("timestampTsaPresets", TimestampController.TSA_PRESETS);

            // Server certificate settings
            ServerCertificateServiceInterface certService = serverCertificateService();
            configData.put(
                    "serverCertificateEnabled", certService != null && certService.isEnabled());

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

                Boolean ssoAutoLogin = SpringContextHolder.getBean("SSOAutoLogin");
                if (ssoAutoLogin != null) {
                    configData.put("SSOAutoLogin", ssoAutoLogin);
                }
            } catch (Exception e) {
                // EE features not available, continue without them
            }

            // Add version and machine info for update checking
            try {
                String appVersion = SpringContextHolder.getBean("appVersion");
                if (appVersion != null) {
                    configData.put("appVersion", appVersion);
                }
                String machineType = SpringContextHolder.getBean("machineType");
                if (machineType != null) {
                    configData.put("machineType", machineType);
                }
                Boolean activeSecurity = SpringContextHolder.getBean("activeSecurity");
                if (activeSecurity != null) {
                    configData.put("activeSecurity", activeSecurity);
                }
            } catch (Exception e) {
                // Version/machine info not available
            }

            return Response.ok(configData).build();

        } catch (Exception e) {
            // Return basic config if there are any issues
            configData.put("error", "Unable to retrieve full configuration");
            return Response.ok(configData).build();
        }
    }

    @GET
    @Path("/endpoint-enabled")
    public Response isEndpointEnabled(@QueryParam("endpoint") String endpoint) {
        boolean enabled = endpointConfiguration.isEndpointEnabled(endpoint);
        return Response.ok(enabled).build();
    }

    @GET
    @Path("/endpoints-enabled")
    public Response areEndpointsEnabled(@QueryParam("endpoints") String endpoints) {
        Map<String, Boolean> result = new HashMap<>();
        String[] endpointArray = endpoints.split(",");
        for (String endpoint : endpointArray) {
            String trimmedEndpoint = endpoint.trim();
            result.put(trimmedEndpoint, endpointConfiguration.isEndpointEnabled(trimmedEndpoint));
        }
        return Response.ok(result).build();
    }

    @GET
    @Path("/endpoints-availability")
    public Response getEndpointAvailability(@QueryParam("endpoints") List<String> endpoints) {
        Collection<String> toCheck =
                (endpoints == null || endpoints.isEmpty())
                        ? endpointConfiguration.getAllEndpoints()
                        : endpoints;
        Map<String, EndpointAvailability> result = new HashMap<>();
        for (String endpoint : toCheck) {
            String trimmedEndpoint = endpoint.trim();
            result.put(
                    trimmedEndpoint,
                    endpointConfiguration.getEndpointAvailability(trimmedEndpoint));
        }
        return Response.ok(result).build();
    }

    @GET
    @Path("/group-enabled")
    public Response isGroupEnabled(@QueryParam("group") String group) {
        boolean enabled = endpointConfiguration.isGroupEnabled(group);
        return Response.ok(enabled).build();
    }
}
