package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
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
    void selfHostedWithNoSecretSendsNoAuthHeader() {
        AiEngineRouter router = AiEngineRouter.selfHosted(props(AiEngineMode.SELF_HOSTED), "  ");

        assertThat(router.resolve().headers()).isEmpty();
    }

    @Test
    void cloudModeGoesToTheInstanceGatewayWithTheDeviceCredential() {
        AiEngineRouter router =
                new AiEngineRouter(
                        props(AiEngineMode.CLOUD),
                        providing(linkedStore()),
                        providing(saasAt("https://stirling.com/app/")),
                        "shh");

        AiEngineTarget target = router.resolve();

        assertThat(target.cloud()).isTrue();
        assertThat(target.urlFor("/api/v1/orchestrator"))
                .isEqualTo("https://api.stirling.com/api/v1/instance/ai/api/v1/orchestrator");
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
