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
    private final boolean onToken;

    MacKeychainPrivateKey(String algorithm, MemorySegment identity, boolean onToken) {
        this.algorithm = algorithm;
        this.identity = identity;
        this.onToken = onToken;
    }

    MemorySegment identity() {
        return identity;
    }

    boolean onToken() {
        return onToken;
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
