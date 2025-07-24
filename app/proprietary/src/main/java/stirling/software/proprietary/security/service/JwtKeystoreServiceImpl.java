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
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.JwtSigningKeyRepository;
import stirling.software.proprietary.security.model.JwtSigningKey;

@Service
@Slf4j
public class JwtKeystoreServiceImpl implements JwtKeystoreService {

    public static final String KEY_SUFFIX = ".key";
    private final JwtSigningKeyRepository repository;
    private final ApplicationProperties.Security.Jwt jwtConfig;
    private final Path privateKeyDirectory;

    private volatile KeyPair currentKeyPair;
    private volatile String currentKeyId;

    @Autowired
    public JwtKeystoreServiceImpl(
            JwtSigningKeyRepository repository, ApplicationProperties applicationProperties) {
        this.repository = repository;
        this.jwtConfig = applicationProperties.getSecurity().getJwt();
        this.privateKeyDirectory = Paths.get(InstallationPathConfig.getConfigPath(), "jwt-keys");
    }

    @PostConstruct
    public void initializeKeystore() {
        if (!isKeystoreEnabled()) {
            log.info("JWT keystore is disabled, using in-memory key generation");
            return;
        }

        try {
            ensurePrivateKeyDirectoryExists();
            loadOrGenerateKeypair();
        } catch (Exception e) {
            log.error("Failed to initialize JWT keystore, falling back to in-memory generation", e);
        }
    }

    @Override
    public KeyPair getActiveKeypair() {
        if (!isKeystoreEnabled() || currentKeyPair == null) {
            return generateInMemoryKeypair();
        }
        return currentKeyPair;
    }

    @Override
    public Optional<KeyPair> getKeypairByKeyId(String keyId) {
        if (!isKeystoreEnabled()) {
            return Optional.empty();
        }

        try {
            Optional<JwtSigningKey> signingKey = repository.findByKeyId(keyId);
            if (signingKey.isEmpty()) {
                return Optional.empty();
            }

            PrivateKey privateKey = loadPrivateKeyFromFile(keyId);
            PublicKey publicKey = decodePublicKey(signingKey.get().getPublicKey());

            return Optional.of(new KeyPair(publicKey, privateKey));
        } catch (Exception e) {
            log.error("Failed to load keypair for keyId: {}", keyId, e);
            return Optional.empty();
        }
    }

    @Override
    public String getActiveKeyId() {
        return currentKeyId;
    }

    @Override
    @Transactional
    public void rotateKeypair() {
        if (!isKeystoreEnabled()) {
            log.warn("Cannot rotate keypair when keystore is disabled");
            return;
        }

        try {
            // Deactivate current key
            repository
                    .findByIsActiveTrue()
                    .ifPresent(
                            key -> {
                                key.setIsActive(false);
                                repository.save(key);
                            });

            // Generate new keypair
            generateAndStoreKeypair();
            log.info("Successfully rotated JWT keypair");
        } catch (Exception e) {
            log.error("Failed to rotate JWT keypair", e);
            throw new RuntimeException("Keypair rotation failed", e);
        }
    }

    @Override
    public boolean isKeystoreEnabled() {
        return jwtConfig.isEnableKeystore();
    }

    private void loadOrGenerateKeypair() {
        Optional<JwtSigningKey> activeKey = repository.findByIsActiveTrue();

        if (activeKey.isPresent()) {
            try {
                currentKeyId = activeKey.get().getKeyId();
                PrivateKey privateKey = loadPrivateKeyFromFile(currentKeyId);
                PublicKey publicKey = decodePublicKey(activeKey.get().getPublicKey());
                currentKeyPair = new KeyPair(publicKey, privateKey);
                log.info("Loaded existing JWT keypair with keyId: {}", currentKeyId);
            } catch (Exception e) {
                log.error("Failed to load existing keypair, generating new one", e);
                generateAndStoreKeypair();
            }
        } else {
            generateAndStoreKeypair();
        }
    }

    private void generateAndStoreKeypair() {
        try {
            // Generate new keypair
            KeyPair keyPair = generateRSAKeypair();
            String keyId = generateKeyId();

            // Store private key to file
            storePrivateKeyToFile(keyId, keyPair.getPrivate());

            // Store public key and metadata to database
            JwtSigningKey signingKey =
                    new JwtSigningKey(keyId, encodePublicKey(keyPair.getPublic()), "RS256");
            repository.save(signingKey);

            // Update current references
            currentKeyPair = keyPair;
            currentKeyId = keyId;

            log.info("Generated and stored new JWT keypair with keyId: {}", keyId);
        } catch (Exception e) {
            log.error("Failed to generate and store keypair", e);
            throw new RuntimeException("Keypair generation failed", e);
        }
    }

    private KeyPair generateRSAKeypair() throws NoSuchAlgorithmException {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        return keyPairGenerator.generateKeyPair();
    }

    private KeyPair generateInMemoryKeypair() {
        try {
            return generateRSAKeypair();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Failed to generate in-memory keypair", e);
        }
    }

    private String generateKeyId() {
        return "jwt-key-"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmmss"));
    }

    private void ensurePrivateKeyDirectoryExists() throws IOException {
        if (!Files.exists(privateKeyDirectory)) {
            Files.createDirectories(privateKeyDirectory);
            log.info("Created JWT private key directory: {}", privateKeyDirectory);
        }
    }

    private void storePrivateKeyToFile(String keyId, PrivateKey privateKey) throws IOException {
        Path keyFile = privateKeyDirectory.resolve(keyId + KEY_SUFFIX);
        String encodedKey = Base64.getEncoder().encodeToString(privateKey.getEncoded());
        Files.writeString(keyFile, encodedKey);

        // Set restrictive permissions (readable only by owner)
        try {
            keyFile.toFile().setReadable(false, false);
            keyFile.toFile().setReadable(true, true);
            keyFile.toFile().setWritable(false, false);
            keyFile.toFile().setWritable(true, true);
            keyFile.toFile().setExecutable(false, false);
        } catch (Exception e) {
            log.warn("Failed to set permissions on private key file: {}", keyFile, e);
        }
    }

    private PrivateKey loadPrivateKeyFromFile(String keyId)
            throws IOException, NoSuchAlgorithmException, InvalidKeySpecException {
        Path keyFile = privateKeyDirectory.resolve(keyId + KEY_SUFFIX);
        if (!Files.exists(keyFile)) {
            throw new IOException("Private key file not found: " + keyFile);
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

    private PublicKey decodePublicKey(String encodedKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {
        byte[] keyBytes = Base64.getDecoder().decode(encodedKey);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePublic(keySpec);
    }
}
