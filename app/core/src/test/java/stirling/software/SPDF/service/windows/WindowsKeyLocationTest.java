package stirling.software.SPDF.service.windows;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.MessageDigest;
import java.security.cert.CertificateEncodingException;
import java.security.cert.X509Certificate;
import java.util.Locale;
import java.util.OptionalInt;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

class WindowsKeyLocationTest {

    private static final byte[] DER = {0x30, 0x03, 0x02, 0x01, 0x01};

    private static X509Certificate cert() throws Exception {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getEncoded()).thenReturn(DER);
        return cert;
    }

    @Test
    void removableKeyIsOnToken() throws Exception {
        assertTrue(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x8)));
        assertTrue(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x1 | 0x8)));
    }

    @Test
    void softwareOrFixedHardwareKeyIsOnThisDevice() throws Exception {
        assertFalse(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x2)));
        assertFalse(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x1)));
        assertFalse(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x1 | 0x10)));
    }

    @Test
    void implTypeWithoutLocationBitsIsUnknown() throws Exception {
        assertNull(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0)));
        assertNull(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x4)));
        assertNull(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.of(0x10)));
    }

    @Test
    void lookupFindingNothingIsUnknown() throws Exception {
        assertNull(WindowsKeyLocation.onToken(cert(), sha1 -> OptionalInt.empty()));
    }

    @Test
    void lookupFailureIsUnknown() throws Exception {
        assertNull(
                WindowsKeyLocation.onToken(
                        cert(),
                        sha1 -> {
                            throw new IllegalStateException("NTE_BAD_KEYSET");
                        }));
        assertNull(
                WindowsKeyLocation.onToken(
                        cert(),
                        sha1 -> {
                            throw new UnsatisfiedLinkError("ncrypt.dll");
                        }));
    }

    @Test
    void missingBindingsOrCertificateAreUnknown() throws Exception {
        assertNull(WindowsKeyLocation.onToken(cert(), null));
        assertNull(WindowsKeyLocation.onToken(null, sha1 -> OptionalInt.of(0x8)));
    }

    @Test
    void unencodableCertificateIsUnknown() throws Exception {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getEncoded()).thenThrow(new CertificateEncodingException("bad"));
        assertNull(WindowsKeyLocation.onToken(cert, sha1 -> OptionalInt.of(0x8)));
    }

    @Test
    void looksUpBySha1OfTheCertificateDer() throws Exception {
        AtomicReference<byte[]> seen = new AtomicReference<>();
        WindowsKeyLocation.onToken(
                cert(),
                sha1 -> {
                    seen.set(sha1);
                    return OptionalInt.of(0x2);
                });
        assertArrayEquals(MessageDigest.getInstance("SHA-1").digest(DER), seen.get());
        assertEquals(20, seen.get().length);
    }

    @Test
    void offWindowsIsUnknownWithoutTouchingNativeCode() throws Exception {
        assumeFalse(System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win"));
        assertNull(WindowsCrypto.get());
        assertNull(WindowsKeyLocation.isOnToken(cert()));
    }
}
