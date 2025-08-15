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
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

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

    private final ApplicationProperties.Security.Jwt jwtProperties;
    private final Cache verifyingKeyCache;

    private volatile JwtVerificationKey activeKey;

    public KeyPersistenceService(
            ApplicationProperties applicationProperties, CacheManager cacheManager) {
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
        this.verifyingKeyCache = cacheManager.getCache("verifyingKeys");
    }

    @PostConstruct
    public void initializeKeystore() {
        if (!isKeystoreEnabled()) {
            return;
        }

        try {
            ensurePrivateKeyDirectoryExists();
            loadKeyPair();
        } catch (Exception e) {
            log.error("Failed to initialize keystore, using in-memory generation", e);
        }
    }

    private void loadKeyPair() {
        if (activeKey == null) {
            generateAndStoreKeypair();
        }
    }

    @Transactional
    private JwtVerificationKey generateAndStoreKeypair() {
        JwtVerificationKey verifyingKey = null;

        try {
            KeyPair keyPair = generateRSAKeypair();
            String keyId = generateKeyId();

            storePrivateKey(keyId, keyPair.getPrivate());
            verifyingKey = new JwtVerificationKey(keyId, encodePublicKey(keyPair.getPublic()));
            verifyingKeyCache.put(keyId, verifyingKey);
            activeKey = verifyingKey;
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
                .filter(JwtVerificationKey.class::isInstance)
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

    private void storePrivateKey(String keyId, PrivateKey privateKey) throws IOException {
        Path keyFile =
                Paths.get(InstallationPathConfig.getPrivateKeyPath()).resolve(keyId + KEY_SUFFIX);
        String encodedKey = Base64.getEncoder().encodeToString(privateKey.getEncoded());
        Files.writeString(keyFile, encodedKey);

        // Set read/write to only the owner
        keyFile.toFile().setReadable(true, true);
        keyFile.toFile().setWritable(true, true);
        keyFile.toFile().setExecutable(false, false);
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

    private String encodePublicKey(PublicKey publicKey) {
        return Base64.getEncoder().encodeToString(publicKey.getEncoded());
    }

    @Override
    public PublicKey decodePublicKey(String encodedKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        byte[] keyBytes = Base64.getDecoder().decode(encodedKey);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePublic(keySpec);
    }
}
