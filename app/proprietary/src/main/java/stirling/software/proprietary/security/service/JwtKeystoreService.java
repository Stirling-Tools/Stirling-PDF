package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.util.Optional;

public interface JwtKeystoreService {

    KeyPair getActiveKeypair();

    Optional<KeyPair> getKeypairByKeyId(String keyId);

    String getActiveKeyId();

    void rotateKeypair();

    boolean isKeystoreEnabled();
}
