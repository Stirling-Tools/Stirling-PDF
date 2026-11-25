package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.cert.Certificate;

import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.junit.jupiter.api.Test;

class CertSignSignatureReservationTest {

    private static Certificate certificateOfSize(int bytes) throws Exception {
        Certificate certificate = mock(Certificate.class);
        when(certificate.getEncoded()).thenReturn(new byte[bytes]);
        return certificate;
    }

    @Test
    void aShortChainKeepsTheDefaultReservation() throws Exception {
        assertEquals(
                SignatureOptions.DEFAULT_SIGNATURE_SIZE,
                CertSignController.signatureReservation(
                        new Certificate[] {certificateOfSize(1200)}));
        assertEquals(
                SignatureOptions.DEFAULT_SIGNATURE_SIZE,
                CertSignController.signatureReservation(null));
    }

    @Test
    void aLongChainGetsRoomForEveryCertificate() throws Exception {
        Certificate[] chain = {
            certificateOfSize(2500),
            certificateOfSize(2500),
            certificateOfSize(2500),
            certificateOfSize(2500)
        };
        assertTrue(CertSignController.signatureReservation(chain) > 10_000);
    }
}
