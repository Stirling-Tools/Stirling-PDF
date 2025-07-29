package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.util.Optional;

public interface JwtKeystoreServiceInterface {

    KeyPair getActiveKeyPair();

    Optional<KeyPair> getKeyPairByKeyId(String keyId);

    String getActiveKeyId();

    boolean isKeystoreEnabled();

    KeyPair refreshKeyPairs();
}
