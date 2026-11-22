package stirling.software.SPDF.service.macos;

import java.lang.foreign.MemorySegment;
import java.security.PrivateKey;

/**
 * Handle to a keychain or token private key. It carries no key material: signing goes back through
 * Security.framework, which keeps the key on the card.
 */
final class MacKeychainPrivateKey implements PrivateKey {

    private final String algorithm;
    private final transient MemorySegment identity;

    MacKeychainPrivateKey(String algorithm, MemorySegment identity) {
        this.algorithm = algorithm;
        this.identity = identity;
    }

    MemorySegment identity() {
        return identity;
    }

    @Override
    public String getAlgorithm() {
        return algorithm;
    }

    @Override
    public String getFormat() {
        return null;
    }

    @Override
    public byte[] getEncoded() {
        return null;
    }
}
