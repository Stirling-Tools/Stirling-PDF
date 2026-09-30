package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine.AiEngineMode;
import stirling.software.proprietary.accountlink.AccountLinkProperties;
import stirling.software.proprietary.accountlink.DeviceCredential;
import stirling.software.proprietary.accountlink.DeviceCredentialStore;

/** Where an AI call goes, and what it carries to be trusted there. */
class AiEngineRouterTest {

    private static ApplicationProperties props(AiEngineMode mode) {
        ApplicationProperties props = new ApplicationProperties();
        props.getAiEngine().setEnabled(true);
        props.getAiEngine().setMode(mode);
        props.getAiEngine().setUrl("http://stirling-engine:5001/");
        return props;
    }

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> providing(T value) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(value);
        return provider;
    }

    private static DeviceCredentialStore linkedStore() {
        DeviceCredential credential = new DeviceCredential();
        credential.setDeviceId("dev-1");
        credential.setDeviceSecret("sec-1");
        DeviceCredentialStore store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(credential));
        return store;
    }

    private static AccountLinkProperties saasAt(String baseUrl) {
        AccountLinkProperties linkProps = new AccountLinkProperties();
        linkProps.setSaasBaseUrl(baseUrl);
        return linkProps;
    }

    @Test
    void selfHostedGoesToTheConfiguredUrlWithTheSharedSecret() {
        AiEngineRouter router = AiEngineRouter.selfHosted(props(AiEngineMode.SELF_HOSTED), "shh");

        AiEngineTarget target = router.resolve();

        assertThat(target.cloud()).isFalse();
        // The trailing slash in the configured URL must not survive into the request line.
        assertThat(target.urlFor("/health")).isEqualTo("http://stirling-engine:5001/health");
        assertThat(target.headers()).containsExactly(java.util.Map.entry("X-Engine-Auth", "shh"));
    }

    @Test
    void theSelfHostedTargetIsTheConfiguredEngineEvenInCloudMode() {
        // Stirling Cloud's gateway forwards to its own engine whatever the mode says.
        AiEngineRouter router = AiEngineRouter.selfHosted(props(AiEngineMode.CLOUD), "shh");

        AiEngineTarget target = router.selfHostedTarget();

        assertThat(target.cloud()).isFalse();
        assertThat(target.urlFor("/health")).isEqualTo("http://stirling-engine:5001/health");
        assertThat(target.headers()).containsExactly(java.util.Map.entry("X-Engine-Auth", "shh"));
    }

    @Test
    void selfHostedWithNoSecretSendsNoAuthHeader() {
        AiEngineRouter router = AiEngineRouter.selfHosted(props(AiEngineMode.SELF_HOSTED), "  ");

        assertThat(router.resolve().headers()).isEmpty();
    }

    @Test
    void cloudModeGoesToTheInstanceGatewayOnTheAccountLinkHostByDefault() {
        AiEngineRouter router =
                new AiEngineRouter(
                        props(AiEngineMode.CLOUD),
                        providing(linkedStore()),
                        providing(saasAt("https://stirling.com/app/")),
                        "shh");

        AiEngineTarget target = router.resolve();

        assertThat(target.cloud()).isTrue();
        // No API host configured: the credential was issued by the deployment this server linked
        // to, so that is where it goes. A fixed default sent staging servers' credentials to prod.
        assertThat(target.urlFor("/api/v1/orchestrator"))
                .isEqualTo("https://stirling.com/app/api/v1/instance/ai/api/v1/orchestrator");
        // The engine shared secret is this server's, and means nothing to Stirling Cloud.
        assertThat(target.headers())
                .containsOnly(
                        java.util.Map.entry("X-Device-Id", "dev-1"),
                        java.util.Map.entry("X-Device-Secret", "sec-1"));
    }

    @Test
    void cloudModeUsesTheConfiguredApiHostOverTheAccountLinkHost() {
        ApplicationProperties cloud = props(AiEngineMode.CLOUD);
        cloud.getAiEngine().setCloudBaseUrl("https://api.stirling.com/");
        AiEngineRouter router =
                new AiEngineRouter(
                        cloud,
                        providing(linkedStore()),
                        providing(saasAt("https://stirling.com/app")),
                        null);

        assertThat(router.resolve().urlFor("/health"))
                .isEqualTo("https://api.stirling.com/api/v1/instance/ai/health");
    }

    @Test
    void aBlankApiHostFallsBackToTheAccountLinkHost() {
        // One host serves both in a single-origin deployment.
        ApplicationProperties cloud = props(AiEngineMode.CLOUD);
        cloud.getAiEngine().setCloudBaseUrl("  ");
        AiEngineRouter router =
                new AiEngineRouter(
                        cloud,
                        providing(linkedStore()),
                        providing(saasAt("https://stirling.com/app")),
                        null);

        assertThat(router.resolve().urlFor("/health"))
                .isEqualTo("https://stirling.com/app/api/v1/instance/ai/health");
    }

    @Test
    void theCloudHostIsExposedWithoutTheGatewayPathOnIt() {
        // The public status endpoint sits outside the gateway, so the probe needs the bare host.
        ApplicationProperties cloud = props(AiEngineMode.CLOUD);
        cloud.getAiEngine().setCloudBaseUrl("https://api.stirling.com/");
        AiEngineRouter router =
                new AiEngineRouter(
                        cloud,
                        providing(linkedStore()),
                        providing(saasAt("https://stirling.com/app")),
                        null);

        assertThat(router.cloudHost()).isEqualTo("https://api.stirling.com");
        assertThat(router.resolve().baseUrl())
                .isEqualTo("https://api.stirling.com/api/v1/instance/ai");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://api.stirling.com",
                "http://localhost.attacker.example",
                "http://127.0.0.1.attacker.example",
                "http://localhost@attacker.example",
                "http://[::ffff:127.0.0.1]",
                "https:///missing-host",
                "https:opaque",
                "api.stirling.com",
                "//api.stirling.com",
                "ftp://api.stirling.com",
                "https://user:password@api.stirling.com",
                "https://api.stirling.com?redirect=elsewhere",
                "https://api.stirling.com#fragment",
                "https://api.stirling.com:65536",
                "https://api.stirling.com:0",
                "https://bad host"
            })
    void unsafeCloudUrlsAreRejectedForBothConfigurationSources(String baseUrl) {
        ApplicationProperties cloud = props(AiEngineMode.CLOUD);
        AiEngineRouter router =
                new AiEngineRouter(
                        cloud, providing(linkedStore()), providing(saasAt(baseUrl)), null);

        cloud.getAiEngine().setCloudBaseUrl(baseUrl);
        assertThatThrownBy(router::resolve)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503")
                .hasMessageContaining("HTTPS");
        assertThatThrownBy(router::cloudHost).isInstanceOf(ResponseStatusException.class);

        cloud.getAiEngine().setCloudBaseUrl("");
        assertThatThrownBy(router::resolve).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(router::cloudHost).isInstanceOf(ResponseStatusException.class);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "https://api.stirling.com",
                "https://custom.example/app",
                "HTTPS://api.stirling.com:443",
                "http://localhost:8081",
                "http://LOCALHOST:8081",
                "http://127.0.0.1:8081",
                "http://[::1]:8081"
            })
    void secureCloudAndExactLoopbackUrlsCanCarryTheDeviceCredential(String baseUrl) {
        ApplicationProperties cloud = props(AiEngineMode.CLOUD);
        cloud.getAiEngine().setCloudBaseUrl(baseUrl);
        AiEngineRouter router =
                new AiEngineRouter(cloud, providing(linkedStore()), providing(null), null);

        assertThat(router.resolve().baseUrl()).isEqualTo(baseUrl + "/api/v1/instance/ai");
        assertThat(router.resolve().headers()).containsEntry("X-Device-Secret", "sec-1");
        assertThat(router.cloudHost()).isEqualTo(baseUrl);
    }

    @Test
    void cloudModeWithoutALinkFailsLoudlyRatherThanCallingLocalhost() {
        DeviceCredentialStore unlinked = mock(DeviceCredentialStore.class);
        when(unlinked.get()).thenReturn(Optional.empty());
        AiEngineRouter router =
                new AiEngineRouter(
                        props(AiEngineMode.CLOUD),
                        providing(unlinked),
                        providing(saasAt("https://stirling.com/app")),
                        null);

        assertThatThrownBy(router::resolve)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not linked");
    }

    @Test
    void cloudModeWithNoAccountLinkBeansFailsLoudly() {
        AiEngineRouter router = AiEngineRouter.selfHosted(props(AiEngineMode.CLOUD), null);

        assertThatThrownBy(router::resolve).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void documentUploadIsAlwaysAllowedAgainstAnEngineTheCustomerRuns() {
        ApplicationProperties selfHosted = props(AiEngineMode.SELF_HOSTED);
        selfHosted.getAiEngine().setCloudDocumentIndexing(false);

        assertThat(AiEngineRouter.selfHosted(selfHosted, null).documentIndexingAllowed()).isTrue();
    }

    @Test
    void cloudDocumentUploadIsOffUntilAnAdminTurnsItOn() {
        ApplicationProperties cloud = props(AiEngineMode.CLOUD);
        AiEngineRouter router =
                new AiEngineRouter(
                        cloud, providing(linkedStore()), providing(saasAt("https://x/app")), null);

        assertThat(router.documentIndexingAllowed()).isFalse();

        cloud.getAiEngine().setCloudDocumentIndexing(true);
        assertThat(router.documentIndexingAllowed()).isTrue();
    }
}
