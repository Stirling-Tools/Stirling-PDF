package stirling.software.proprietary.storage.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

/**
 * Verifies the Pro/Enterprise license gate on the S3 storage backend without touching real S3
 * clients (and without needing Docker). Provider-specific construction is delegated to the existing
 * provider tests.
 */
class StorageProviderConfigTest {

    @Test
    void provider_local_normalLicense_buildsLocalProviderWithoutLicenseCheck() {
        StorageProviderConfig cfg = newConfig("local", License.NORMAL);

        StorageProvider provider = cfg.storageProvider();
        assertThat(provider).isInstanceOf(LocalStorageProvider.class);
    }

    @Test
    void provider_s3_normalLicense_throwsBeforeBuildingClient() {
        StorageProviderConfig cfg = newConfig("s3", License.NORMAL);

        // License check must throw BEFORE S3Clients.build tries to validate endpoint / bucket.
        // Otherwise an empty config would surface as a confusing "bucket must be set" error.
        assertThatThrownBy(cfg::storageProvider)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.provider=s3 requires a Pro or Enterprise license");
    }

    @Test
    void provider_database_normalLicense_throws() {
        StorageProviderConfig cfg = newConfig("database", License.NORMAL);

        assertThatThrownBy(cfg::storageProvider)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "storage.provider=database requires a Pro or Enterprise license");
    }

    @Test
    void provider_database_serverLicense_buildsDatabaseProvider() {
        StorageProviderConfig cfg = newConfig("database", License.SERVER);
        assertThatCode(cfg::storageProvider).doesNotThrowAnyException();
    }

    @Test
    void provider_s3_serverLicense_passesLicenseCheck_thenFailsOnEmptyConfig() {
        StorageProviderConfig cfg = newConfig("s3", License.SERVER);

        // Valid license, but no bucket/endpoint configured - so we expect a CONFIG error,
        // not a license error. The error message must not mention the license.
        assertThatThrownBy(cfg::storageProvider)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("Pro or Enterprise license");
    }

    @Test
    void provider_s3_enterpriseLicense_passesLicenseCheck_thenFailsOnEmptyConfig() {
        StorageProviderConfig cfg = newConfig("s3", License.ENTERPRISE);

        assertThatThrownBy(cfg::storageProvider)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("Pro or Enterprise license");
    }

    @Test
    void provider_unknown_normalLicense_throwsUnsupportedProvider_notLicense() {
        StorageProviderConfig cfg = newConfig("magic", License.NORMAL);

        assertThatThrownBy(cfg::storageProvider)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Storage provider not supported: magic")
                .hasMessageNotContaining("license");
    }

    private static StorageProviderConfig newConfig(String provider, License license) {
        ApplicationProperties props = new ApplicationProperties();
        props.getStorage().setProvider(provider);
        props.getStorage()
                .setEnabled(false); // local-fallback path skips dir creation when disabled
        StoredFileBlobRepository repo = mock(StoredFileBlobRepository.class);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        when(checker.getPremiumLicenseEnabledResult()).thenReturn(license);
        if (license == License.SERVER || license == License.ENTERPRISE) {
            doNothing().when(checker).requireProOrEnterprise(anyString());
        } else {
            // Mirror real LicenseKeyChecker.requireProOrEnterprise so message assertions match.
            doAnswer(
                            inv -> {
                                throw new IllegalStateException(
                                        inv.getArgument(0)
                                                + " requires a Pro or Enterprise license");
                            })
                    .when(checker)
                    .requireProOrEnterprise(anyString());
        }
        return new StorageProviderConfig(props, repo, checker);
    }
}
