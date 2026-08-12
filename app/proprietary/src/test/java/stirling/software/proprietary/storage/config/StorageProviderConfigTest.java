package stirling.software.proprietary.storage.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Base64;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.transaction.PlatformTransactionManager;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.crypto.EncryptingStorageProvider;
import stirling.software.proprietary.storage.crypto.InMemoryKeyRepo;
import stirling.software.proprietary.storage.crypto.StorageEncryptionAuditListener;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

/**
 * Verifies the Pro/Enterprise license gates and, critically, that the encryption decorator is
 * installed in EVERY configuration — a node whose config lags the cluster (flag off, key rows
 * already existing elsewhere) must never serve raw ciphertext.
 */
class StorageProviderConfigTest {

    private static final String MASTER =
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    private final InMemoryKeyRepo keyRepo = new InMemoryKeyRepo();
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);

    private StorageEncryptionState newState(StorageProviderConfig cfg) {
        return cfg.storageEncryptionState(MASTER, "", 1, false, txManager);
    }

    // ---- decorator installation matrix -------------------------------------------------

    @Test
    void decorator_alwaysInstalled_evenWhenEncryptionOffAndNoKeys() {
        StorageProviderConfig cfg = newConfig("local", License.NORMAL, false);
        StorageEncryptionState state = newState(cfg);

        StorageProvider provider = cfg.storageProvider(state, Optional.empty());
        assertThat(provider).isInstanceOf(EncryptingStorageProvider.class);
        assertThat(state.isWriteEnabled()).isFalse();
        // Nothing encrypted can exist -> the S3 fast path stays available.
        assertThat(state.suppressDirectDownloads()).isFalse();
    }

    @Test
    void decorator_writeEnabled_requiresLicenceAndSuppressesDirectDownloads() {
        StorageProviderConfig cfg = newConfig("local", License.SERVER, true);
        StorageEncryptionState state = newState(cfg);

        StorageProvider provider = cfg.storageProvider(state, Optional.empty());
        assertThat(provider).isInstanceOf(EncryptingStorageProvider.class);
        assertThat(state.isWriteEnabled()).isTrue();
        assertThat(state.suppressDirectDownloads()).isTrue();
    }

    @Test
    void decorator_flagOffButKeysExist_decryptOnlyModeStillMaterialises() throws Exception {
        // Drifted node: keys created elsewhere; storage on, as it must be to serve files.
        StorageProviderConfig seedCfg = newConfig("local", License.SERVER, true, true);
        StorageEncryptionState seedState = newState(seedCfg);
        Team team = new Team();
        team.setId(1L);
        User owner = new User();
        owner.setTeam(team);
        seedState.keyService().activeKekForOwner(owner);

        StorageProviderConfig cfg = newConfig("local", License.NORMAL, false, true);
        StorageEncryptionState state = newState(cfg);

        assertThat(cfg.storageProvider(state, Optional.empty()))
                .isInstanceOf(EncryptingStorageProvider.class);
        assertThat(state.isWriteEnabled()).isFalse();
        // Encrypted content may exist -> presigned URLs must be suppressed on this node too.
        assertThat(state.suppressDirectDownloads()).isTrue();
        // Eager init ran (keys existed at boot), so decryption works without a licence.
        assertThat(state.isMaterialised()).isTrue();
    }

    @Test
    void encryption_enabled_normalLicense_failsStartup() {
        StorageProviderConfig cfg = newConfig("local", License.NORMAL, true);
        assertThatThrownBy(() -> newState(cfg))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.encryption requires a Pro or Enterprise license");
    }

    @Test
    void encryption_enabled_wrongLengthKey_failsStartup() {
        StorageProviderConfig cfg = newConfig("local", License.SERVER, true);
        String shortKey = Base64.getEncoder().encodeToString("only16bytes-yes!".getBytes());
        assertThatThrownBy(() -> cfg.storageEncryptionState(shortKey, "", 1, false, txManager))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes");
    }

    // ---- deployments that do not use storage (the SaaS shape) ---------------------------

    @Test
    void storageDisabled_neverQueriesTheKeyRegistry() {
        StorageProviderConfig cfg = newConfig("local", License.NORMAL, false);
        StorageEncryptionState state = newState(cfg);

        assertThat(state.isWriteEnabled()).isFalse();
        // No probe means no eager init, so no master key is resolved on a node that never stores.
        assertThat(state.isMaterialised()).isFalse();
        verify(keyRepo.mock, never()).count();
    }

    @Test
    void storageDisabled_decoratorStillInstalledSoCiphertextIsNeverServedRaw() {
        StorageProviderConfig cfg = newConfig("local", License.NORMAL, false);
        StorageEncryptionState state = newState(cfg);

        assertThat(cfg.storageProvider(state, Optional.empty()))
                .isInstanceOf(EncryptingStorageProvider.class);
    }

    @Test
    void unreadableKeyRegistry_stillStartsAndFailsSafeOnDirectDownloads() {
        FileEncryptionKeyRepository broken = mock(FileEncryptionKeyRepository.class);
        when(broken.count())
                .thenThrow(new InvalidDataAccessResourceUsageException("no such table"));
        StorageEncryptionState state =
                new StorageEncryptionState(
                        false, () -> null, broken, StorageEncryptionAuditListener.NOOP);

        assertThat(state.encryptedContentMayExist()).isFalse();
        assertThat(state.suppressDirectDownloads()).isTrue();
    }

    @Test
    void storageEnabledWithoutEncryption_probesRegistry() {
        StorageProviderConfig cfg = newConfig("local", License.NORMAL, false, true);
        newState(cfg);
        verify(keyRepo.mock, atLeastOnce()).count();
    }

    // ---- backend licence gates (unchanged behaviour) ------------------------------------

    @Test
    void provider_s3_normalLicense_throwsBeforeBuildingClient() {
        StorageProviderConfig cfg = newConfig("s3", License.NORMAL, false);
        StorageEncryptionState state = newState(cfg);

        // License check must throw BEFORE S3Clients.build tries to validate endpoint / bucket.
        assertThatThrownBy(() -> cfg.storageProvider(state, Optional.empty()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.provider=s3 requires a Pro or Enterprise license");
    }

    @Test
    void provider_database_normalLicense_throws() {
        StorageProviderConfig cfg = newConfig("database", License.NORMAL, false);
        StorageEncryptionState state = newState(cfg);

        assertThatThrownBy(() -> cfg.storageProvider(state, Optional.empty()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "storage.provider=database requires a Pro or Enterprise license");
    }

    @Test
    void provider_database_serverLicense_builds() {
        StorageProviderConfig cfg = newConfig("database", License.SERVER, false);
        StorageEncryptionState state = newState(cfg);
        assertThatCode(() -> cfg.storageProvider(state, Optional.empty()))
                .doesNotThrowAnyException();
    }

    @Test
    void provider_s3_serverLicense_passesLicenseCheck_thenFailsOnEmptyConfig() {
        StorageProviderConfig cfg = newConfig("s3", License.SERVER, false);
        StorageEncryptionState state = newState(cfg);

        // Valid license, but no bucket/endpoint configured - so we expect a CONFIG error,
        // not a license error.
        assertThatThrownBy(() -> cfg.storageProvider(state, Optional.empty()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("Pro or Enterprise license");
    }

    @Test
    void provider_unknown_throwsUnsupportedProvider_notLicense() {
        StorageProviderConfig cfg = newConfig("magic", License.NORMAL, false);
        StorageEncryptionState state = newState(cfg);

        assertThatThrownBy(() -> cfg.storageProvider(state, Optional.empty()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Storage provider not supported: magic")
                .hasMessageNotContaining("license");
    }

    private StorageProviderConfig newConfig(
            String provider, License license, boolean encryptionEnabled) {
        return newConfig(provider, license, encryptionEnabled, false);
    }

    private StorageProviderConfig newConfig(
            String provider, License license, boolean encryptionEnabled, boolean storageEnabled) {
        ApplicationProperties props = new ApplicationProperties();
        props.getStorage().setProvider(provider);
        props.getStorage().setEnabled(storageEnabled);
        props.getStorage().getEncryption().setEnabled(encryptionEnabled);
        StoredFileBlobRepository repo = mock(StoredFileBlobRepository.class);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        AuditService audit = mock(AuditService.class);
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
        return new StorageProviderConfig(props, repo, keyRepo.mock, checker, audit);
    }
}
