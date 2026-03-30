package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.oauth2.Provider;

class ProviderUtilsAdditionalTest {

    @Test
    void testValidateProvider_null() {
        assertFalse(ProviderUtils.validateProvider(null));
    }

    @Test
    void testValidateProvider_nullClientId() {
        Provider provider = new Provider();
        provider.setClientId(null);
        provider.setClientSecret("secret");
        provider.setScopes("read");
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_emptyClientId() {
        Provider provider = new Provider();
        provider.setClientId("");
        provider.setClientSecret("secret");
        provider.setScopes("read");
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_blankClientId() {
        Provider provider = new Provider();
        provider.setClientId("   ");
        provider.setClientSecret("secret");
        provider.setScopes("read");
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_nullClientSecret() {
        Provider provider = new Provider();
        provider.setClientId("id");
        provider.setClientSecret(null);
        provider.setScopes("read");
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_emptyClientSecret() {
        Provider provider = new Provider();
        provider.setClientId("id");
        provider.setClientSecret("");
        provider.setScopes("read");
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_nullScopes() {
        Provider provider = new Provider();
        provider.setClientId("id");
        provider.setClientSecret("secret");
        provider.setScopes(null);
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_emptyScopes() {
        Provider provider = new Provider();
        provider.setClientId("id");
        provider.setClientSecret("secret");
        provider.setScopes("");
        assertFalse(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_allFieldsValid() {
        Provider provider = new Provider();
        provider.setClientId("my-client-id");
        provider.setClientSecret("my-secret");
        provider.setScopes("openid,profile");
        assertTrue(ProviderUtils.validateProvider(provider));
    }

    @Test
    void testValidateProvider_singleScope() {
        Provider provider = new Provider();
        provider.setClientId("id");
        provider.setClientSecret("secret");
        provider.setScopes("email");
        assertTrue(ProviderUtils.validateProvider(provider));
    }
}
