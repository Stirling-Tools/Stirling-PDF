package stirling.software.proprietary.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine.AiEngineMode;
import stirling.software.proprietary.accountlink.AccountLinkProperties;
import stirling.software.proprietary.accountlink.DeviceCredential;
import stirling.software.proprietary.accountlink.DeviceCredentialStore;

/**
 * Resolves which AI engine a call should go to and how it authenticates there.
 *
 * <p>Previously every call site built {@code aiEngine.url + path} and attached a shared secret read
 * from the environment once at construction. That is still what self-hosted mode does; cloud mode
 * sends the account-link device credential to Stirling Cloud's instance AI gateway instead, and the
 * customer runs no engine at all.
 *
 * <p>Deliberately not profile-scoped: {@code AiEngineClient} is unprofiled and serves Stirling
 * Cloud's own AI endpoints too, so a router missing under the saas profile would stop that context
 * starting. On saas the mode is never CLOUD, so it always resolves to the engine in the cluster.
 *
 * <p>The device credential store is optional: account linking can be compiled in but switched off,
 * and a desktop bundle registers none of it. Cloud mode without a credential is a configuration
 * error the admin has to see, so it fails loudly rather than quietly falling back to a local URL
 * that is almost certainly not running.
 */
@Slf4j
@Service
public class AiEngineRouter {

    /**
     * Path the cloud gateway is mounted at. Inside {@code /api/v1/instance/**} on purpose - that is
     * the only prefix the device credential authenticates on, so nothing about the filter's scope
     * has to be widened for this.
     */
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

    /** Explicit-dependency form: the shared secret is supplied rather than read from the env. */
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

    /**
     * A router that can only ever resolve to a self-hosted engine, for callers and tests with no
     * account-link beans in scope. Cloud mode would have nothing to authenticate with, so it is not
     * reachable through this factory - {@link #resolve()} would refuse it anyway.
     */
    public static AiEngineRouter selfHosted(
            ApplicationProperties applicationProperties, String engineSharedSecret) {
        return new AiEngineRouter(applicationProperties, absent(), absent(), engineSharedSecret);
    }

    private static <T> ObjectProvider<T> absent() {
        return new ObjectProvider<>() {
            @Override
            public T getObject() {
                throw new IllegalStateException("no bean available");
            }

            @Override
            public T getObject(Object... args) {
                throw new IllegalStateException("no bean available");
            }

            @Override
            public T getIfAvailable() {
                return null;
            }

            @Override
            public T getIfUnique() {
                return null;
            }
        };
    }

    public boolean isCloudMode() {
        return applicationProperties.getAiEngine().getMode() == AiEngineMode.CLOUD;
    }

    /**
     * Whether a document's text may be kept and indexed for later questions. Always true
     * self-hosted, where the store is the customer's own; admin-controlled in cloud mode, where the
     * copy would outlive the request on someone else's disk.
     */
    public boolean documentIndexingAllowed() {
        return !isCloudMode() || applicationProperties.getAiEngine().isCloudDocumentIndexing();
    }

    /**
     * @throws ResponseStatusException when cloud mode is selected but this server is not linked, or
     *     the SaaS base URL is unusable - both admin-visible misconfigurations, not runtime faults.
     */
    public AiEngineTarget resolve() {
        if (!isCloudMode()) {
            return new AiEngineTarget(
                    trimTrailingSlashes(applicationProperties.getAiEngine().getUrl()),
                    engineSharedSecret == null || engineSharedSecret.isBlank()
                            ? Map.of()
                            : Map.of(HEADER_ENGINE_AUTH, engineSharedSecret),
                    false);
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

        String base = cloudBaseUrl();
        if (base.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Stirling Cloud AI is selected but no Stirling Cloud address is configured.");
        }

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HEADER_DEVICE_ID, credential.getDeviceId());
        headers.put(HEADER_DEVICE_SECRET, credential.getDeviceSecret());
        return new AiEngineTarget(base + CLOUD_GATEWAY_PATH, headers, true);
    }

    /**
     * The Stirling Cloud host this server would call, with no gateway path on it. Public because
     * the status endpoint probes the host's own {@code /api/v1/info/status}, which sits outside the
     * gateway and needs no credential.
     *
     * @return the base URL, or empty when none is configured
     */
    public String cloudHost() {
        return cloudBaseUrl();
    }

    /**
     * The configured API host, or the account-link host when it is blank. One host serves both in a
     * single-origin deployment; they differ when the API sits on its own name.
     */
    private String cloudBaseUrl() {
        String configured =
                trimTrailingSlashes(applicationProperties.getAiEngine().getCloudBaseUrl());
        if (!configured.isEmpty()) {
            return configured;
        }
        AccountLinkProperties linkProperties = accountLinkProperties.getIfAvailable();
        return linkProperties == null ? "" : trimTrailingSlashes(linkProperties.getSaasBaseUrl());
    }

    private static String trimTrailingSlashes(String value) {
        return value == null ? "" : value.strip().replaceAll("/+$", "");
    }
}
