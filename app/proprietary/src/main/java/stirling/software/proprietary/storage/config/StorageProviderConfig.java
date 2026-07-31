package stirling.software.proprietary.storage.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.cluster.s3.S3Clients;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.storage.crypto.EncryptingStorageProvider;
import stirling.software.proprietary.storage.crypto.FileEncryptionKeyService;
import stirling.software.proprietary.storage.crypto.FileEncryptionMasterKey;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.provider.DatabaseStorageProvider;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.S3StorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class StorageProviderConfig {

    private final ApplicationProperties applicationProperties;
    private final StoredFileBlobRepository storedFileBlobRepository;
    private final FileEncryptionKeyRepository fileEncryptionKeyRepository;
    private final LicenseKeyChecker licenseKeyChecker;

    /**
     * The encryption state behind the always-installed decorator. Key machinery is created eagerly
     * when the write flag is on (licence-gated) or key rows already exist — so a wrong master key
     * fails startup, not the first download — and lazily if encrypted content shows up later
     * (config drift on one cluster node must fail loudly, never stream ciphertext). Turning the
     * flag off or losing the licence only stops encrypting new writes; decryption stays available.
     */
    @Bean
    public StorageEncryptionState storageEncryptionState(
            @Value("${stirling.security.fileEncryptionKey:}") String configuredFileEncryptionKey,
            @Value("${cluster.enabled:false}") boolean clusterEnabled,
            PlatformTransactionManager transactionManager) {
        boolean writeEnabled = applicationProperties.getStorage().getEncryption().isEnabled();
        if (writeEnabled) {
            licenseKeyChecker.requireProOrEnterprise("storage.encryption");
        }
        // Key creation must commit independently of any caller transaction (see
        // FileEncryptionKeyService#createActive).
        TransactionTemplate requiresNew = new TransactionTemplate(transactionManager);
        requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        StorageEncryptionState state =
                new StorageEncryptionState(
                        writeEnabled,
                        () ->
                                createKeyService(
                                        configuredFileEncryptionKey, clusterEnabled, requiresNew),
                        fileEncryptionKeyRepository);
        if (writeEnabled || fileEncryptionKeyRepository.count() > 0) {
            state.initialiseEagerly();
            log.info(
                    "Storage encryption at rest active (writes {})",
                    writeEnabled ? "encrypted" : "plaintext; decrypt-only mode");
        }
        return state;
    }

    private FileEncryptionKeyService createKeyService(
            String configuredKey, boolean clusterEnabled, TransactionOperations keyCreationTx) {
        FileEncryptionMasterKey masterKey =
                new FileEncryptionMasterKey(configuredKey, clusterEnabled);
        FileEncryptionKeyService keyService =
                new FileEncryptionKeyService(fileEncryptionKeyRepository, masterKey, keyCreationTx);
        // Wrong key must fail fast, not silently start a second key hierarchy.
        keyService.verifyMasterKey();
        return keyService;
    }

    @Bean(destroyMethod = "close")
    public StorageProvider storageProvider(
            StorageEncryptionState encryptionState, Optional<TempFileManager> tempFileManager) {
        return new EncryptingStorageProvider(
                innerStorageProvider(), encryptionState, tempFileManager.orElse(null));
    }

    private StorageProvider innerStorageProvider() {
        boolean storageEnabled = applicationProperties.getStorage().isEnabled();
        String providerName =
                Optional.ofNullable(applicationProperties.getStorage().getProvider())
                        .orElse("local")
                        .trim()
                        .toLowerCase(Locale.ROOT);
        if ("database".equals(providerName)) {
            licenseKeyChecker.requireProOrEnterprise("storage.provider=database");
            return new DatabaseStorageProvider(storedFileBlobRepository);
        }
        if ("s3".equals(providerName)) {
            licenseKeyChecker.requireProOrEnterprise("storage.provider=s3");
            return buildS3Provider(applicationProperties.getStorage().getS3());
        }
        if (!"local".equals(providerName)) {
            throw new IllegalStateException("Storage provider not supported: " + providerName);
        }
        String basePathValue = applicationProperties.getStorage().getLocal().getBasePath();
        if (basePathValue == null || basePathValue.isBlank()) {
            if (storageEnabled) {
                throw new IllegalStateException("Storage base path is not configured");
            }
            basePathValue = InstallationPathConfig.getPath() + "storage";
        }
        Path basePath = Path.of(basePathValue).toAbsolutePath().normalize();
        Path installRoot = Path.of(InstallationPathConfig.getPath()).toAbsolutePath().normalize();
        if (!basePath.startsWith(installRoot)) {
            // Warn rather than hard-fail: admins may legitimately point storage at an external
            // volume, but an unexpected path could indicate a misconfiguration or traversal
            // attempt.
            log.warn(
                    "Storage basePath '{}' is outside the installation directory '{}'. "
                            + "Verify this is intentional.",
                    basePath,
                    installRoot);
        }
        if (storageEnabled) {
            try {
                Files.createDirectories(basePath);
            } catch (IOException e) {
                throw new IllegalStateException(
                        "Unable to create storage base directory: " + basePath, e);
            }
        }
        return new LocalStorageProvider(basePath);
    }

    private S3StorageProvider buildS3Provider(ApplicationProperties.Storage.S3 cfg) {
        S3Clients.Bundle bundle = S3Clients.build(cfg, "storage provider");
        return new S3StorageProvider(bundle.client(), bundle.presigner(), cfg.getBucket());
    }
}
