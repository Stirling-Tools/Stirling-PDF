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

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.JwtSigningKeyRepository;
import stirling.software.proprietary.security.model.JwtSigningKey;

@Slf4j
@Service
public class JwtKeystoreService implements JwtKeystoreServiceInterface {

    public static final String KEY_SUFFIX = ".key";
    private final JwtSigningKeyRepository repository;
    private final ApplicationProperties.Security.Jwt jwtProperties;

    private volatile KeyPair currentKeyPair;
    private volatile String currentKeyId;

    @Autowired
    public JwtKeystoreService(
            JwtSigningKeyRepository repository, ApplicationProperties applicationProperties) {
        this.repository = repository;
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
    }

    @PostConstruct
    public void initializeKeystore() {
        if (!isKeystoreEnabled()) {
            log.info("Keystore is disabled, using in-memory key generation");
            return;
        }

        try {
            ensurePrivateKeyDirectoryExists();
            loadOrGenerateKeypair();
        } catch (Exception e) {
            log.error("Failed to initialize keystore, falling back to in-memory generation", e);
        }
    }

    @Override
    public KeyPair getActiveKeypair() {
        if (!isKeystoreEnabled() || currentKeyPair == null) {
            return generateRSAKeypair();
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

            PrivateKey privateKey = loadPrivateKey(keyId);
            PublicKey publicKey = decodePublicKey(signingKey.get().getSigningKey());

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
    public boolean isKeystoreEnabled() {
        return jwtProperties.isEnableKeystore();
    }

    private void loadOrGenerateKeypair() {
        Optional<JwtSigningKey> activeKey = repository.findByIsActiveTrue();

        if (activeKey.isPresent()) {
            try {
                currentKeyId = activeKey.get().getKeyId();
                PrivateKey privateKey = loadPrivateKey(currentKeyId);
                PublicKey publicKey = decodePublicKey(activeKey.get().getSigningKey());
                currentKeyPair = new KeyPair(publicKey, privateKey);
                log.info("Loaded existing keypair with keyId: {}", currentKeyId);
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
            KeyPair keyPair = generateRSAKeypair();
            String keyId = generateKeyId();

            storePrivateKey(keyId, keyPair.getPrivate());

            JwtSigningKey signingKey =
                    new JwtSigningKey(keyId, encodePublicKey(keyPair.getPublic()), "RS256");
            repository.save(signingKey);
            currentKeyPair = keyPair;
            currentKeyId = keyId;

            log.info("Generated and stored new keypair with keyId: {}", keyId);
        } catch (Exception e) {
            log.error("Failed to generate and store keypair", e);
            throw new RuntimeException("Keypair generation failed", e);
        }
    }

    private KeyPair generateRSAKeypair() {
        KeyPairGenerator keyPairGenerator = null;

        try {
            keyPairGenerator = KeyPairGenerator.getInstance("RSA");
            keyPairGenerator.initialize(2048);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Failed to initialize RSA key pair generator", e);
        }

        return keyPairGenerator.generateKeyPair();
    }

    private String generateKeyId() {
        return "jwt-key-"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmmss"));
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
        try {
            keyFile.toFile().setReadable(true, true);
            keyFile.toFile().setWritable(true, true);
            keyFile.toFile().setExecutable(false, false);
        } catch (Exception e) {
            log.warn("Failed to set permissions on private key file: {}", keyFile, e);
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
