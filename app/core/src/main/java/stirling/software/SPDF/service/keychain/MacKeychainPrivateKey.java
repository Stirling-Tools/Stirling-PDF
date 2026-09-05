package stirling.software.SPDF.service.keychain;

import java.security.PrivateKey;
import java.security.cert.X509Certificate;

/**
 * Non-exportable private key handle for macOS Keychain signing. Material never leaves the OS
 * keystore; {@link MacKeychainSignatureSpi} signs via the native helper.
 */
public final class MacKeychainPrivateKey implements PrivateKey {

    private static final long serialVersionUID = 1L;
    private static final String FORMAT = "MacKeychain";

    private final String identityHash;
    private final String algorithm;

    public MacKeychainPrivateKey(String identityHash, X509Certificate certificate) {
        this.identityHash = identityHash;
        this.algorithm = certificate.getPublicKey().getAlgorithm();
    }

    public String identityHash() {
        return identityHash;
    }

    @Override
    public String getAlgorithm() {
        return algorithm;
    }

    @Override
    public String getFormat() {
        return FORMAT;
    }

    @Override
    public byte[] getEncoded() {
        return null;
    }
}
