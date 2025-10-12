package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.spec.InvalidKeySpecException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import stirling.software.proprietary.security.model.JwtVerificationKey;

public interface KeyPersistenceServiceInterface {

    JwtVerificationKey getActiveKey();

    Optional<KeyPair> getKeyPair(String keyId);

    boolean isKeystoreEnabled();

    JwtVerificationKey refreshActiveKeyPair();

    List<JwtVerificationKey> getKeysEligibleForCleanup(LocalDateTime cutoffDate);

    void removeKey(String keyId);

    PublicKey decodePublicKey(String encodedKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException;
}
