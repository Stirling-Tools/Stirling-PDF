package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
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
import java.time.Duration;
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

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.KeyValueCache;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

/**
 * SECURITY: the {@link #JWT_PUBKEY_NAMESPACE} cluster cache is trust-on-publish. Operators MUST
 * restrict Valkey ACL writes to app pods, enable AUTH + TLS, and network-isolate the deployment.
 * Future hardening: HMAC-signed broadcasts with a cluster master secret.
 */
@Slf4j
@Service
public class KeyPersistenceService implements KeyPersistenceServiceInterface {

    public static final String KEY_SUFFIX = ".key";
    public static final String PUB_KEY_SUFFIX = ".pub";

    private static final Duration JWT_PUBKEY_CLUSTER_TTL = Duration.ofHours(24);

    /** Cluster KeyValueCache namespace used to broadcast public keys to peers. */
    public static final String JWT_PUBKEY_NAMESPACE = "jwtkey";

    private final ApplicationProperties.Security.Jwt jwtProperties;
    private final CacheManager cacheManager;
    private final Cache verifyingKeyCache;

    private final KeyValueCache clusterKeyCache; // null in single-instance mode

    private volatile JwtVerificationKey activeKey;

    @Autowired
    public KeyPersistenceService(
            ApplicationProperties applicationProperties,
            CacheManager cacheManager,
            @Autowired(required = false) KeyValueCache clusterKeyCache) {
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
        this.cacheManager = cacheManager;
        this.verifyingKeyCache = cacheManager.getCache("verifyingKeys");
        this.clusterKeyCache = clusterKeyCache;
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
                                // most recent first
                                .sorted((a, b) -> b.getFileName().compareTo(a.getFileName()))
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

                    PrivateKey privateKey = loadPrivateKey(keyId);

                    // Try to load public key; generate from private key if missing (legacy
                    // migration).
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

                    JwtVerificationKey verifyingKey =
                            new JwtVerificationKey(keyId, encodedPublicKey);
                    verifyingKeyCache.put(keyId, verifyingKey);
                    loadedCount++;

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

    private JwtVerificationKey generateAndStoreKeypair() {
        JwtVerificationKey verifyingKey = null;

        try {
            KeyPair keyPair = generateRSAKeypair();
            String keyId = generateKeyId();

            storeKeyPair(keyId, keyPair);
            String encodedPublicKey = encodePublicKey(keyPair.getPublic());
            verifyingKey = new JwtVerificationKey(keyId, encodedPublicKey);
            verifyingKeyCache.put(keyId, verifyingKey);
            activeKey = verifyingKey;
            // Broadcast so peer nodes can verify tokens we sign without waiting for restart.
            publishToCluster(keyId, encodedPublicKey);
            log.info("Generated and stored new JWT keypair: {}", keyId);
        } catch (IOException e) {
            log.error("Failed to generate and store keypair", e);
        }

        return verifyingKey;
    }

    private void publishToCluster(String keyId, String encodedPublicKey) {
        if (clusterKeyCache == null) {
            return;
        }
        try {
            clusterKeyCache.put(
                    JWT_PUBKEY_NAMESPACE, keyId, encodedPublicKey, JWT_PUBKEY_CLUSTER_TTL);
            log.info("Broadcast JWT public key to cluster KeyValueCache: {}", keyId);
        } catch (RuntimeException e) {
            // Non-fatal: we still serve tokens locally; peers catch up on their next restart.
            log.warn(
                    "Failed to broadcast JWT public key {} to cluster cache: {}",
                    keyId,
                    e.getMessage());
        }
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
        // Evict cluster broadcast so peers don't keep serving the removed key for up to 24h.
        if (clusterKeyCache != null && keyId != null) {
            try {
                clusterKeyCache.evict(JWT_PUBKEY_NAMESPACE, keyId);
            } catch (RuntimeException e) {
                log.warn(
                        "Failed to evict JWT public key {} from cluster cache: {}",
                        keyId,
                        e.getMessage());
            }
        }
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
     * Store both private and public keys to disk using a temp-then-atomic-rename pattern.
     *
     * <p>The caller broadcasts the public key to peers immediately after this returns. If a peer
     * learned about the keyId before the private key was fully durable, a crash mid-write followed
     * by restart would lose the key while peers still serve tokens signed with it. Writing to
     * {@code <file>.tmp} and moving with {@link StandardCopyOption#ATOMIC_MOVE} guarantees the
     * final path either contains the fully-written payload or does not exist at all.
     */
    private void storeKeyPair(String keyId, KeyPair keyPair) throws IOException {
        Path keyDirectory = Paths.get(InstallationPathConfig.getPrivateKeyPath());

        Path privateKeyFile = keyDirectory.resolve(keyId + KEY_SUFFIX);
        String encodedPrivateKey =
                Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
        writeAtomically(privateKeyFile, encodedPrivateKey);
        privateKeyFile.toFile().setReadable(true, true);
        privateKeyFile.toFile().setWritable(true, true);
        privateKeyFile.toFile().setExecutable(false, false);

        Path publicKeyFile = keyDirectory.resolve(keyId + PUB_KEY_SUFFIX);
        String encodedPublicKey =
                Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
        writeAtomically(publicKeyFile, encodedPublicKey);
        publicKeyFile.toFile().setReadable(true, true);
        publicKeyFile.toFile().setWritable(true, true);
        publicKeyFile.toFile().setExecutable(false, false);

        log.debug(
                "Stored keypair to disk: {} (private: {}, public: {})",
                keyId,
                privateKeyFile.getFileName(),
                publicKeyFile.getFileName());
    }

    /**
     * Write {@code contents} to {@code finalPath} so that the final path either contains the full
     * payload or does not exist. Writes to a sibling {@code .tmp} file first and renames it.
     * Returns silently after falling back to a non-atomic move if the filesystem does not support
     * {@link StandardCopyOption#ATOMIC_MOVE}.
     */
    static void writeAtomically(Path finalPath, String contents) throws IOException {
        Path tmp = finalPath.resolveSibling(finalPath.getFileName().toString() + ".tmp");
        Files.writeString(tmp, contents);
        try {
            Files.move(
                    tmp,
                    finalPath,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            log.warn(
                    "Filesystem does not support atomic move for {}; falling back to non-atomic"
                            + " replace. A crash between rename and fsync may leave the key partially"
                            + " written.",
                    finalPath);
            Files.move(tmp, finalPath, StandardCopyOption.REPLACE_EXISTING);
        }
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

    private String loadPublicKey(String keyId) throws IOException {
        Path publicKeyFile =
                Paths.get(InstallationPathConfig.getPrivateKeyPath())
                        .resolve(keyId + PUB_KEY_SUFFIX);

        if (!Files.exists(publicKeyFile)) {
            throw new IOException("Public key not found: " + publicKeyFile);
        }

        return Files.readString(publicKeyFile).trim();
    }

    private KeyPair reconstructKeyPair(PrivateKey privateKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        RSAPrivateCrtKey rsaPrivateKey = (RSAPrivateCrtKey) privateKey;
        RSAPublicKeySpec publicKeySpec =
                new RSAPublicKeySpec(rsaPrivateKey.getModulus(), rsaPrivateKey.getPublicExponent());
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

    @Override
    public Optional<PublicKey> resolvePublicKey(String keyId) {
        if (keyId == null || keyId.isBlank()) {
            return Optional.empty();
        }
        // 1. Local in-memory cache (warm path - same node that signed, or already learnt).
        JwtVerificationKey local = verifyingKeyCache.get(keyId, JwtVerificationKey.class);
        if (local != null) {
            return decodeQuietly(local.getVerifyingKey(), keyId);
        }
        // 2. Local disk (cold path on restart).
        try {
            String onDisk = loadPublicKey(keyId);
            JwtVerificationKey rebuilt = new JwtVerificationKey(keyId, onDisk);
            verifyingKeyCache.put(keyId, rebuilt);
            return decodeQuietly(onDisk, keyId);
        } catch (IOException ignored) {
            // not on this node's disk - try the cluster cache
        }
        // 3. Cluster cache. NOT written to local cache: expireAfterWrite would outlive the
        // broadcast TTL and serve stale keys after peer rotation. Valkey faults return empty.
        if (clusterKeyCache != null) {
            try {
                Optional<String> remote = clusterKeyCache.get(JWT_PUBKEY_NAMESPACE, keyId);
                if (remote.isPresent()) {
                    String encoded = remote.get();
                    log.debug("Resolved JWT public key {} from cluster KeyValueCache", keyId);
                    return decodeQuietly(encoded, keyId);
                }
            } catch (RuntimeException e) {
                log.warn("Cluster key cache unavailable for keyId {}: {}", keyId, e.getMessage());
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    private Optional<PublicKey> decodeQuietly(String encoded, String keyId) {
        try {
            return Optional.of(decodePublicKey(encoded));
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            log.warn("Could not decode public key for {}: {}", keyId, e.getMessage());
            return Optional.empty();
        }
    }
}
