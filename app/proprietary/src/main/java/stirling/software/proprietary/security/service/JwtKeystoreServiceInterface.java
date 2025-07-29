package stirling.software.proprietary.security.service;

import java.security.KeyPair;
import java.util.Optional;

public interface JwtKeystoreServiceInterface {

    KeyPair getActiveKeypair();

    Optional<KeyPair> getKeypairByKeyId(String keyId);

    String getActiveKeyId();

    boolean isKeystoreEnabled();
}
