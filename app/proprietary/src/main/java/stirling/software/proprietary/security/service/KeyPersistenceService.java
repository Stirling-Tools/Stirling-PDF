package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

@Slf4j
@Service
public class KeyPersistenceService implements KeyPersistenceServiceInterface {

    public static final String KEY_SUFFIX = ".key";
    public static final String PUB_KEY_SUFFIX = ".pub";

    private final ApplicationProperties.Security.Jwt jwtProperties;
    private final CacheManager cacheManager;
    private final Cache verifyingKeyCache;

    private volatile JwtVerificationKey activeKey;

    @Autowired
    public KeyPersistenceService(
            ApplicationProperties applicationProperties, CacheManager cacheManager) {
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
        this.cacheManager = cacheManager;
        this.verifyingKeyCache = cacheManager.getCache("verifyingKeys");
    }

    @PostConstruct
    public void initializeKeystore() {
        if (!isKeystoreEnabled()) {
            log.info("JWT keystore is disabled - keys will be generated in memory");
            return;
        }

        try {
            ensurePrivateKeyDirectoryExists();
            loadExistingKeysFromDisk();
        } catch (Exception e) {
            log.error("Failed to initialize keystore, using in-memory generation", e);
        }
    }

    /**
     * Load all existing JWT keys from disk into memory on startup.
     *
     * <p>This ensures tokens signed with previous keys remain valid after server restart. If no
     * keys exist on disk, generates a new keypair.
     */
    private void loadExistingKeysFromDisk() {
        try {
            Path keyDirectory = Paths.get(InstallationPathConfig.getPrivateKeyPath());

            if (!Files.exists(keyDirectory)) {
                log.info("No existing keys found, generating new keypair");
                generateAndStoreKeypair();
                return;
            }

            List<Path> keyFiles;
            try (var stream = Files.list(keyDirectory)) {
                keyFiles =
                        stream.filter(path -> path.toString().endsWith(KEY_SUFFIX))
                                .sorted(
                                        (a, b) ->
                                                b.getFileName().compareTo(a.getFileName())) // Most
                                // recent
                                // first
                                .collect(Collectors.toList());
            }

            if (keyFiles.isEmpty()) {
                log.info("No existing keys found in directory, generating new keypair");
                generateAndStoreKeypair();
                return;
            }

            log.info("Loading {} existing JWT keys from disk", keyFiles.size());
            int loadedCount = 0;

            for (Path keyFile : keyFiles) {
                try {
                    String keyId = keyFile.getFileName().toString().replace(KEY_SUFFIX, "");

                    // Load private key first
                    PrivateKey privateKey = loadPrivateKey(keyId);

                    // Try to load public key, or generate it from private key if missing
                    // (migration)
                    String encodedPublicKey;
                    try {
                        encodedPublicKey = loadPublicKey(keyId);
                    } catch (IOException e) {
                        // Public key file doesn't exist - generate it from private key (migration)
                        log.info("Migrating legacy key: generating public key file for {}", keyId);
                        KeyPair keyPair = reconstructKeyPair(privateKey);

                        // Save the public key file
                        Path publicKeyFile = keyDirectory.resolve(keyId + PUB_KEY_SUFFIX);
                        encodedPublicKey = encodePublicKey(keyPair.getPublic());
                        Files.writeString(publicKeyFile, encodedPublicKey);
                        publicKeyFile.toFile().setReadable(true, true);
                        publicKeyFile.toFile().setWritable(true, true);
                        publicKeyFile.toFile().setExecutable(false, false);

                        log.info("Successfully migrated key: {}", keyId);
                    }

                    // Create verification key and add to cache
                    JwtVerificationKey verifyingKey =
                            new JwtVerificationKey(keyId, encodedPublicKey);
                    verifyingKeyCache.put(keyId, verifyingKey);
                    loadedCount++;

                    // Set the most recent key as active (first in sorted list)
                    if (activeKey == null) {
                        activeKey = verifyingKey;
                        log.info("Set active JWT signing key: {}", keyId);
                    } else {
                        log.debug(
                                "Loaded historical JWT key: {} (created: {})",
                                keyId,
                                verifyingKey.getCreatedAt());
                    }
                } catch (Exception e) {
                    log.warn(
                            "Failed to load key: {}, skipping. Error: {}",
                            keyFile.getFileName(),
                            e.getMessage());
                }
            }

            if (loadedCount == 0) {
                log.warn("No valid keys could be loaded from disk, generating new keypair");
                generateAndStoreKeypair();
            } else {
                log.info(
                        "Successfully loaded {} JWT keys, active key: {}",
                        loadedCount,
                        activeKey.getKeyId());
            }

        } catch (IOException e) {
            log.error("Failed to load keys from disk, generating new keypair", e);
            generateAndStoreKeypair();
        }
    }

    @Transactional
    private JwtVerificationKey generateAndStoreKeypair() {
        JwtVerificationKey verifyingKey = null;

        try {
            KeyPair keyPair = generateRSAKeypair();
            String keyId = generateKeyId();

            storeKeyPair(keyId, keyPair);
            verifyingKey = new JwtVerificationKey(keyId, encodePublicKey(keyPair.getPublic()));
            verifyingKeyCache.put(keyId, verifyingKey);
            activeKey = verifyingKey;
            log.info("Generated and stored new JWT keypair: {}", keyId);
        } catch (IOException e) {
            log.error("Failed to generate and store keypair", e);
        }

        return verifyingKey;
    }

    @Override
    public JwtVerificationKey getActiveKey() {
        if (activeKey == null) {
            return generateAndStoreKeypair();
        }
        return activeKey;
    }

    @Override
    public Optional<KeyPair> getKeyPair(String keyId) {
        if (!isKeystoreEnabled()) {
            return Optional.empty();
        }

        try {
            JwtVerificationKey verifyingKey =
                    verifyingKeyCache.get(keyId, JwtVerificationKey.class);

            if (verifyingKey == null) {
                log.warn("No signing key found in database for keyId: {}", keyId);
                return Optional.empty();
            }

            PrivateKey privateKey = loadPrivateKey(keyId);
            PublicKey publicKey = decodePublicKey(verifyingKey.getVerifyingKey());

            return Optional.of(new KeyPair(publicKey, privateKey));
        } catch (Exception e) {
            log.error("Failed to load keypair for keyId: {}", keyId, e);
            return Optional.empty();
        }
    }

    @Override
    public boolean isKeystoreEnabled() {
        return jwtProperties.isEnableKeystore();
    }

    @Override
    public JwtVerificationKey refreshActiveKeyPair() {
        return generateAndStoreKeypair();
    }

    @Override
    @CacheEvict(
            value = {"verifyingKeys"},
            key = "#keyId",
            condition = "#root.target.isKeystoreEnabled()")
    public void removeKey(String keyId) {
        verifyingKeyCache.evict(keyId);
    }

    @Override
    public List<JwtVerificationKey> getKeysEligibleForCleanup(LocalDateTime cutoffDate) {
        CaffeineCache caffeineCache = (CaffeineCache) verifyingKeyCache;
        com.github.benmanes.caffeine.cache.Cache<Object, Object> nativeCache =
                caffeineCache.getNativeCache();

        log.debug(
                "Cache size: {}, Checking {} keys for cleanup",
                nativeCache.estimatedSize(),
                nativeCache.asMap().size());

        return nativeCache.asMap().values().stream()
                .filter(value -> value instanceof JwtVerificationKey)
                .map(value -> (JwtVerificationKey) value)
                .filter(
                        key -> {
                            boolean eligible = key.getCreatedAt().isBefore(cutoffDate);
                            log.debug(
                                    "Key {} created at {}, eligible for cleanup: {}",
                                    key.getKeyId(),
                                    key.getCreatedAt(),
                                    eligible);
                            return eligible;
                        })
                .collect(Collectors.toList());
    }

    private String generateKeyId() {
        return "jwt-key-"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmmss"));
    }

    private KeyPair generateRSAKeypair() {
        KeyPairGenerator keyPairGenerator = null;

        try {
            keyPairGenerator = KeyPairGenerator.getInstance("RSA");
            keyPairGenerator.initialize(2048);
        } catch (NoSuchAlgorithmException e) {
            log.error("Failed to initialize RSA key pair generator", e);
        }

        return keyPairGenerator.generateKeyPair();
    }

    private void ensurePrivateKeyDirectoryExists() throws IOException {
        Path keyPath = Paths.get(InstallationPathConfig.getPrivateKeyPath());

        if (!Files.exists(keyPath)) {
            Files.createDirectories(keyPath);
        }
    }

    /**
     * Store both private and public keys to disk.
     *
     * <p>Private key stored as: keyId.key
     *
     * <p>Public key stored as: keyId.pub
     */
    private void storeKeyPair(String keyId, KeyPair keyPair) throws IOException {
        Path keyDirectory = Paths.get(InstallationPathConfig.getPrivateKeyPath());

        // Store private key
        Path privateKeyFile = keyDirectory.resolve(keyId + KEY_SUFFIX);
        String encodedPrivateKey =
                Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
        Files.writeString(privateKeyFile, encodedPrivateKey);

        // Set read/write to only the owner (security)
        privateKeyFile.toFile().setReadable(true, true);
        privateKeyFile.toFile().setWritable(true, true);
        privateKeyFile.toFile().setExecutable(false, false);

        // Store public key
        Path publicKeyFile = keyDirectory.resolve(keyId + PUB_KEY_SUFFIX);
        String encodedPublicKey =
                Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
        Files.writeString(publicKeyFile, encodedPublicKey);

        // Public key can be more permissive but still restrict to owner
        publicKeyFile.toFile().setReadable(true, true);
        publicKeyFile.toFile().setWritable(true, true);
        publicKeyFile.toFile().setExecutable(false, false);

        log.debug(
                "Stored keypair to disk: {} (private: {}, public: {})",
                keyId,
                privateKeyFile.getFileName(),
                publicKeyFile.getFileName());
    }

    private PrivateKey loadPrivateKey(String keyId)
            throws IOException, NoSuchAlgorithmException, InvalidKeySpecException {
        Path keyFile =
                Paths.get(InstallationPathConfig.getPrivateKeyPath()).resolve(keyId + KEY_SUFFIX);

        if (!Files.exists(keyFile)) {
            throw new IOException("Private key not found: " + keyFile);
        }

        String encodedKey = Files.readString(keyFile);
        byte[] keyBytes = Base64.getDecoder().decode(encodedKey);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");

        return keyFactory.generatePrivate(keySpec);
    }

    /**
     * Load public key from disk.
     *
     * @param keyId the key identifier
     * @return Base64-encoded public key string
     * @throws IOException if the public key file is not found
     */
    private String loadPublicKey(String keyId) throws IOException {
        Path publicKeyFile =
                Paths.get(InstallationPathConfig.getPrivateKeyPath())
                        .resolve(keyId + PUB_KEY_SUFFIX);

        if (!Files.exists(publicKeyFile)) {
            throw new IOException("Public key not found: " + publicKeyFile);
        }

        return Files.readString(publicKeyFile).trim();
    }

    /**
     * Reconstruct a KeyPair from a PrivateKey.
     *
     * <p>For RSA keys, derives the public key from the private key.
     *
     * @param privateKey the RSA private key
     * @return reconstructed KeyPair
     * @throws NoSuchAlgorithmException if RSA algorithm is not available
     * @throws InvalidKeySpecException if the key specification is invalid
     */
    private KeyPair reconstructKeyPair(PrivateKey privateKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        // For RSA, we can derive the public key from the private key
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");

        // Get the private key spec
        RSAPrivateCrtKey rsaPrivateKey = (RSAPrivateCrtKey) privateKey;

        // Create public key spec from private key parameters
        RSAPublicKeySpec publicKeySpec =
                new RSAPublicKeySpec(rsaPrivateKey.getModulus(), rsaPrivateKey.getPublicExponent());

        // Generate public key
        PublicKey publicKey = keyFactory.generatePublic(publicKeySpec);

        return new KeyPair(publicKey, privateKey);
    }

    private String encodePublicKey(PublicKey publicKey) {
        return Base64.getEncoder().encodeToString(publicKey.getEncoded());
    }

    public PublicKey decodePublicKey(String encodedKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        byte[] keyBytes = Base64.getDecoder().decode(encodedKey);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePublic(keySpec);
    }
}
