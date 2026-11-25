package stirling.software.SPDF.service.macos;

import java.security.Key;
import java.security.Provider;

/**
 * JCA provider for signing with macOS keychain and CryptoTokenKit identities. Register nothing
 * globally: callers pass it explicitly so it never shadows a software provider.
 */
public final class MacKeychainProvider extends Provider {

    public static final String NAME = "StirlingMacKeychain";
    public static final String KEYSTORE_TYPE = "MacKeychain";

    private static final MacKeychainProvider INSTANCE = new MacKeychainProvider();

    private MacKeychainProvider() {
        super(NAME, "1.0", "macOS keychain and smart card signing via Security.framework");
        String pkg = MacKeychainSignature.class.getName();
        put("KeyStore." + KEYSTORE_TYPE, MacKeychainKeyStore.class.getName());
        put("Signature.SHA256withRSA", pkg + "$Sha256WithRsa");
        put("Signature.SHA384withRSA", pkg + "$Sha384WithRsa");
        put("Signature.SHA512withRSA", pkg + "$Sha512WithRsa");
        put("Signature.SHA256withECDSA", pkg + "$Sha256WithEcdsa");
        put("Signature.SHA384withECDSA", pkg + "$Sha384WithEcdsa");
        put("Signature.SHA512withECDSA", pkg + "$Sha512WithEcdsa");
    }

    public static MacKeychainProvider get() {
        return INSTANCE;
    }

    /** Whether {@code key}, taken from this provider's keystore, lives on a token. */
    public static boolean isOnToken(Key key) {
        return key instanceof MacKeychainPrivateKey keychainKey && keychainKey.onToken();
    }

    /** True on macOS when Security.framework could be bound. */
    public static boolean isSupported() {
        return MacSecurity.get() != null;
    }
}
