package stirling.software.proprietary.integration.crypto;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

public final class TestCredentialKey {

    private TestCredentialKey() {}

    public static void install() {
        try {
            KeyGenerator generator = KeyGenerator.getInstance("AES");
            generator.init(256);
            SecretKey key = generator.generateKey();
            CredentialEncryption.initialiseForTesting(key);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
