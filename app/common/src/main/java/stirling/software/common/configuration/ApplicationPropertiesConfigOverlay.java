package stirling.software.common.configuration;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;

import io.quarkus.runtime.StartupEvent;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.interceptor.Interceptor;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Overlays MicroProfile/Quarkus config (env vars, application.properties) onto {@link
 * ApplicationProperties} at startup.
 *
 * <p>The Spring {@code @ConfigurationProperties} binding that populated {@code
 * ApplicationProperties} from {@code settings.yml} + env was never migrated, so the POJO otherwise
 * carries only its Java defaults (this is the root cause behind the {@code maxDPI=0} / {@code
 * loginAttemptCount=0} class of bugs and ignored {@code SECURITY_*}/{@code STORAGE_*} env vars).
 * SmallRye maps an env var like {@code SECURITY_ENABLELOGIN} to the property {@code
 * security.enableLogin}, so each key below is pulled from config and applied in place on the shared
 * bean (nested objects are referenced by the {@code AppConfig} producers, so mutating them
 * propagates everywhere).
 *
 * <p>Runs before {@link stirling.software.proprietary.security.InitialSecuritySetup} (low
 * {@code @Priority}) because that startup step reads {@code customGlobalAPIKey} and {@code
 * enableLogin}.
 *
 * <p>TODO: this is a focused subset (auth/storage/SSO). A complete migration would bind every
 * ApplicationProperties field generically (e.g. via {@code @ConfigMapping} or a reflective overlay)
 * and also read {@code settings.yml}.
 */
@Slf4j
@ApplicationScoped
public class ApplicationPropertiesConfigOverlay {

    @Inject ApplicationProperties applicationProperties;

    void onStart(@Observes @Priority(Interceptor.Priority.APPLICATION) StartupEvent event) {
        Config config = ConfigProvider.getConfig();
        ApplicationProperties.Security security = applicationProperties.getSecurity();

        applyBoolean(config, "security.enableLogin", security::setEnableLogin);
        applyString(config, "security.loginMethod", security::setLoginMethod);
        applyString(config, "security.customGlobalAPIKey", security::setCustomGlobalAPIKey);
        applyBoolean(config, "storage.enabled", applicationProperties.getStorage()::setEnabled);

        // SSO toggles. The detailed OAuth2 provider config (issuer/clientId/...) is read directly
        // from MicroProfile config by OAuth2LoginController; the SAML provider config likewise by
        // the
        // SAML SP. Only the booleans the service layer reads via ApplicationProperties are bound
        // here.
        if (security.getSaml2() != null) {
            applyBoolean(config, "security.saml2.enabled", security.getSaml2()::setEnabled);
            applyBoolean(
                    config,
                    "security.saml2.autoCreateUser",
                    security.getSaml2()::setAutoCreateUser);
            // provider/registrationId drive the SAML login button on /login
            // (ProprietaryUIDataController
            // reads them off ApplicationProperties); without these the button path is
            // "/saml2/authenticate/null" and the SSO option never renders.
            applyString(config, "security.saml2.provider", security.getSaml2()::setProvider);
            applyString(
                    config,
                    "security.saml2.registrationId",
                    security.getSaml2()::setRegistrationId);
        }
        if (security.getOauth2() != null) {
            applyBoolean(config, "security.oauth2.enabled", security.getOauth2()::setEnabled);
            applyBoolean(
                    config,
                    "security.oauth2.autoCreateUser",
                    security.getOauth2()::setAutoCreateUser);
        }

        // Premium/enterprise license. LicenseKeyChecker.evaluateLicense() short-circuits when
        // premium.enabled is false and otherwise reads premium.key, so both must be overlaid from
        // config (PREMIUM_ENABLED / PREMIUM_KEY env) before the StartupEvent license evaluation
        // runs
        // - otherwise the license never loads (type stays NORMAL) and premium-gated features (SAML
        // SSO button, audit, teams) stay disabled. This overlay's StartupEvent observer has
        // @Priority(APPLICATION) (2000), ahead of LicenseKeyChecker.onApplicationReady (default
        // 2500),
        // so the re-evaluation there sees the bound values.
        if (applicationProperties.getPremium() != null) {
            applyBoolean(config, "premium.enabled", applicationProperties.getPremium()::setEnabled);
            applySecret(config, "premium.key", applicationProperties.getPremium()::setKey);
        }
    }

    private void applyBoolean(
            Config config, String key, java.util.function.Consumer<Boolean> setter) {
        config.getOptionalValue(key, Boolean.class)
                .ifPresent(
                        value -> {
                            setter.accept(value);
                            log.info("Applied config override {}={}", key, value);
                        });
    }

    private void applyString(
            Config config, String key, java.util.function.Consumer<String> setter) {
        config.getOptionalValue(key, String.class)
                .ifPresent(
                        value -> {
                            setter.accept(value);
                            log.info("Applied config override {}={}", key, value);
                        });
    }

    /**
     * Like {@link #applyString} but never logs the value - used for secrets (e.g. the premium
     * license key) so they don't leak into logs or CI artifacts.
     */
    private void applySecret(
            Config config, String key, java.util.function.Consumer<String> setter) {
        config.getOptionalValue(key, String.class)
                .ifPresent(
                        value -> {
                            setter.accept(value);
                            log.info("Applied config override {}=<redacted>", key);
                        });
    }
}
