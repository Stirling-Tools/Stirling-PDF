package stirling.software.SPDF.service.windows;

import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.OptionalInt;

/** Whether a Windows certificate store key is held on a removable token or on this device. */
public final class WindowsKeyLocation {

    static final int IMPL_HARDWARE = 0x1;
    static final int IMPL_SOFTWARE = 0x2;
    static final int IMPL_REMOVABLE = 0x8;

    interface ImplTypeLookup {
        OptionalInt implType(byte[] sha1Thumbprint) throws Throwable;
    }

    private WindowsKeyLocation() {}

    /**
     * True for a key on a removable token (smart card, security key, TPM virtual smart card), false
     * for one held on this device, null when it cannot be told: not Windows, the certificate is not
     * in the current user's personal store, or any lookup step fails. Never prompts for a PIN.
     */
    public static Boolean isOnToken(X509Certificate cert) {
        return onToken(cert, WindowsCrypto.get());
    }

    static Boolean onToken(X509Certificate cert, ImplTypeLookup lookup) {
        if (cert == null || lookup == null) {
            return null;
        }
        try {
            byte[] thumbprint = MessageDigest.getInstance("SHA-1").digest(cert.getEncoded());
            OptionalInt implType = lookup.implType(thumbprint);
            return implType.isPresent() ? fromImplType(implType.getAsInt()) : null;
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * NCrypt's {@code NCRYPT_IMPL_*_FLAG} and CryptoAPI's {@code CRYPT_IMPL_*} share these bit
     * values. Anything without a hardware or software bit (CryptoAPI's {@code CRYPT_IMPL_UNKNOWN})
     * stays unknown rather than being read as on this device.
     */
    static Boolean fromImplType(int implType) {
        if ((implType & IMPL_REMOVABLE) != 0) {
            return true;
        }
        if ((implType & (IMPL_HARDWARE | IMPL_SOFTWARE)) != 0) {
            return false;
        }
        return null;
    }
}
