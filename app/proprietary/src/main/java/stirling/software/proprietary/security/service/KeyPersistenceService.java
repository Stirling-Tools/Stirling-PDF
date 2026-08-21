package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.DependsOn;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtSigningKeyEntity;
import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.repository.JwtSigningKeyRepository;

/** Persists JWT signing keys in the shared DB so all nodes sign/verify with the same key. */
@Slf4j
@Service
// CredentialEncryption must init first: startup persists an encrypted private key.
@DependsOn("credentialEncryption")
public class KeyPersistenceService implements KeyPersistenceServiceInterface {

    public static final String KEY_SUFFIX = ".key";
    public static final String PUB_KEY_SUFFIX = ".pub";

    private final ApplicationProperties.Security.Jwt jwtProperties;
    private final Cache verifyingKeyCache;
    private final JwtSigningKeyRepository keyRepository;
    private final boolean clusterEnabled;

    // kid -> KeyPair; safe to cache since key material is immutable.
    private final Map<String, KeyPair> keyPairCache = new ConcurrentHashMap<>();

    private volatile JwtVerificationKey activeKey;

    public KeyPersistenceService(
            ApplicationProperties applicationProperties,
            CacheManager cacheManager,
            JwtSigningKeyRepository keyRepository,
            @Value("${cluster.enabled:false}") boolean clusterEnabled) {
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
        this.verifyingKeyCache = cacheManager.getCache("verifyingKeys");
        this.keyRepository = keyRepository;
        this.clusterEnabled = clusterEnabled;
    }

    @PostConstruct
    public void initializeKeystore() {
        if (!isKeystoreEnabled()) {
            log.info("JWT keystore is disabled - keys will be generated in memory");
            return;
        }
        try {
            importLegacyDiskKeysIfPresent();
            loadKeysFromDb();
        } catch (Exception e) {
            log.error("Failed to initialize keystore, generating a fresh keypair", e);
            generateAndStoreKeypair();
        }
    }

    /**
     * Cluster convergence: adopt the newest signing key in the shared DB as this node's active key.
     * Runs on every node so a key a peer just minted becomes the shared active signer within one
     * interval, keeping cluster rotation equivalent to single-node. Cluster-only: a single node
     * always holds its own newest key, so this is skipped entirely off-cluster.
     */
    @Scheduled(fixedDelayString = "${stirling.security.jwt.activeKeyReloadMs:300000}")
    public void reloadActiveKeyFromDb() {
        if (!clusterEnabled || !isKeystoreEnabled()) {
            return;
        }
        try {
            Optional<JwtSigningKeyEntity> newestOpt =
                    keyRepository.findFirstByOrderByCreatedAtDesc();
            if (newestOpt.isEmpty()) {
                return;
            }
            JwtSigningKeyEntity newest = newestOpt.get();
            JwtVerificationKey current = activeKey;
            if (current != null && newest.getKeyId().equals(current.getKeyId())) {
                return;
            }
            JwtVerificationKey adopted =
                    new JwtVerificationKey(newest.getKeyId(), newest.getVerifyingKey());
            verifyingKeyCache.put(newest.getKeyId(), adopted);
            activeKey = adopted;
            log.info(
                    "Adopted newest JWT signing key {} from the shared DB as active",
                    newest.getKeyId());
        } catch (Exception e) {
            log.warn("Could not reload active JWT key from the shared DB: {}", e.getMessage());
        }
    }

    /** Load every signing key from the shared DB into the caches; most recent becomes active. */
    private void loadKeysFromDb() {
        List<JwtSigningKeyEntity> keys = keyRepository.findAllByOrderByCreatedAtDesc();
        if (keys.isEmpty()) {
            log.info("No JWT keys in the database, generating a new keypair");
            generateAndStoreKeypair();
            return;
        }
        for (JwtSigningKeyEntity key : keys) {
            verifyingKeyCache.put(
                    key.getKeyId(), new JwtVerificationKey(key.getKeyId(), key.getVerifyingKey()));
        }
        activeKey = new JwtVerificationKey(keys.get(0).getKeyId(), keys.get(0).getVerifyingKey());
        log.info("Loaded {} JWT key(s) from DB, active key: {}", keys.size(), activeKey.getKeyId());
    }

    private JwtVerificationKey generateAndStoreKeypair() {
        try {
            KeyPair keyPair = generateRSAKeypair();
            String keyId = generateKeyId();
            String verifyingKey = encodePublicKey(keyPair.getPublic());
            String signingKey =
                    Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());

            // Converter encrypts the private key at rest with the shared credential-encryption key.
            keyRepository.save(new JwtSigningKeyEntity(keyId, verifyingKey, signingKey));

            keyPairCache.put(keyId, keyPair);
            JwtVerificationKey verificationKey = new JwtVerificationKey(keyId, verifyingKey);
            verifyingKeyCache.put(keyId, verificationKey);
            activeKey = verificationKey;
            log.info("Generated and stored new JWT keypair: {}", keyId);
            return verificationKey;
        } catch (RuntimeException e) {
            log.error("Failed to generate and store keypair", e);
            return null;
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
        if (!isKeystoreEnabled() || keyId == null) {
            return Optional.empty();
        }
        KeyPair cached = keyPairCache.get(keyId);
        if (cached != null) {
            return Optional.of(cached);
        }
        Optional<JwtSigningKeyEntity> entityOpt = keyRepository.findById(keyId);
        if (entityOpt.isEmpty()) {
            log.warn("No signing key found in DB for keyId: {}", keyId);
            return Optional.empty();
        }
        JwtSigningKeyEntity entity = entityOpt.get();
        try {
            KeyPair keyPair =
                    new KeyPair(
                            decodePublicKey(entity.getVerifyingKey()),
                            decodePrivateKey(entity.getSigningKey()));
            keyPairCache.put(keyId, keyPair);
            verifyingKeyCache.put(keyId, new JwtVerificationKey(keyId, entity.getVerifyingKey()));
            return Optional.of(keyPair);
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            log.error("Failed to decode keypair for keyId: {}", keyId, e);
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
    public void removeKey(String keyId) {
        keyRepository.deleteById(keyId);
        verifyingKeyCache.evict(keyId);
        keyPairCache.remove(keyId);
    }

    @Override
    public List<JwtVerificationKey> getKeysEligibleForCleanup(LocalDateTime cutoffDate) {
        return keyRepository.findByCreatedAtBefore(cutoffDate).stream()
                .map(e -> new JwtVerificationKey(e.getKeyId(), e.getVerifyingKey()))
                .toList();
    }

    /** Import any pre-existing on-disk keys into the DB once, so upgrades keep sessions valid. */
    private void importLegacyDiskKeysIfPresent() {
        if (keyRepository.count() > 0) {
            return;
        }
        Path keyDirectory = Path.of(InstallationPathConfig.getPrivateKeyPath());
        if (!Files.exists(keyDirectory)) {
            return;
        }
        List<Path> keyFiles;
        try (var stream = Files.list(keyDirectory)) {
            keyFiles = stream.filter(p -> p.toString().endsWith(KEY_SUFFIX)).toList();
        } catch (IOException e) {
            log.warn("Could not list legacy key directory {}: {}", keyDirectory, e.getMessage());
            return;
        }
        int imported = 0;
        for (Path keyFile : keyFiles) {
            String keyId = keyFile.getFileName().toString().replace(KEY_SUFFIX, "");
            try {
                PrivateKey privateKey = loadPrivateKey(keyId);
                String verifyingKey = resolveLegacyPublicKey(keyId, privateKey);
                String signingKey = Base64.getEncoder().encodeToString(privateKey.getEncoded());
                keyRepository.save(new JwtSigningKeyEntity(keyId, verifyingKey, signingKey));
                imported++;
            } catch (Exception e) {
                log.warn("Skipping legacy key {}: {}", keyId, e.getMessage());
            }
        }
        if (imported > 0) {
            log.info("Imported {} legacy JWT key(s) from disk into the shared DB", imported);
        }
    }

    private String resolveLegacyPublicKey(String keyId, PrivateKey privateKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        try {
            return loadPublicKey(keyId);
        } catch (IOException e) {
            // No .pub file: derive the public key from the RSA private key.
            return encodePublicKey(reconstructKeyPair(privateKey).getPublic());
        }
    }

    // UUID suffix so two nodes booting the same second don't collide on keyId.
    private String generateKeyId() {
        return "jwt-key-"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmmss"))
                + "-"
                + UUID.randomUUID().toString().substring(0, 8);
    }

    private KeyPair generateRSAKeypair() {
        try {
            KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
            keyPairGenerator.initialize(2048);
            return keyPairGenerator.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("RSA key pair generator is not available", e);
        }
    }

    private PrivateKey loadPrivateKey(String keyId)
            throws IOException, NoSuchAlgorithmException, InvalidKeySpecException {
        Path keyFile =
                Path.of(InstallationPathConfig.getPrivateKeyPath()).resolve(keyId + KEY_SUFFIX);
        if (!Files.exists(keyFile)) {
            throw new IOException("Private key not found: " + keyFile);
        }
        return decodePrivateKey(Files.readString(keyFile));
    }

    private String loadPublicKey(String keyId) throws IOException {
        Path publicKeyFile =
                Path.of(InstallationPathConfig.getPrivateKeyPath()).resolve(keyId + PUB_KEY_SUFFIX);
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
        return new KeyPair(keyFactory.generatePublic(publicKeySpec), privateKey);
    }

    private String encodePublicKey(PublicKey publicKey) {
        return Base64.getEncoder().encodeToString(publicKey.getEncoded());
    }

    @Override
    public PublicKey decodePublicKey(String encodedKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(Base64.getDecoder().decode(encodedKey));
        return KeyFactory.getInstance("RSA").generatePublic(keySpec);
    }

    private PrivateKey decodePrivateKey(String encodedKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        PKCS8EncodedKeySpec keySpec =
                new PKCS8EncodedKeySpec(Base64.getDecoder().decode(encodedKey));
        return KeyFactory.getInstance("RSA").generatePrivate(keySpec);
    }
}
