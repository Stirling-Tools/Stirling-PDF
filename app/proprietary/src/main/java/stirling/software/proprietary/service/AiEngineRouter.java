package stirling.software.proprietary.service;

import java.net.URI;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine.AiEngineMode;
import stirling.software.proprietary.accountlink.AccountLinkProperties;
import stirling.software.proprietary.accountlink.DeviceCredential;
import stirling.software.proprietary.accountlink.DeviceCredentialStore;

/**
 * Picks where an AI engine call goes: the configured engine with the shared secret, or Stirling
 * Cloud's gateway with this server's account-link device credential.
 */
@Service
public class AiEngineRouter {

    /** Under {@code /api/v1/instance}, the only prefix the device credential authenticates on. */
    static final String CLOUD_GATEWAY_PATH = "/api/v1/instance/ai";

    static final String HEADER_ENGINE_AUTH = "X-Engine-Auth";
    static final String HEADER_DEVICE_ID = "X-Device-Id";
    static final String HEADER_DEVICE_SECRET = "X-Device-Secret";

    private final ApplicationProperties applicationProperties;
    private final ObjectProvider<DeviceCredentialStore> credentialStore;
    private final ObjectProvider<AccountLinkProperties> accountLinkProperties;
    private final String engineSharedSecret;

    @Autowired
    public AiEngineRouter(
            ApplicationProperties applicationProperties,
            ObjectProvider<DeviceCredentialStore> credentialStore,
            ObjectProvider<AccountLinkProperties> accountLinkProperties) {
        this(
                applicationProperties,
                credentialStore,
                accountLinkProperties,
                System.getenv("STIRLING_ENGINE_SHARED_SECRET"));
    }

    public AiEngineRouter(
            ApplicationProperties applicationProperties,
            ObjectProvider<DeviceCredentialStore> credentialStore,
            ObjectProvider<AccountLinkProperties> accountLinkProperties,
            String engineSharedSecret) {
        this.applicationProperties = applicationProperties;
        this.credentialStore = credentialStore;
        this.accountLinkProperties = accountLinkProperties;
        this.engineSharedSecret = engineSharedSecret;
    }

    /** A router without account-link beans, so cloud mode always fails to resolve. */
    public static AiEngineRouter selfHosted(
            ApplicationProperties applicationProperties, String engineSharedSecret) {
        return new AiEngineRouter(applicationProperties, absent(), absent(), engineSharedSecret);
    }

    private static <T> ObjectProvider<T> absent() {
        return new ObjectProvider<>() {
            @Override
            public Stream<T> stream() {
                return Stream.empty();
            }
        };
    }

    public boolean isCloudMode() {
        return applicationProperties.getAiEngine().getMode() == AiEngineMode.CLOUD;
    }

    /** Always true self-hosted; in cloud mode only when the admin lets Stirling Cloud keep text. */
    public boolean documentIndexingAllowed() {
        return !isCloudMode() || applicationProperties.getAiEngine().isCloudDocumentIndexing();
    }

    /**
     * @throws ResponseStatusException 503 in cloud mode when this server is not linked or has no
     *     usable Stirling Cloud address
     */
    public AiEngineTarget resolve() {
        if (!isCloudMode()) {
            return selfHostedTarget();
        }
        DeviceCredential credential =
                Optional.ofNullable(credentialStore.getIfAvailable())
                        .flatMap(DeviceCredentialStore::get)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.SERVICE_UNAVAILABLE,
                                                "Stirling Cloud AI is selected but this server is"
                                                        + " not linked to a Stirling account."));
        String host = cloudHost();
        if (host.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Stirling Cloud AI is selected but no Stirling Cloud address is configured.");
        }
        return new AiEngineTarget(
                host + CLOUD_GATEWAY_PATH,
                Map.of(
                        HEADER_DEVICE_ID, credential.getDeviceId(),
                        HEADER_DEVICE_SECRET, credential.getDeviceSecret()),
                true);
    }

    /** The configured engine regardless of mode, which is what Stirling Cloud's gateway calls. */
    public AiEngineTarget selfHostedTarget() {
        return new AiEngineTarget(
                trimTrailingSlashes(applicationProperties.getAiEngine().getUrl()),
                engineSharedSecret == null || engineSharedSecret.isBlank()
                        ? Map.of()
                        : Map.of(HEADER_ENGINE_AUTH, engineSharedSecret),
                false);
    }

    /**
     * {@code aiEngine.cloudBaseUrl}, else the account-link host, with no gateway path; empty when
     * neither is set.
     *
     * @throws ResponseStatusException when the URL is not safe to send the device credential to
     */
    public String cloudHost() {
        String host = trimTrailingSlashes(applicationProperties.getAiEngine().getCloudBaseUrl());
        if (host.isEmpty()) {
            AccountLinkProperties linkProperties = accountLinkProperties.getIfAvailable();
            host =
                    linkProperties == null
                            ? ""
                            : trimTrailingSlashes(linkProperties.getSaasBaseUrl());
        }
        return host.isEmpty() ? host : requireCredentialSafe(host);
    }

    private static String requireCredentialSafe(String base) {
        try {
            URI uri = URI.create(base);
            String host = uri.getHost();
            boolean loopback =
                    "localhost".equalsIgnoreCase(host)
                            || "127.0.0.1".equals(host)
                            || "[::1]".equals(host);
            if (host != null
                    && uri.getRawUserInfo() == null
                    && uri.getRawQuery() == null
                    && uri.getRawFragment() == null
                    && (uri.getPort() == -1 || (uri.getPort() > 0 && uri.getPort() <= 65535))
                    && ("https".equalsIgnoreCase(uri.getScheme())
                            || ("http".equalsIgnoreCase(uri.getScheme()) && loopback))) {
                return base;
            }
        } catch (IllegalArgumentException ignored) {
            // Malformed URLs get the same error as unsafe ones.
        }
        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Stirling Cloud AI requires a valid HTTPS base URL without user info, query or"
                        + " fragment. HTTP is allowed only for localhost, 127.0.0.1 or [::1].");
    }

    private static String trimTrailingSlashes(String value) {
        return value == null ? "" : value.strip().replaceAll("/+$", "");
    }
}
