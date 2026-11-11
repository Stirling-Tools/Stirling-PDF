package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SsoAutoLoginEnvironmentMigrationTest {

    @ParameterizedTest
    @ValueSource(strings = {"PREMIUM_PROFEATURES_SSOAUTOLOGIN", "ENTERPRISEEDITION_SSOAUTOLOGIN"})
    void acceptsLegacyEnvironmentVariables(String key) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.migrateSsoAutoLoginFromEnvironment(Map.of(key, "true"));
        assertTrue(properties.getSecurity().isSsoAutoLogin());
        properties.migrateSsoAutoLoginFromEnvironment(Map.of(key, "false"));
        assertFalse(properties.getSecurity().isSsoAutoLogin());
    }

    @Test
    void newEnvironmentVariableWinsWhenFalse() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setSsoAutoLogin(true);
        properties.migrateSsoAutoLoginFromEnvironment(
                Map.of(
                        "SECURITY_SSOAUTOLOGIN",
                        "false",
                        "PREMIUM_PROFEATURES_SSOAUTOLOGIN",
                        "true"));
        assertFalse(properties.getSecurity().isSsoAutoLogin());
    }

    @Test
    void proEnvironmentVariableWinsOverEnterpriseWhenFalse() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.migrateSsoAutoLoginFromEnvironment(
                Map.of(
                        "PREMIUM_PROFEATURES_SSOAUTOLOGIN",
                        "false",
                        "ENTERPRISEEDITION_SSOAUTOLOGIN",
                        "true"));
        assertFalse(properties.getSecurity().isSsoAutoLogin());
    }

    @Test
    void noEnvironmentVariablePreservesConfiguredValue() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setSsoAutoLogin(true);
        properties.migrateSsoAutoLoginFromEnvironment(Map.of());
        assertTrue(properties.getSecurity().isSsoAutoLogin());
    }
}
